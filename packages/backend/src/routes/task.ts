import { Router } from 'express'
import { taskDb, ScheduledConfig } from '../services/database.js'
import { sessions_spawn, sessions_list } from '../services/openclaw-cli.js'
import { createScheduledTask, deleteScheduledTask, triggerScheduledTask } from '../services/cron.js'

export const taskRouter = Router()

/**
 * 检查并更新任务状态
 * - running → completed: 所有关联会话都已结束
 * - running → failed: 启动失败或运行出错
 */
async function updateTaskStatus(task: any): Promise<any> {
  // 状态说明：
  // pending = 待分发：任务创建时的默认状态
  // distributed = 已分发：任务已启动，Agent 已收到任务
  // failed = 失败：启动失败
  // 不再自动更新状态，由用户手动控制
  return task
}

// 获取任务列表
taskRouter.get('/', async (_req, res) => {
  try {
    const tasks = taskDb.findAll()
    res.json(tasks)
  } catch (error: any) {
    console.error('[Task GET] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * 从文本中提取 @mentions
 * 支持格式: @agentName 或 @[agentId]
 */
function extractMentions(text: string): string[] {
  const mentions: string[] = []
  
  // 匹配 @agentName 格式（字母、数字、下划线、连字符）
  const simpleMentionRegex = /@([a-zA-Z0-9_-]+)/g
  let match
  while ((match = simpleMentionRegex.exec(text)) !== null) {
    mentions.push(match[1])
  }
  
  // 匹配 @[agentId] 格式（支持包含其他字符的 ID）
  const bracketMentionRegex = /@\[([^\]]+)\]/g
  while ((match = bracketMentionRegex.exec(text)) !== null) {
    mentions.push(match[1])
  }
  
  // 去重
  return [...new Set(mentions)]
}

// 创建任务
taskRouter.post('/', async (req, res) => {
  try {
    const { name, description, collaborationMode, agents } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Name is required' })
    }

    // 从 description 中提取 @mentions
    const mentionedAgents = extractMentions(description || '')
    
    // 确定最终的 agents 列表：优先使用 @mentions，其次使用传入的 agents
    let finalAgents = agents
    if (mentionedAgents.length > 0) {
      finalAgents = mentionedAgents.map((agentId: string) => ({
        agentId,
        role: 'primary'
      }))
      console.log(`[Task POST] Extracted @mentions from description: ${mentionedAgents.join(', ')}`)
    }

    const task = taskDb.create({
      name,
      description,
      collaborationMode,
      agents: finalAgents
    })

    res.status(201).json(task)
  } catch (error: any) {
    console.error('[Task POST] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 更新任务
taskRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, collaborationMode, status, agents, sessionIds } = req.body

    const task = taskDb.update(id, {
      name,
      description,
      collaborationMode,
      status,
      agents,
      sessionIds
    })

    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    res.json(task)
  } catch (error: any) {
    console.error('[Task PUT] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 删除任务
taskRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    taskDb.delete(id)
    res.status(204).send()
  } catch (error: any) {
    console.error('[Task DELETE] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 启动任务
taskRouter.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params
    const task = taskDb.findById(id)

    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    // 状态检查
    if (task.status === 'distributed') {
      return res.status(400).json({ error: 'Task is already distributed' })
    }

    // 从 description 中提取 @mentions
    const mentionedAgents = extractMentions(task.description || '')
    
    // 确定要启动的 agent 列表
    // 优先使用 @mentions，如果没有则回退到 task.agents
    let agentsToStart: { agentId: string; instructions?: string }[] = []
    
    if (mentionedAgents.length > 0) {
      // 使用 @mentions
      console.log(`[Task Start] Found mentions in description: ${mentionedAgents.join(', ')}`)
      agentsToStart = mentionedAgents.map(agentId => ({
        agentId,
        instructions: task.description
      }))
    } else if (task.agents && task.agents.length > 0) {
      // 回退到 task.agents
      console.log('[Task Start] No mentions found, using task.agents')
      agentsToStart = task.agents.map(a => ({
        agentId: a.agentId,
        instructions: a.instructions
      }))
    } else {
      return res.status(400).json({ error: 'No agents specified in task (no @mentions and task.agents is empty)' })
    }

    // 根据协作模式启动会话
    const sessionIds: string[] = []
    const errors: { agentId: string; error: string }[] = []

    if (task.collaborationMode === 'sequential') {
      // 顺序执行：依次创建会话
      for (const agentConfig of agentsToStart) {
        try {
          const message = agentConfig.instructions || `执行任务: ${task.name}\n\n描述: ${task.description || '无'}`
          console.log(`[Task Start] Spawning session for agent: ${agentConfig.agentId}`)
          
          const result = await sessions_spawn({
            agentId: agentConfig.agentId,
            task: task.name,
            message
          })
          sessionIds.push(result.sessionKey)
          console.log(`[Task Start] Session created: ${result.sessionKey}`)
        } catch (err: any) {
          console.error(`[Task Start] Failed to spawn agent ${agentConfig.agentId}:`, err.message)
          errors.push({ agentId: agentConfig.agentId, error: err.message })
        }
      }
    } else if (task.collaborationMode === 'parallel') {
      // 并行执行：同时创建多个会话
      const promises = agentsToStart.map(async (agentConfig) => {
        try {
          const message = agentConfig.instructions || `并行执行任务: ${task.name}\n\n描述: ${task.description || '无'}`
          console.log(`[Task Start] Spawning session for agent: ${agentConfig.agentId}`)
          
          const result = await sessions_spawn({
            agentId: agentConfig.agentId,
            task: task.name,
            message
          })
          console.log(`[Task Start] Session created: ${result.sessionKey}`)
          return { sessionKey: result.sessionKey, error: null }
        } catch (err: any) {
          console.error(`[Task Start] Failed to spawn agent ${agentConfig.agentId}:`, err.message)
          return { sessionKey: null, error: { agentId: agentConfig.agentId, error: err.message } }
        }
      })
      
      const results = await Promise.all(promises)
      for (const r of results) {
        if (r.sessionKey) {
          sessionIds.push(r.sessionKey)
        } else if (r.error) {
          errors.push(r.error)
        }
      }
    }

    // 更新任务状态和会话 ID
    const updatedTask = taskDb.update(id, {
      status: sessionIds.length > 0 ? 'distributed' : 'failed',
      sessionIds
    })

    // 返回结果，包含可能的错误信息
    res.json({
      ...updatedTask,
      _startResult: {
        totalAgents: agentsToStart.length,
        successfulSessions: sessionIds.length,
        errors: errors.length > 0 ? errors : undefined
      }
    })
  } catch (error: any) {
    console.error('[Task POST :id/start] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 暂停任务
taskRouter.post('/:id/pause', async (req, res) => {
  try {
    const { id } = req.params

    const task = taskDb.update(id, { status: 'paused' })

    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    res.json(task)
  } catch (error: any) {
    console.error('[Task POST :id/pause] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 设置定时配置
taskRouter.put('/:id/schedule', async (req, res) => {
  try {
    const { id } = req.params
    const config: ScheduledConfig = req.body

    // 验证配置
    if (!config.mode) {
      return res.status(400).json({ error: 'Mode is required (interval or fixed)' })
    }

    if (config.mode === 'interval' && (!config.interval?.value || !config.interval?.unit)) {
      return res.status(400).json({ error: 'Interval value and unit are required for interval mode' })
    }

    if (config.mode === 'fixed' && !config.fixedTime) {
      return res.status(400).json({ error: 'Fixed time is required for fixed mode' })
    }

    // 验证时间格式 (HH:MM)
    if (config.mode === 'fixed') {
      const timeMatch = config.fixedTime.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/)
      if (!timeMatch) {
        return res.status(400).json({ error: 'Invalid time format, use HH:MM (e.g., 09:30)' })
      }
    }

    const task = taskDb.findById(id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    // 如果启用定时，创建 cron job
    if (config.enabled) {
      const result = await createScheduledTask(id, config)
      if (!result.success) {
        return res.status(500).json({ error: result.error || 'Failed to create scheduled task' })
      }
      
      // 返回更新后的任务
      const updatedTask = taskDb.findById(id)
      res.json(updatedTask)
    } else {
      // 如果禁用定时，更新配置但不创建 cron job
      const updatedTask = taskDb.setSchedule(id, { ...config, enabled: false })
      res.json(updatedTask)
    }
  } catch (error: any) {
    console.error('[Task PUT :id/schedule] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 取消定时配置
taskRouter.delete('/:id/schedule', async (req, res) => {
  try {
    const { id } = req.params

    const task = taskDb.findById(id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    // 如果有定时配置，删除 cron job
    if (task.scheduledConfig?.cronId) {
      const result = await deleteScheduledTask(id)
      if (!result.success) {
        console.warn('[Task DELETE :id/schedule] Failed to delete cron job:', result.error)
      }
    } else {
      // 直接清除配置
      taskDb.clearSchedule(id)
    }

    const updatedTask = taskDb.findById(id)
    res.json(updatedTask)
  } catch (error: any) {
    console.error('[Task DELETE :id/schedule] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 手动触发定时任务（用于测试）
taskRouter.post('/:id/trigger', async (req, res) => {
  try {
    const { id } = req.params

    const result = await triggerScheduledTask(id)
    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to trigger task' })
    }

    const updatedTask = taskDb.findById(id)
    res.json({
      ...updatedTask,
      _triggerResult: result
    })
  } catch (error: any) {
    console.error('[Task POST :id/trigger] Error:', error)
    res.status(500).json({ error: error.message })
  }
})