import { Server as SocketIOServer } from 'socket.io'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { tasksDb } from '../db/tasks-db.js'
import { getRealtimeChannelRoom, type RealtimeChannel } from './realtime-channels.js'
import { readLocalSessions, type OpenClawSessionInfo } from './openclaw-state.js'

export type AgentState =
  | 'idle'
  | 'running'
  | 'thinking'
  | 'generating'
  | 'tool_calling'
  | 'waiting_approval'
  | 'finalizing'
  | 'complete'
  | 'busy'
  | 'error'
  | 'stale'

export interface AgentStatusEntry {
  agentId: string
  state: AgentState
  detail?: string
  timestamp: number
  sessionKey?: string
  sessionId?: string
  runId?: string
  source?: string
  hook?: string
  stream?: string
  phase?: string
  toolName?: string
  seq?: number
  taskId?: string
}

export interface AgentStatusEventPayload {
  agentId?: string
  state?: AgentState
  detail?: string
  timestamp?: number
  sessionKey?: string
  sessionId?: string
  runId?: string
  source?: string
  hook?: string
  stream?: string
  phase?: string
  toolName?: string
  seq?: number
  taskId?: string
  error?: string
  success?: boolean
}

const ACTIVE_STATES = new Set<AgentState>([
  'running',
  'thinking',
  'generating',
  'tool_calling',
  'waiting_approval',
  'finalizing',
  'busy'
])

const TERMINAL_STATES = new Set<AgentState>(['idle', 'complete', 'error', 'stale'])
const TASK_SYNCABLE_STATUSES = new Set(['dispatching', 'distributed', 'running'])
const TASK_TERMINAL_SUCCESS_STATES = new Set<AgentState>(['idle', 'complete'])
const STALE_TIMEOUT_MS = 5 * 60 * 1000
const PRUNE_INTERVAL_MS = 60 * 1000
const TERMINAL_RUN_GRACE_MS = 30 * 1000
const LOCAL_TERMINAL_RECONCILE_GRACE_MS = 15 * 1000
const LOCAL_SESSION_CLOCK_SKEW_MS = 2 * 1000
const RECENT_EVENT_TTL_MS = 15 * 60 * 1000
const MAX_RECENT_EVENTS = 1000
const PERSIST_DEBOUNCE_MS = 1000

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const statusDataDir = path.join(__dirname, '../../data')
const statusStorePath = path.join(statusDataDir, 'agent-status.json')

const agentStates = new Map<string, AgentStatusEntry>()
const sessionStates = new Map<string, AgentStatusEntry>()
const recentEventKeys = new Map<string, number>()
const terminalRuns = new Map<string, number>()

let ioInstance: SocketIOServer | null = null
let pruneTimer: NodeJS.Timeout | null = null
let persistTimer: NodeJS.Timeout | null = null
let lastLocalSessionReconcileAt = 0

function shouldReplaceStatusEntry(existing: AgentStatusEntry | undefined, next: AgentStatusEntry): boolean {
  return !existing || next.timestamp >= existing.timestamp
}

function upsertSessionState(entry: AgentStatusEntry): void {
  if (entry.sessionKey && shouldReplaceStatusEntry(sessionStates.get(entry.sessionKey), entry)) {
    sessionStates.set(entry.sessionKey, entry)
  }
  if (entry.sessionId && shouldReplaceStatusEntry(sessionStates.get(entry.sessionId), entry)) {
    sessionStates.set(entry.sessionId, entry)
  }
}

function getUniqueSessionStates(): AgentStatusEntry[] {
  const latestBySessionKey = new Map<string, AgentStatusEntry>()

  for (const entry of sessionStates.values()) {
    const key = entry.sessionKey || entry.sessionId
    if (!key) continue

    if (shouldReplaceStatusEntry(latestBySessionKey.get(key), entry)) {
      latestBySessionKey.set(key, entry)
    }
  }

  return Array.from(latestBySessionKey.values())
}

function ensureStatusDataDir(): void {
  if (!fs.existsSync(statusDataDir)) {
    fs.mkdirSync(statusDataDir, { recursive: true })
  }
}

function restorePersistedStates(): void {
  try {
    if (!fs.existsSync(statusStorePath)) return
    const persisted = JSON.parse(fs.readFileSync(statusStorePath, 'utf-8').replace(/^\uFEFF/, ''))

    if (Array.isArray(persisted.agents)) {
      for (const entry of persisted.agents) {
        if (entry?.agentId && entry?.state && entry?.timestamp) {
          agentStates.set(entry.agentId, entry)
        }
      }
    }

    if (Array.isArray(persisted.sessions)) {
      for (const entry of persisted.sessions) {
        if (entry?.sessionKey || entry?.sessionId) upsertSessionState(entry)
      }
    }
  } catch (error: any) {
    console.error('[AgentStatus] Failed to restore status cache:', error.message)
  }
}

function persistStatesNow(): void {
  try {
    ensureStatusDataDir()
    fs.writeFileSync(statusStorePath, JSON.stringify({
      version: 1,
      savedAt: Date.now(),
      agents: Array.from(agentStates.values()),
      sessions: getUniqueSessionStates()
    }, null, 2), 'utf-8')
  } catch (error: any) {
    console.error('[AgentStatus] Failed to persist status cache:', error.message)
  }
}

function schedulePersistStates(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistStatesNow()
  }, PERSIST_DEBOUNCE_MS)
}

function trimString(value: unknown, maxLength = 300): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function normalizeTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : Date.now()
}

function extractAgentId(sessionKey: string | undefined): string {
  if (!sessionKey) return 'main'

  const parts = sessionKey.split(':').filter(Boolean)
  if (parts[0] === 'agent' && parts[1]) return parts[1]
  if (parts[0] === 'subagent' && parts[1]) return parts[1]
  if (parts[0] === 'cron' && parts[1]) return parts[1]

  return parts[0] || 'main'
}

function normalizeState(state: unknown): AgentState | undefined {
  switch (state) {
    case 'busy':
      return 'running'
    case 'idle':
    case 'running':
    case 'thinking':
    case 'generating':
    case 'tool_calling':
    case 'waiting_approval':
    case 'finalizing':
    case 'complete':
    case 'error':
    case 'stale':
      return state
    default:
      return undefined
  }
}

function inferState(payload: AgentStatusEventPayload): AgentState {
  const explicit = normalizeState(payload.state)
  if (explicit) return explicit

  if (payload.hook === 'model_call_started') return 'thinking'
  if (payload.hook === 'before_tool_call') return 'tool_calling'
  if (payload.hook === 'after_tool_call') return 'thinking'
  if (payload.hook === 'before_agent_finalize') return 'finalizing'
  if (payload.hook === 'agent_end') return payload.success === false || payload.error ? 'error' : 'idle'

  if (payload.stream === 'lifecycle') {
    if (payload.phase === 'start') return 'running'
    if (payload.phase === 'end') return 'idle'
    if (payload.phase === 'error') return 'error'
    return 'running'
  }

  if (payload.stream === 'approval') return 'waiting_approval'
  if (payload.stream === 'tool' || payload.stream === 'command_output' || payload.stream === 'patch') return 'tool_calling'
  if (payload.stream === 'thinking' || payload.stream === 'plan') return 'thinking'
  if (payload.stream === 'error') return 'error'

  return 'running'
}

function isActiveState(state: AgentState): boolean {
  return ACTIVE_STATES.has(state)
}

function isTerminalState(state: AgentState): boolean {
  return TERMINAL_STATES.has(state)
}

function normalizeSessionStatus(status: unknown): string {
  return typeof status === 'string' ? status.trim().toLowerCase() : ''
}

function terminalStateFromLocalSession(session: OpenClawSessionInfo): AgentState | null {
  const status = normalizeSessionStatus(session.status)
  if (['done', 'complete', 'completed', 'idle'].includes(status)) return 'idle'
  if (['timeout', 'timed_out', 'error', 'failed', 'fail', 'cancelled', 'canceled', 'aborted'].includes(status)) return 'error'

  if (session.hasActiveRun === false && typeof session.endedAt === 'number') {
    return session.abortedLastRun ? 'error' : 'idle'
  }

  return null
}

function findLocalSessionForStatusEntry(
  entry: AgentStatusEntry,
  sessions: OpenClawSessionInfo[]
): OpenClawSessionInfo | undefined {
  if (entry.sessionKey || entry.sessionId) {
    const exact = sessions.find(session =>
      (entry.sessionKey && session.key === entry.sessionKey) ||
      (entry.sessionId && session.sessionId === entry.sessionId)
    )
    if (exact) return exact
  }

  return sessions
    .filter(session => session.agentId === entry.agentId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0]
}

function canTrustLocalTerminalSession(entry: AgentStatusEntry, session: OpenClawSessionInfo, now: number): boolean {
  if (!isActiveState(entry.state) && entry.state !== 'stale') return false
  if (isActiveState(entry.state) && now - entry.timestamp < LOCAL_TERMINAL_RECONCILE_GRACE_MS) return false

  return session.updatedAt + LOCAL_SESSION_CLOCK_SKEW_MS >= entry.timestamp
}

function inferLinkedTaskStatus(task: any, latestEntry: AgentStatusEntry): string | undefined {
  const currentStatus = typeof task?.status === 'string' && task.status ? task.status : 'pending'
  if (!TASK_SYNCABLE_STATUSES.has(currentStatus)) return undefined

  if (latestEntry.state === 'error') return 'failed'

  const sessionIds = Array.isArray(task.sessionIds)
    ? Array.from(new Set<string>(task.sessionIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)))
    : []

  if (sessionIds.length === 0) {
    if (isActiveState(latestEntry.state)) return 'running'
    if (TASK_TERMINAL_SUCCESS_STATES.has(latestEntry.state)) return 'completed'
    if (latestEntry.state === 'stale') return 'stale'
    return undefined
  }

  const knownEntries = sessionIds
    .map((id) => sessionStates.get(id))
    .filter((entry): entry is AgentStatusEntry => Boolean(entry))

  if (knownEntries.some((entry) => entry.state === 'error')) return 'failed'
  if (knownEntries.some((entry) => isActiveState(entry.state))) return 'running'

  if (knownEntries.length === sessionIds.length) {
    if (knownEntries.every((entry) => entry.state === 'stale')) return 'stale'
    if (knownEntries.every((entry) => TASK_TERMINAL_SUCCESS_STATES.has(entry.state))) return 'completed'
  }

  if (sessionIds.length === 1 && latestEntry.state === 'stale') return 'stale'

  return undefined
}

function syncLinkedTasksFromStatus(entry: AgentStatusEntry): void {
  const sessionRefs = new Set([entry.sessionKey, entry.sessionId].filter((id): id is string => Boolean(id)))
  if (!entry.taskId && sessionRefs.size === 0) return

  const linkedTasks = tasksDb.findAll().filter((task: any) => {
    if (entry.taskId && task.id === entry.taskId) return true
    if (!Array.isArray(task.sessionIds)) return false
    return task.sessionIds.some((id: string) => sessionRefs.has(id))
  })

  for (const task of linkedTasks) {
    const nextStatus = inferLinkedTaskStatus(task, entry)
    if (!nextStatus || task.status === nextStatus) continue

    const updatedTask = tasksDb.update(task.id, { status: nextStatus })
    if (updatedTask) emitToRealtimeChannel('tasks', 'task:updated', updatedTask)
  }
}

function buildEventKey(payload: AgentStatusEventPayload, state: AgentState): string | undefined {
  if (payload.runId && payload.seq !== undefined) {
    return `${payload.runId}:${payload.seq}:${payload.stream ?? payload.hook ?? state}`
  }

  if (payload.runId && (payload.hook || payload.stream || payload.phase)) {
    return [
      payload.runId,
      payload.hook,
      payload.stream,
      payload.phase,
      payload.toolName,
      state,
      payload.timestamp
    ].filter((part) => part !== undefined && part !== '').join(':')
  }

  return undefined
}

function pruneRecentEventKeys(now: number): void {
  for (const [key, ts] of recentEventKeys) {
    if (now - ts > RECENT_EVENT_TTL_MS || recentEventKeys.size > MAX_RECENT_EVENTS) {
      recentEventKeys.delete(key)
    }
  }
}

function shouldIgnoreAfterTerminal(payload: AgentStatusEventPayload, state: AgentState, now: number): boolean {
  if (!payload.runId || !isActiveState(state)) return false
  const terminalAt = terminalRuns.get(payload.runId)
  return terminalAt !== undefined && now - terminalAt < TERMINAL_RUN_GRACE_MS
}

function publishStatus(entry: AgentStatusEntry, previous?: AgentStatusEntry): void {
  if (!ioInstance) return

  const wasActive = previous ? isActiveState(previous.state) : false
  const isActive = isActiveState(entry.state)

  emitToRealtimeChannel('agents', 'agent:status', entry)
  emitToRealtimeChannel('sessions', 'session:state', entry)

  if (isActive && !wasActive) {
    emitToRealtimeChannel('agents', 'agent:running', {
      ...entry,
      status: 'running'
    })
  }

  if (entry.state === 'thinking') emitToRealtimeChannel('agents', 'agent:thinking', entry)
  if (entry.state === 'tool_calling') emitToRealtimeChannel('agents', 'agent:tool_calling', entry)
  if (entry.state === 'complete') emitToRealtimeChannel('agents', 'agent:complete', entry)
  if (entry.state === 'error') emitToRealtimeChannel('agents', 'agent:error', entry)

  if (!isActive && (wasActive || entry.state === 'idle')) {
    emitToRealtimeChannel('agents', 'agent:idle', {
      ...entry,
      status: 'idle'
    })
  }

  syncLinkedTasksFromStatus(entry)
}

function emitToRealtimeChannel(channel: RealtimeChannel, event: string, payload: unknown): void {
  if (!ioInstance) return

  const room = getRealtimeChannelRoom(channel)
  const subscriberCount = ioInstance.sockets.adapter.rooms.get(room)?.size ?? 0
  if (subscriberCount > 0) {
    ioInstance.to(room).emit(event, payload)
    return
  }

  ioInstance.emit(event, payload)
}

export function reportAgentStatusEvent(rawPayload: AgentStatusEventPayload): AgentStatusEntry {
  const now = Date.now()
  pruneRecentEventKeys(now)

  const sessionKey = trimString(rawPayload.sessionKey, 500)
  const agentId = trimString(rawPayload.agentId, 120) ?? extractAgentId(sessionKey)
  const state = inferState(rawPayload)
  const timestamp = normalizeTimestamp(rawPayload.timestamp)
  const eventKey = buildEventKey(rawPayload, state)

  const previous = agentStates.get(agentId)

  if (eventKey && recentEventKeys.has(eventKey)) {
    return previous ?? {
      agentId,
      state,
      timestamp,
      sessionKey
    }
  }

  if (eventKey) recentEventKeys.set(eventKey, now)

  if (shouldIgnoreAfterTerminal(rawPayload, state, now)) {
    return previous ?? {
      agentId,
      state: 'idle',
      timestamp: now,
      sessionKey
    }
  }

  if (rawPayload.runId && isTerminalState(state)) {
    terminalRuns.set(rawPayload.runId, now)
  }

  const entry: AgentStatusEntry = {
    agentId,
    state,
    timestamp,
    ...(trimString(rawPayload.detail) ? { detail: trimString(rawPayload.detail) } : {}),
    ...(sessionKey ? { sessionKey } : {}),
    ...(trimString(rawPayload.sessionId, 120) ? { sessionId: trimString(rawPayload.sessionId, 120) } : {}),
    ...(trimString(rawPayload.runId, 120) ? { runId: trimString(rawPayload.runId, 120) } : {}),
    ...(trimString(rawPayload.source, 80) ? { source: trimString(rawPayload.source, 80) } : {}),
    ...(trimString(rawPayload.hook, 80) ? { hook: trimString(rawPayload.hook, 80) } : {}),
    ...(trimString(rawPayload.stream, 80) ? { stream: trimString(rawPayload.stream, 80) } : {}),
    ...(trimString(rawPayload.phase, 80) ? { phase: trimString(rawPayload.phase, 80) } : {}),
    ...(trimString(rawPayload.toolName, 120) ? { toolName: trimString(rawPayload.toolName, 120) } : {}),
    ...(typeof rawPayload.seq === 'number' && Number.isFinite(rawPayload.seq) ? { seq: rawPayload.seq } : {}),
    ...(trimString(rawPayload.taskId, 120) ? { taskId: trimString(rawPayload.taskId, 120) } : {})
  }

  agentStates.set(agentId, entry)
  upsertSessionState(entry)
  schedulePersistStates()

  publishStatus(entry, previous)
  console.log(`[AgentStatus] ${agentId} -> ${state}${entry.detail ? ` (${entry.detail})` : ''}`)

  return entry
}

export function reportAgentStatus(agentId: string, state: AgentState, detail?: string): AgentStatusEntry {
  return reportAgentStatusEvent({
    agentId,
    state,
    detail,
    source: 'legacy-status'
  })
}

export function reportAgentStatusEvents(events: AgentStatusEventPayload[]): AgentStatusEntry[] {
  return events.map((event) => reportAgentStatusEvent(event))
}

export function reconcileAgentStatusesFromSessions(
  sessions: OpenClawSessionInfo[],
  now = Date.now()
): AgentStatusEntry[] {
  const reconciled: AgentStatusEntry[] = []

  for (const [agentId, entry] of agentStates) {
    const localSession = findLocalSessionForStatusEntry(entry, sessions)
    if (!localSession || !canTrustLocalTerminalSession(entry, localSession, now)) continue

    const terminalState = terminalStateFromLocalSession(localSession)
    if (!terminalState) continue

    const nextEntry: AgentStatusEntry = {
      ...entry,
      state: terminalState,
      timestamp: now,
      detail: localSession.status
        ? `OpenClaw session reported "${localSession.status}"`
        : 'OpenClaw session is no longer active',
      ...(localSession.key ? { sessionKey: localSession.key } : {}),
      ...(localSession.sessionId ? { sessionId: localSession.sessionId } : {})
    }

    agentStates.set(agentId, nextEntry)
    upsertSessionState(nextEntry)
    schedulePersistStates()
    publishStatus(nextEntry, entry)
    console.log(`[AgentStatus] ${agentId} -> ${terminalState} (local session reconcile)`)
    reconciled.push(nextEntry)
  }

  return reconciled
}

function reconcileFromLocalSessions(now = Date.now(), force = false): void {
  if (!force && now - lastLocalSessionReconcileAt < 5000) return
  lastLocalSessionReconcileAt = now

  try {
    reconcileAgentStatusesFromSessions(readLocalSessions(), now)
  } catch (error: any) {
    console.error('[AgentStatus] Failed to reconcile local session status:', error.message)
  }
}

export function agentHasActiveSession(agentId: string): boolean {
  reconcileFromLocalSessions()
  const entry = agentStates.get(agentId)
  if (!entry) return false
  return isActiveState(entry.state) && Date.now() - entry.timestamp < STALE_TIMEOUT_MS
}

export function getAgentSessionState(agentId: string): AgentState {
  reconcileFromLocalSessions()
  const entry = agentStates.get(agentId)
  if (!entry) return 'idle'
  if (isActiveState(entry.state) && Date.now() - entry.timestamp > STALE_TIMEOUT_MS) return 'stale'
  return entry.state
}

export function getAllSessionStates(): AgentStatusEntry[] {
  reconcileFromLocalSessions()
  return getUniqueSessionStates()
}

export function getAllAgentStatuses(): AgentStatusEntry[] {
  reconcileFromLocalSessions()
  return Array.from(agentStates.values())
}

export function getSessionState(sessionIdOrKey: string): AgentStatusEntry | null {
  reconcileFromLocalSessions()
  return sessionStates.get(sessionIdOrKey) ?? null
}

export function getAgentStatus(agentId: string): AgentStatusEntry | null {
  reconcileFromLocalSessions()
  return agentStates.get(agentId) ?? null
}

function pruneExpiredStates(): void {
  const now = Date.now()
  reconcileFromLocalSessions(now, true)

  for (const [agentId, entry] of agentStates) {
    if (!isActiveState(entry.state) || now - entry.timestamp <= STALE_TIMEOUT_MS) continue

    const staleEntry: AgentStatusEntry = {
      ...entry,
      state: 'stale',
      timestamp: now,
      detail: 'No OpenClaw status event received before timeout'
    }

    agentStates.set(agentId, staleEntry)
    upsertSessionState(staleEntry)
    schedulePersistStates()
    publishStatus(staleEntry, entry)
    console.log(`[AgentStatus] ${agentId} -> stale (timeout)`)
  }

  for (const [runId, ts] of terminalRuns) {
    if (now - ts > RECENT_EVENT_TTL_MS) terminalRuns.delete(runId)
  }

  pruneRecentEventKeys(now)
}

export function initAgentStatus(io: SocketIOServer): void {
  ioInstance = io
  restorePersistedStates()
  pruneExpiredStates()
  if (!pruneTimer) pruneTimer = setInterval(pruneExpiredStates, PRUNE_INTERVAL_MS)
  console.log('[AgentStatus] Initialized (OpenClaw event bridge)')
}

export function stopAgentStatus(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  persistStatesNow()

  if (pruneTimer) {
    clearInterval(pruneTimer)
    pruneTimer = null
  }

  agentStates.clear()
  sessionStates.clear()
  recentEventKeys.clear()
  terminalRuns.clear()
  ioInstance = null
  console.log('[AgentStatus] Stopped')
}
