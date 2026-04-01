import { exec } from 'child_process'
import { promisify } from 'util'
import { taskDb, ScheduledConfig } from './database.js'
import { sessions_spawn } from './openclaw-cli.js'

const execAsync = promisify(exec)

/**
 * Cron 服务 - 管理 OpenClaw 定时任务
 */

// 生成 cron 表达式
function generateCronExpression(config: ScheduledConfig): string {
  if (!config.enabled) {
    return ''
  }

  if (config.mode === 'interval') {
    const { value, unit } = config.interval!
    if (unit === 'minutes') {
      // 每 N 分钟执行: */N * * * *
      return `*/${value} * * * *`
    } else if (unit === 'hours') {
      // 每 N 小时执行: 0 */N * * *
      return `0 */${value} * * *`
    }
  } else if (config.mode === 'fixed') {
    // 定点执行: 每天 HH:MM
    const [hours, minutes] = config.fixedTime!.split(':').map(Number)
    return `${minutes} ${hours} * * *`
  }

  return ''
}

// 计算下次运行时间
function calculateNextRun(config: ScheduledConfig): string {
  const now = new Date()
  
  if (config.mode === 'interval') {
    const { value, unit } = config.interval!
    if (unit === 'minutes') {
      now.setMinutes(now.getMinutes() + value)
    } else if (unit === 'hours') {
      now.setHours(now.getHours() + value)
    }
  } else if (config.mode === 'fixed') {
    const [hours, minutes] = config.fixedTime!.split(':').map(Number)
    now.setHours(hours, minutes, 0, 0)
    // 如果时间已过，设置为明天
    if (now <= new Date()) {
      now.setDate(now.getDate() + 1)
    }
  }
  
  return now.toISOString()
}

/**
 * 调用 OpenClaw CLI 的封装
 */
async function callOpenClawCli(args: string, timeoutMs: number = 30000): Promise<string> {
  try {
    console.log(`[Cron Service] Running: openclaw ${args}`)
    const { stdout, stderr } = await execAsync(`openclaw ${args}`, { 
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024
    })
    
    if (stdout && stdout.trim()) {
      return stdout
    }
    if (stderr && stderr.trim()) {
      return stderr
    }
    return ''
  } catch (error: any) {
    console.error('[Cron Service] CLI Error:', error.message)
    if (error.stdout) return error.stdout
    if (error.stderr) return error.stderr
    throw error
  }
}

/**
 * 创建定时任务
 * 使用 OpenClaw 的 gateway config cron 命令
 */
export async function createScheduledTask(taskId: string, config: ScheduledConfig): Promise<{ success: boolean; cronId?: string; error?: string }> {
  try {
    const task = taskDb.findById(taskId)
    if (!task) {
      return { success: false, error: 'Task not found' }
    }

    const cronExpr = generateCronExpression(config)
    if (!cronExpr) {
      return { success: false, error: 'Invalid schedule configuration' }
    }

    // 生成 cron job ID
    const cronId = `task-${taskId}`

    // 构建 cron 配置命令
    // OpenClaw 使用 gateway config 来管理 cron jobs
    // 格式: openclaw gateway config cron add <id> <schedule> <command>
    const command = `task-trigger ${taskId}`
    
    console.log(`[Cron Service] Creating cron job: ${cronId} with schedule: ${cronExpr}`)
    
    // 调用 OpenClaw CLI 添加 cron job
    // 使用 gateway call 来添加定时任务
    const result = await callOpenClawCli(`gateway config cron add "${cronId}" "${cronExpr}" "${command}"`)
    
    console.log(`[Cron Service] Cron job created: ${result}`)

    // 计算下次运行时间
    const nextRun = calculateNextRun(config)

    // 更新任务配置
    const updatedConfig: ScheduledConfig = {
      ...config,
      cronId,
      nextRun
    }
    
    taskDb.setSchedule(taskId, updatedConfig)

    return { success: true, cronId }
  } catch (error: any) {
    console.error('[Cron Service] Create error:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * 删除定时任务
 */
export async function deleteScheduledTask(taskId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const task = taskDb.findById(taskId)
    if (!task || !task.scheduledConfig?.cronId) {
      return { success: false, error: 'No scheduled config found' }
    }

    const cronId = task.scheduledConfig.cronId
    
    console.log(`[Cron Service] Deleting cron job: ${cronId}`)
    
    // 调用 OpenClaw CLI 删除 cron job
    const result = await callOpenClawCli(`gateway config cron remove "${cronId}"`)
    
    console.log(`[Cron Service] Cron job deleted: ${result}`)

    // 清除任务的定时配置
    taskDb.clearSchedule(taskId)

    return { success: true }
  } catch (error: any) {
    console.error('[Cron Service] Delete error:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * 触发定时任务执行
 * 当 cron job 触发时调用此函数
 */
export async function triggerScheduledTask(taskId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const task = taskDb.findById(taskId)
    if (!task) {
      return { success: false, error: 'Task not found' }
    }

    console.log(`[Cron Service] Triggering task: ${task.name}`)

    // 从 description 中提取 @mentions
    const mentionedAgents = extractMentions(task.description || '')
    
    // 确定要启动的 agent 列表
    let agentsToStart: { agentId: string; instructions?: string }[] = []
    
    if (mentionedAgents.length > 0) {
      agentsToStart = mentionedAgents.map(agentId => ({
        agentId,
        instructions: task.description
      }))
    } else if (task.agents && task.agents.length > 0) {
      agentsToStart = task.agents.map(a => ({
        agentId: a.agentId,
        instructions: a.instructions
      }))
    } else {
      return { success: false, error: 'No agents specified in task' }
    }

    // 启动任务（与 task.ts 中的 startTask 类似）
    const sessionIds: string[] = []
    const errors: { agentId: string; error: string }[] = []

    for (const agentConfig of agentsToStart) {
      try {
        const message = agentConfig.instructions || `执行定时任务: ${task.name}\n\n描述: ${task.description || '无'}`
        console.log(`[Cron Service] Spawning session for agent: ${agentConfig.agentId}`)
        
        const result = await sessions_spawn({
          agentId: agentConfig.agentId,
          task: task.name,
          message
        })
        sessionIds.push(result.sessionKey)
        console.log(`[Cron Service] Session created: ${result.sessionKey}`)
      } catch (err: any) {
        console.error(`[Cron Service] Failed to spawn agent ${agentConfig.agentId}:`, err.message)
        errors.push({ agentId: agentConfig.agentId, error: err.message })
      }
    }

    // 更新任务状态
    const now = new Date().toISOString()
    const nextRun = task.scheduledConfig ? calculateNextRun(task.scheduledConfig) : undefined
    
    taskDb.update(taskId, {
      status: sessionIds.length > 0 ? 'running' : 'failed',
      sessionIds
    })
    taskDb.updateScheduleRun(taskId, now, nextRun)

    console.log(`[Cron Service] Task triggered successfully, ${sessionIds.length} sessions started`)

    return { 
      success: sessionIds.length > 0,
      error: errors.length > 0 ? errors.map(e => e.error).join('; ') : undefined
    }
  } catch (error: any) {
    console.error('[Cron Service] Trigger error:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * 从文本中提取 @mentions
 */
function extractMentions(text: string): string[] {
  const mentions: string[] = []
  
  // 匹配 @agentName 格式
  const simpleMentionRegex = /@([a-zA-Z0-9_-]+)/g
  let match
  while ((match = simpleMentionRegex.exec(text)) !== null) {
    mentions.push(match[1])
  }
  
  // 匹配 @[agentId] 格式
  const bracketMentionRegex = /@\[([^\]]+)\]/g
  while ((match = bracketMentionRegex.exec(text)) !== null) {
    mentions.push(match[1])
  }
  
  return [...new Set(mentions)]
}

/**
 * 获取所有活跃的定时任务
 */
export function getActiveScheduledTasks(): { taskId: string; config: ScheduledConfig }[] {
  const tasks = taskDb.findAll()
  return tasks
    .filter(t => t.scheduledConfig?.enabled)
    .map(t => ({
      taskId: t.id,
      config: t.scheduledConfig!
    }))
}