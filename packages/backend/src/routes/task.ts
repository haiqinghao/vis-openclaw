import { Router } from 'express'
import { tasksDb } from '../db/tasks-db.js'
import type { ScheduledConfig } from '../db/tasks-db.js'
import { createScheduledTask, deleteScheduledTask, triggerScheduledTask } from '../services/cron.js'
import {
  extractTaskMentions,
  getTaskDispatchTargets
} from '../services/task-dispatch.js'
import {
  acceptTaskDispatch,
  publishTaskCreated,
  publishTaskDeleted,
  publishTaskUpdated
} from '../services/task-execution.js'
import {
  buildEditableTaskPatch,
  canPauseTask,
  canScheduleTask,
  canStartTask,
  normalizeTaskStatus
} from '../services/task-state.js'

export const taskRouter = Router()

function getTaskStatus(task: any): string {
  return normalizeTaskStatus(task)
}

// Task state is advanced by dispatch acceptance and the OpenClaw status bridge.

// 获取任务列表
taskRouter.get('/', async (_req, res) => {
  try {
    const tasks = tasksDb.findAll()
    res.json(tasks)
  } catch (error: any) {
    console.error('[Task GET] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

taskRouter.post('/', async (req, res) => {
  try {
    const { name, description, collaborationMode, agents, avatarType } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Name is required' })
    }

    if (avatarType !== undefined && avatarType !== 'sheep' && avatarType !== 'gold') {
      return res.status(400).json({ error: 'avatarType must be "sheep" or "gold"' })
    }

    // 从 description 中提取 @mentions
    const mentionedAgents = extractTaskMentions(description || '')

    // 确定最终的 agents 列表：优先使用 @mentions，其次使用传入的 agents
    let finalAgents = agents
    if (mentionedAgents.length > 0) {
      finalAgents = mentionedAgents.map((agentId: string) => ({
        agentId,
        role: 'primary'
      }))
      console.log(`[Task POST] Extracted @mentions from description: ${mentionedAgents.join(', ')}`)
    }

    const task = tasksDb.create({
      name,
      description,
      collaborationMode,
      agents: finalAgents,
      avatarType: avatarType || 'sheep'
    })

    publishTaskCreated(task)
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
    const existingTask = tasksDb.findById(id)

    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' })
    }

    const patchResult = buildEditableTaskPatch(req.body || {})
    if (!patchResult.ok) {
      return res.status(409).json({ error: patchResult.error })
    }

    const task = tasksDb.update(id, patchResult.patch || {})
    publishTaskUpdated(task)
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
    const task = tasksDb.findById(id)
    tasksDb.delete(id)
    publishTaskDeleted(id, task)
    res.status(204).send()
  } catch (error: any) {
    console.error('[Task DELETE] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 启动任务
// Start task dispatch without blocking the HTTP request on agent startup.
taskRouter.post('/:id/start', async (req, res) => {
  try {
    const { id } = req.params
    const task = tasksDb.findById(id)

    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    const taskStatus = getTaskStatus(task)
    if (!canStartTask(taskStatus)) {
      return res.status(409).json({
        error: `Task cannot be started from status "${taskStatus}"`
      })
    }

    const agentsToStart = getTaskDispatchTargets(task)
    if (agentsToStart.length === 0) {
      return res.status(400).json({ error: 'No agents specified in task (no @mentions and task.agents is empty)' })
    }

    const acceptance = acceptTaskDispatch(task, agentsToStart)

    return res.status(202).json({
      ...acceptance.task,
      _startResult: {
        accepted: true,
        mode: acceptance.mode,
        totalAgents: acceptance.totalAgents,
        successfulSessions: 0,
        pending: acceptance.pending
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

    const task = tasksDb.findById(id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    const taskStatus = getTaskStatus(task)
    if (!canPauseTask(taskStatus)) {
      return res.status(409).json({
        error: `Task cannot be paused from status "${taskStatus}". Once dispatch starts, pause is no longer available.`
      })
    }

    const updatedTask = tasksDb.update(id, { status: 'paused' })
    publishTaskUpdated(updatedTask)

    res.json(updatedTask)
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
      const timeMatch = config.fixedTime!.match(/^([01]?[0-9]|2[0-3]):([0-5][0-9])$/)
      if (!timeMatch) {
        return res.status(400).json({ error: 'Invalid time format, use HH:MM (e.g., 09:30)' })
      }
    }

    const task = tasksDb.findById(id)
    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    const taskStatus = getTaskStatus(task)
    if (config.enabled && !canScheduleTask(taskStatus)) {
      return res.status(409).json({
        error: `Task cannot be scheduled from status "${taskStatus}"`
      })
    }

    // 如果启用定时，创建 cron job
    if (config.enabled) {
      const result = await createScheduledTask(id, config)
      if (!result.success) {
        return res.status(500).json({ error: result.error || 'Failed to create scheduled task' })
      }

      // 返回更新后的任务
      const updatedTask = tasksDb.findById(id)
      publishTaskUpdated(updatedTask)
      res.json(updatedTask)
    } else {
      // 如果禁用定时，更新配置但不创建 cron job
      const updatedTask = tasksDb.setSchedule(id, { ...config, enabled: false })
      publishTaskUpdated(updatedTask)
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

    const task = tasksDb.findById(id)
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
      tasksDb.clearSchedule(id)
    }

    const updatedTask = tasksDb.findById(id)
    publishTaskUpdated(updatedTask)
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

    const updatedTask = tasksDb.findById(id)
    res.json({
      ...updatedTask,
      _triggerResult: result
    })
  } catch (error: any) {
    console.error('[Task POST :id/trigger] Error:', error)
    res.status(500).json({ error: error.message })
  }
})
