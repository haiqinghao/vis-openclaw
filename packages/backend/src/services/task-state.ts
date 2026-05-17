import type { Task, TaskAgent } from '../db/tasks-db.js'

export const TASK_STATUSES = [
  'pending',
  'paused',
  'scheduled',
  'dispatching',
  'distributed',
  'running',
  'completed',
  'failed',
  'stale'
] as const

export type TaskStatus = typeof TASK_STATUSES[number]

const TASK_STATUS_SET = new Set<string>(TASK_STATUSES)
const STARTABLE_TASK_STATUSES = new Set<TaskStatus>(['pending', 'paused', 'failed', 'stale'])
const PAUSABLE_TASK_STATUSES = new Set<TaskStatus>(['pending'])
const SCHEDULABLE_TASK_STATUSES = new Set<TaskStatus>(['pending', 'paused', 'scheduled', 'failed', 'stale'])
const CONTROLLED_TASK_FIELDS = new Set([
  'status',
  'sessionIds',
  'dispatchMode',
  'dispatchErrors',
  'dispatchedAt',
  'scheduledConfig'
])

export interface TaskEditablePatch {
  name?: string
  description?: string
  collaborationMode?: string
  agents?: TaskAgent[]
  avatarType?: 'sheep' | 'gold'
}

export interface TaskPatchResult {
  ok: boolean
  patch?: TaskEditablePatch
  error?: string
}

export function normalizeTaskStatus(taskOrStatus: Pick<Task, 'status'> | string | null | undefined): TaskStatus {
  const status = typeof taskOrStatus === 'string' ? taskOrStatus : taskOrStatus?.status
  return typeof status === 'string' && TASK_STATUS_SET.has(status)
    ? status as TaskStatus
    : 'pending'
}

export function canStartTask(status: string | null | undefined): boolean {
  return STARTABLE_TASK_STATUSES.has(normalizeTaskStatus(status))
}

export function canPauseTask(status: string | null | undefined): boolean {
  return PAUSABLE_TASK_STATUSES.has(normalizeTaskStatus(status))
}

export function canScheduleTask(status: string | null | undefined): boolean {
  return SCHEDULABLE_TASK_STATUSES.has(normalizeTaskStatus(status))
}

export function buildEditableTaskPatch(body: Record<string, unknown>): TaskPatchResult {
  const controlledFields = Object.keys(body).filter(key => CONTROLLED_TASK_FIELDS.has(key))
  if (controlledFields.length > 0) {
    return {
      ok: false,
      error: `Task runtime fields are controlled by the dispatch/state bridge: ${controlledFields.join(', ')}`
    }
  }

  const patch: TaskEditablePatch = {}

  if (body.name !== undefined) patch.name = String(body.name)
  if (body.description !== undefined) patch.description = String(body.description)
  if (body.collaborationMode !== undefined) patch.collaborationMode = String(body.collaborationMode)
  if (body.avatarType !== undefined) {
    if (body.avatarType !== 'sheep' && body.avatarType !== 'gold') {
      return { ok: false, error: 'avatarType must be "sheep" or "gold"' }
    }
    patch.avatarType = body.avatarType
  }
  if (body.agents !== undefined) {
    if (!Array.isArray(body.agents)) return { ok: false, error: 'agents must be an array' }
    patch.agents = body.agents as TaskAgent[]
  }

  return { ok: true, patch }
}
