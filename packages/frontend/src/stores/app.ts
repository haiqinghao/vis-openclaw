import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io, Socket } from 'socket.io-client'
import { useAgentStore } from './agent'
import { useSessionStore, type SessionState } from './session'
import { useTaskStore } from './task'

type AgentStatusPayload = {
  agentId?: string
  state?: string
  detail?: string
  sessionId?: string
  sessionKey?: string
  timestamp?: number
  source?: string
}

type RealtimeChannel = 'agents' | 'sessions' | 'tasks' | 'dashboard'

const ACTIVE_AGENT_STATES = new Set(['running', 'busy', 'thinking', 'generating', 'tool_calling', 'waiting_approval', 'finalizing'])
const SESSION_STATES = new Set(['idle', 'running', 'thinking', 'generating', 'tool_calling', 'waiting_approval', 'finalizing', 'complete', 'error', 'stale'])
const DEFAULT_CHANNELS: RealtimeChannel[] = ['agents', 'sessions', 'tasks', 'dashboard']
const REALTIME_CHANNELS = new Set<string>(DEFAULT_CHANNELS)

function normalizeSessionState(state: unknown): SessionState {
  if (state === 'busy') return 'running'
  if (typeof state === 'string' && SESSION_STATES.has(state)) return state as SessionState
  return 'running'
}

function isActiveAgentState(state: unknown): boolean {
  return typeof state === 'string' && ACTIVE_AGENT_STATES.has(state)
}

export const useAppStore = defineStore('app', () => {
  const socket = ref<Socket | null>(null)
  const isConnected = ref(false)
  const baselineRefreshing = ref(false)
  const subscribedChannels = new Set<RealtimeChannel>(DEFAULT_CHANNELS)
  const stats = ref({
    agentCount: 0,
    sessionCount: 0,
    taskCount: 0,
    runningCount: 0
  })

  function applyAgentStatus(data: AgentStatusPayload) {
    const state = normalizeSessionState(data.state)
    const agentStore = useAgentStore()
    const sessionStore = useSessionStore()

    if (data.agentId) {
      const active = isActiveAgentState(data.state)
      agentStore.updateAgentRuntimeState(data.agentId, {
        status: active ? 'busy' : 'online',
        hasActiveSession: active,
        agentState: state,
        stateDetail: data.detail || null,
        stateSource: data.source || null,
        lastEventAt: data.timestamp ?? Date.now(),
        stateAgeMs: 0
      })
    }

    const sessionId = data.sessionId || data.sessionKey
    if (sessionId) {
      sessionStore.updateSessionState(sessionId, {
        state,
        agentId: data.agentId,
        sessionKey: data.sessionKey,
        timestamp: data.timestamp ?? Date.now()
      })
    }
  }

  let baselineRefreshPromise: Promise<void> | null = null
  let lastBaselineRefreshAt = 0

  async function refreshBaselines(reason = 'manual', force = false) {
    if (baselineRefreshPromise) return baselineRefreshPromise

    const now = Date.now()
    if (!force && now - lastBaselineRefreshAt < 2000) return

    baselineRefreshing.value = true
    baselineRefreshPromise = (async () => {
      const agentStore = useAgentStore()
      const sessionStore = useSessionStore()
      const taskStore = useTaskStore()
      const results = await Promise.allSettled([
        agentStore.fetchAgents(),
        sessionStore.fetchSessions(),
        taskStore.fetchTasks()
      ])

      const rejected = results.filter(result => result.status === 'rejected')
      if (rejected.length > 0) {
        console.warn(`[WebSocket] Baseline refresh after ${reason} finished with ${rejected.length} error(s)`)
      }
      lastBaselineRefreshAt = Date.now()
    })().finally(() => {
      baselineRefreshing.value = false
      baselineRefreshPromise = null
    })

    return baselineRefreshPromise
  }

  function emitSubscriptions(target: Socket) {
    for (const channel of subscribedChannels) {
      target.emit('subscribe', channel)
    }
  }

  function disposeSocket() {
    if (!socket.value) return
    socket.value.removeAllListeners()
    socket.value.disconnect()
    socket.value = null
  }

  function connect() {
    if (socket.value?.connected) return
    disposeSocket()

    const nextSocket = io('/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    })
    socket.value = nextSocket

    nextSocket.on('connect', () => {
      isConnected.value = true
      emitSubscriptions(nextSocket)
      void refreshBaselines('connect', true)
      console.log('[WebSocket] Connected')
    })

    nextSocket.on('disconnect', () => {
      isConnected.value = false
      console.log('[WebSocket] Disconnected')
    })

    nextSocket.on('connect_error', (error) => {
      isConnected.value = false
      console.warn('[WebSocket] Connect error:', error.message)
    })

    nextSocket.on('stats:update', (newStats: typeof stats.value) => {
      stats.value = newStats
    })

    nextSocket.on('agent:updated', (agent: any) => {
      const agentStore = useAgentStore()
      agentStore.syncAgentToLocal(agent)
    })

    nextSocket.on('session:created', (session: any) => {
      const sessionStore = useSessionStore()
      sessionStore.addSession(session)
    })

    nextSocket.on('session:updated', (session: any) => {
      const sessionStore = useSessionStore()
      sessionStore.updateSession(session)
    })

    nextSocket.on('session:message', (data: any) => {
      const sessionStore = useSessionStore()
      sessionStore.addMessage(data.sessionId, data.message)
    })

    nextSocket.on('task:created', (task: any) => {
      const taskStore = useTaskStore()
      taskStore.addTask(task)
    })

    nextSocket.on('task:updated', (task: any) => {
      const taskStore = useTaskStore()
      taskStore.syncTaskToLocal(task)
    })

    nextSocket.on('task:deleted', (payload: { id?: string } | string) => {
      const taskStore = useTaskStore()
      const id = typeof payload === 'string' ? payload : payload?.id
      if (id) taskStore.removeTask(id)
    })

    nextSocket.on('agent:status', applyAgentStatus)
    nextSocket.on('session:state', applyAgentStatus)
    nextSocket.on('agent:running', (data: AgentStatusPayload) => applyAgentStatus({ ...data, state: data.state ?? 'running' }))
    nextSocket.on('agent:idle', (data: AgentStatusPayload) => applyAgentStatus({ ...data, state: 'idle' }))
    nextSocket.on('agent:thinking', (data: AgentStatusPayload) => applyAgentStatus({ ...data, state: 'thinking' }))
    nextSocket.on('agent:tool_calling', (data: AgentStatusPayload) => applyAgentStatus({ ...data, state: 'tool_calling' }))
    nextSocket.on('agent:complete', (data: AgentStatusPayload) => applyAgentStatus({ ...data, state: 'complete' }))
    nextSocket.on('agent:error', (data: AgentStatusPayload) => applyAgentStatus({ ...data, state: 'error' }))
  }

  function disconnect() {
    disposeSocket()
    isConnected.value = false
  }

  function subscribe(channel: string) {
    if (!REALTIME_CHANNELS.has(channel)) return
    subscribedChannels.add(channel as RealtimeChannel)
    socket.value?.emit('subscribe', channel)
  }

  function unsubscribe(channel: string) {
    if (!REALTIME_CHANNELS.has(channel)) return
    subscribedChannels.delete(channel as RealtimeChannel)
    socket.value?.emit('unsubscribe', channel)
  }

  return {
    socket,
    isConnected,
    baselineRefreshing,
    stats,
    connect,
    disconnect,
    refreshBaselines,
    subscribe,
    unsubscribe
  }
})
