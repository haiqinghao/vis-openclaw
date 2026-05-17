import { tasksDb } from '../db/tasks-db.js'
import type { ScheduledConfig } from '../db/tasks-db.js'
import { runOpenClawCli } from './openclaw-command.js'
import { broadcast } from './websocket.js'
import { TASK_DISPATCH_MODE, dispatchTaskToGatewaySessions, getTaskDispatchTargets } from './task-dispatch.js'

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
    if (!Number.isInteger(value) || value <= 0) {
      return ''
    }
    if (unit === 'minutes') {
      if (value > 59) return ''
      // 每 N 分钟执行: */N * * * *
      return `*/${value} * * * *`
    } else if (unit === 'hours') {
      if (value > 23) return ''
      // 每 N 小时执行: 0 */N * * *
      return `0 */${value} * * *`
    }
  } else if (config.mode === 'fixed') {
    // 定点执行: 每天 HH:MM
    const [hours, minutes] = config.fixedTime!.split(':').map(Number)
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return ''
    }
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
async function callOpenClawCli(args: string[], timeoutMs: number = 30000): Promise<string> {
  const output = await runOpenClawCli(args, {
    timeoutMs,
    maxBuffer: 1024 * 1024,
    logPrefix: 'Cron Service'
  })
  return output || ''
}

/**
 * 创建定时任务
 * 使用 OpenClaw 的 gateway config cron 命令
 */
export async function createScheduledTask(taskId: string, config: ScheduledConfig): Promise<{ success: boolean; cronId?: string; error?: string }> {
  try {
    const task = tasksDb.findById(taskId)
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
    const result = await callOpenClawCli([
      'gateway',
      'config',
      'cron',
      'add',
      cronId,
      cronExpr,
      command
    ])

    console.log(`[Cron Service] Cron job created: ${result}`)

    // 计算下次运行时间
    const nextRun = calculateNextRun(config)

    // 更新任务配置
    const updatedConfig: ScheduledConfig = {
      ...config,
      cronId,
      nextRun
    }

    tasksDb.setSchedule(taskId, updatedConfig)

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
    const task = tasksDb.findById(taskId)
    if (!task || !task.scheduledConfig?.cronId) {
      return { success: false, error: 'No scheduled config found' }
    }

    const cronId = task.scheduledConfig.cronId

    console.log(`[Cron Service] Deleting cron job: ${cronId}`)

    // 调用 OpenClaw CLI 删除 cron job
    const result = await callOpenClawCli([
      'gateway',
      'config',
      'cron',
      'remove',
      cronId
    ])

    console.log(`[Cron Service] Cron job deleted: ${result}`)

    // 清除任务的定时配置
    tasksDb.clearSchedule(taskId)

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
    const task = tasksDb.findById(taskId)
    if (!task) {
      return { success: false, error: 'Task not found' }
    }

    console.log(`[Cron Service] Triggering task: ${task.name}`)

    const agentsToStart = getTaskDispatchTargets(task)
    if (agentsToStart.length === 0) {
      return { success: false, error: 'No agents specified in task' }
    }

    const dispatchingTask = tasksDb.update(taskId, {
      status: 'dispatching',
      sessionIds: [],
      dispatchMode: TASK_DISPATCH_MODE,
      dispatchErrors: [],
      dispatchedAt: undefined
    })
    if (dispatchingTask) broadcast('task:updated', dispatchingTask, 'tasks')

    const result = await dispatchTaskToGatewaySessions(dispatchingTask || task, agentsToStart)


    // 更新任务状态
    const now = new Date().toISOString()
    const nextRun = task.scheduledConfig ? calculateNextRun(task.scheduledConfig) : undefined

    const updatedTask = tasksDb.update(taskId, {
      status: result.sessionIds.length > 0 ? 'distributed' : 'failed',
      sessionIds: result.sessionIds,
      dispatchMode: result.mode,
      dispatchErrors: result.errors,
      dispatchedAt: now
    })
    if (updatedTask) broadcast('task:updated', updatedTask, 'tasks')
    tasksDb.updateScheduleRun(taskId, now, nextRun)

    console.log(`[Cron Service] Task trigger sent to ${result.sessionIds.length} existing session(s)`)

    return {
      success: result.sessionIds.length > 0,
      error: result.errors.length > 0 ? result.errors.map(e => e.error).join('; ') : undefined
    }
  } catch (error: any) {
    console.error('[Cron Service] Trigger error:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * 获取所有活跃的定时任务
 */
export function getActiveScheduledTasks(): { taskId: string; config: ScheduledConfig }[] {
  const tasks = tasksDb.findAll()
  return tasks
    .filter(t => t.scheduledConfig?.enabled)
    .map(t => ({
      taskId: t.id,
      config: t.scheduledConfig!
    }))
}
