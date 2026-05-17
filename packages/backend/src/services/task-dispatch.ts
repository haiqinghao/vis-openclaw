import type { Task } from '../db/tasks-db.js'
import { agents_list } from './openclaw-cli.js'
import {
  OpenClawGatewayPermissionPendingError,
  listGatewaySessions,
  sendGatewaySessionMessage
} from './openclaw-gateway-rpc.js'

export const TASK_BIND_MODE = 'bind-existing-session' as const
export const TASK_DISPATCH_MODE = 'gateway-session-send' as const

export interface TaskDispatchTarget {
  agentId: string
  role?: string
  instructions?: string
}

export interface TaskDispatchError {
  agentId: string
  error: string
  code?: string
  requestId?: string
}

export interface TaskDispatchResult {
  mode: typeof TASK_DISPATCH_MODE
  sessionIds: string[]
  errors: TaskDispatchError[]
  totalAgents: number
  deliveries: TaskDispatchDelivery[]
}

export interface TaskSessionBinding {
  agentId: string
  requestedAgentId: string
  sessionKey: string
  role?: string
  instructions?: string
}

export interface TaskBindResult {
  mode: typeof TASK_BIND_MODE
  sessionIds: string[]
  errors: TaskDispatchError[]
  totalAgents: number
  bindings: TaskSessionBinding[]
}

export interface TaskDispatchDelivery {
  agentId: string
  sessionKey: string
  runId?: string
  status?: string
  messageSeq?: number
}

export function extractTaskMentions(text: string): string[] {
  const mentions: string[] = []
  const seen = new Set<string>()

  const addMention = (value: string | undefined) => {
    const mention = String(value || '').trim()
    if (!mention || seen.has(mention)) return
    seen.add(mention)
    mentions.push(mention)
  }

  const mentionRegex = /@\[([^\]]+)\]|@([a-zA-Z0-9_-]+)/g
  let match
  while ((match = mentionRegex.exec(text)) !== null) {
    if (match[1]) {
      addMention(match[1])
      continue
    }

    const mentionStart = match.index
    const mentionEnd = mentionStart + match[0].length
    const previousChar = text[mentionStart - 1] || ''
    const nextChar = text[mentionEnd] || ''
    const nextNextChar = text[mentionEnd + 1] || ''

    if (/[a-zA-Z0-9_.-]/.test(previousChar)) continue
    if (nextChar === '/') continue
    if (nextChar === '.' && /[a-zA-Z0-9_-]/.test(nextNextChar)) continue

    addMention(match[2])
  }

  return mentions
}

export function getTaskDispatchTargets(task: Pick<Task, 'description' | 'agents'>): TaskDispatchTarget[] {
  const mentionedAgents = extractTaskMentions(task.description || '')

  if (mentionedAgents.length > 0) {
    console.log(`[Task Dispatch] Found mentions in description: ${mentionedAgents.join(', ')}`)
    return mentionedAgents.map(agentId => ({
      agentId,
      instructions: task.description
    }))
  }

  if (Array.isArray(task.agents) && task.agents.length > 0) {
    console.log('[Task Dispatch] No mentions found, using task.agents')
    return task.agents.map((agent: any) => ({
      agentId: agent.agentId,
      role: agent.role,
      instructions: agent.instructions
    }))
  }

  return []
}

function resolveConfiguredAgent(rawAgentId: string, configuredAgents: any[]): any | undefined {
  const normalized = String(rawAgentId || '').trim()
  if (!normalized) return undefined

  const lower = normalized.toLowerCase()
  return configuredAgents.find((agent: any) => {
    const id = String(agent?.id || '').trim()
    const name = String(agent?.name || '').trim()
    return id === normalized || name === normalized || id.toLowerCase() === lower || name.toLowerCase() === lower
  })
}

function getSessionRef(session: any): string | null {
  if (typeof session?.key === 'string' && session.key.trim()) return session.key
  if (typeof session?.sessionId === 'string' && session.sessionId.trim()) return session.sessionId
  return null
}

function getSessionAgentId(session: any): string | null {
  if (typeof session?.agentId === 'string' && session.agentId.trim()) return session.agentId

  const key = typeof session?.key === 'string' ? session.key.trim() : ''
  const match = key.match(/^agent:([^:]+):/)
  return match?.[1] || null
}

function findAgentDispatchSession(agentId: string, sessions: any[]): any | undefined {
  const candidates = sessions
    .filter((session: any) => getSessionAgentId(session) === agentId && getSessionRef(session))
    .sort((a: any, b: any) => Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0))

  return candidates.find((session: any) => session.key === `agent:${agentId}:main`)
    ?? candidates.find((session: any) => session.kind === 'direct')
    ?? candidates[0]
}

export async function bindTaskToExistingSessions(targets: TaskDispatchTarget[]): Promise<TaskBindResult> {
  const configuredAgents = await agents_list()
  const sessions = await listGatewaySessions()
  const sessionIds: string[] = []
  const errors: TaskDispatchError[] = []
  const bindings: TaskSessionBinding[] = []
  const seenAgents = new Set<string>()

  for (const target of targets) {
    const configuredAgent = resolveConfiguredAgent(target.agentId, configuredAgents)
    if (!configuredAgent?.id) {
      const error = `Agent "${target.agentId}" is not configured in OpenClaw`
      console.error(`[Task Dispatch] ${error}`)
      errors.push({ agentId: target.agentId, error })
      continue
    }

    const agentId = configuredAgent.id
    if (seenAgents.has(agentId)) continue
    seenAgents.add(agentId)

    const session = findAgentDispatchSession(agentId, sessions)
    const sessionRef = getSessionRef(session)
    if (!sessionRef) {
      const error = `No existing OpenClaw session found for agent "${agentId}". Open or run this agent in OpenClaw first, then dispatch again.`
      console.warn(`[Task Dispatch] ${error}`)
      errors.push({ agentId, error })
      continue
    }

    sessionIds.push(sessionRef)
    bindings.push({
      agentId,
      requestedAgentId: target.agentId,
      sessionKey: sessionRef,
      role: target.role,
      instructions: target.instructions
    })
  }

  return {
    mode: TASK_BIND_MODE,
    sessionIds,
    errors,
    totalAgents: targets.length,
    bindings
  }
}

function getTaskCollaborationMode(task: Pick<Task, 'collaborationMode'>): string {
  return task.collaborationMode || 'sequential'
}

export function buildTaskDispatchMessage(task: Pick<Task, 'id' | 'name' | 'description' | 'collaborationMode'>, binding: TaskSessionBinding): string {
  const description = (task.description || '').trim() || '(无描述)'
  const instructions = (binding.instructions || '').trim()
  const lines = [
    '[VIS OpenClaw 任务分发]',
    '',
    `任务名称：${task.name}`,
    `任务 ID：${task.id}`,
    `协作模式：${getTaskCollaborationMode(task)}`,
    binding.role ? `Agent 角色：${binding.role}` : '',
    '',
    '任务描述：',
    description
  ].filter(line => line !== '')

  if (instructions && instructions !== description) {
    lines.push('', '给当前 Agent 的指令：', instructions)
  }

  lines.push('', '请在当前会话中处理这个任务，并在开始执行后简要说明你的计划或进展。')
  return lines.join('\n')
}

function buildTaskIdempotencyKey(task: Pick<Task, 'id' | 'createdAt' | 'updatedAt'>, agentId: string): string {
  const versionTime = new Date(task.updatedAt || task.createdAt || '').getTime()
  const version = Number.isFinite(versionTime) ? versionTime : Date.now()
  return `vis-task:${task.id}:${agentId}:${version}`
}

export async function dispatchTaskToGatewaySessions(
  task: Pick<Task, 'id' | 'name' | 'description' | 'collaborationMode' | 'createdAt' | 'updatedAt'>,
  targets: TaskDispatchTarget[]
): Promise<TaskDispatchResult> {
  const bindingResult = await bindTaskToExistingSessions(targets)
  const errors: TaskDispatchError[] = [...bindingResult.errors]
  const deliveries: TaskDispatchDelivery[] = []

  for (const binding of bindingResult.bindings) {
    const message = buildTaskDispatchMessage(task, binding)
    try {
      const result = await sendGatewaySessionMessage(binding.sessionKey, message, {
        idempotencyKey: buildTaskIdempotencyKey(task, binding.agentId)
      })

      deliveries.push({
        agentId: binding.agentId,
        sessionKey: binding.sessionKey,
        runId: typeof result.runId === 'string' ? result.runId : undefined,
        status: typeof result.status === 'string' ? result.status : undefined,
        messageSeq: typeof result.messageSeq === 'number' ? result.messageSeq : undefined
      })
    } catch (error: any) {
      const message = error?.message || 'Failed to send task to OpenClaw session'
      console.error(`[Task Dispatch] Failed to send task=${task.id} agent=${binding.agentId} session=${binding.sessionKey}: ${message}`)
      if (error instanceof OpenClawGatewayPermissionPendingError) {
        errors.push({
          agentId: binding.agentId,
          error: message,
          code: error.code,
          requestId: error.requestId
        })
      } else {
        errors.push({ agentId: binding.agentId, error: message })
      }
    }
  }

  return {
    mode: TASK_DISPATCH_MODE,
    sessionIds: deliveries.map(delivery => delivery.sessionKey),
    errors,
    totalAgents: targets.length,
    deliveries
  }
}
