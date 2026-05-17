import { tasksDb, type Task } from '../db/tasks-db.js'
import { broadcast } from './websocket.js'
import {
  TASK_DISPATCH_MODE,
  dispatchTaskToGatewaySessions,
  type TaskDispatchTarget
} from './task-dispatch.js'
import { normalizeTaskStatus } from './task-state.js'

const TASK_DISPATCH_TIMEOUT_MS = Number(process.env.VIS_TASK_DISPATCH_TIMEOUT_MS || 90000)

export interface TaskDispatchAcceptance {
  task: Task
  mode: typeof TASK_DISPATCH_MODE
  totalAgents: number
  pending: string[]
}

export function publishTaskCreated(task: Task): void {
  broadcast('task:created', task, 'tasks')
}

export function publishTaskUpdated(task: Task | undefined): void {
  if (task) broadcast('task:updated', task, 'tasks')
}

export function publishTaskDeleted(id: string, task?: Task): void {
  if (task) broadcast('task:deleted', { id, task }, 'tasks')
}

async function dispatchTaskSessions(task: Task, agentsToStart: TaskDispatchTarget[]) {
  const result = await dispatchTaskToGatewaySessions(task, agentsToStart)
  const updatedTask = tasksDb.update(task.id, {
    status: result.sessionIds.length > 0 ? 'distributed' : 'failed',
    sessionIds: result.sessionIds,
    dispatchMode: result.mode,
    dispatchErrors: result.errors,
    dispatchedAt: new Date().toISOString()
  })
  publishTaskUpdated(updatedTask)

  console.log(`[Task Dispatch] Background gateway delivery finished: task=${task.id} sessions=${result.sessionIds.length} errors=${result.errors.length}`)
  return { task: updatedTask, sessionIds: result.sessionIds, errors: result.errors }
}

function startTaskDispatchInBackground(task: Task, agentsToStart: TaskDispatchTarget[]) {
  void dispatchTaskSessions(task, agentsToStart).catch((error: any) => {
    console.error(`[Task Dispatch] Background gateway delivery crashed for task ${task.id}:`, error.message)
    const updatedTask = tasksDb.update(task.id, {
      status: 'failed',
      sessionIds: [],
      dispatchMode: TASK_DISPATCH_MODE,
      dispatchErrors: [{ agentId: 'system', error: error.message || 'Task dispatch failed' }],
      dispatchedAt: new Date().toISOString()
    })
    publishTaskUpdated(updatedTask)
  })
}

function scheduleDispatchTimeout(taskId: string, dispatchStartedAt: number): void {
  if (!Number.isFinite(TASK_DISPATCH_TIMEOUT_MS) || TASK_DISPATCH_TIMEOUT_MS <= 0) return

  const timer = setTimeout(() => {
    const task = tasksDb.findById(taskId)
    if (!task || normalizeTaskStatus(task) !== 'dispatching') return

    const updatedAt = new Date(task.updatedAt || 0).getTime()
    if (Number.isFinite(updatedAt) && updatedAt > dispatchStartedAt) return

    const updatedTask = tasksDb.update(taskId, {
      status: 'failed',
      sessionIds: [],
      dispatchMode: TASK_DISPATCH_MODE,
      dispatchErrors: [{ agentId: 'system', error: 'Task dispatch timed out before sending to an OpenClaw session' }],
      dispatchedAt: new Date().toISOString()
    })
    publishTaskUpdated(updatedTask)
    console.warn(`[Task Dispatch] Timed out while sending task=${taskId}`)
  }, TASK_DISPATCH_TIMEOUT_MS)

  timer.unref?.()
}

export function acceptTaskDispatch(task: Task, agentsToStart: TaskDispatchTarget[]): TaskDispatchAcceptance {
  const dispatchStartedAt = Date.now()
  const acceptedTask = tasksDb.update(task.id, {
    status: 'dispatching',
    sessionIds: [],
    dispatchMode: TASK_DISPATCH_MODE,
    dispatchErrors: [],
    dispatchedAt: undefined
  }) || task

  publishTaskUpdated(acceptedTask)
  startTaskDispatchInBackground(acceptedTask, agentsToStart)
  scheduleDispatchTimeout(task.id, dispatchStartedAt)

  return {
    task: acceptedTask,
    mode: TASK_DISPATCH_MODE,
    totalAgents: agentsToStart.length,
    pending: agentsToStart.map(agent => agent.agentId)
  }
}
