import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as sessionApi from '@/api/sessions'

export interface SessionMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

export type SessionState =
  | 'idle'
  | 'running'
  | 'thinking'
  | 'generating'
  | 'tool_calling'
  | 'waiting_approval'
  | 'finalizing'
  | 'complete'
  | 'error'
  | 'stale'

export interface Session {
  id: string
  key?: string
  agentId?: string
  taskId?: string
  status: 'active' | 'idle' | 'error'
  label?: string
  lastActivity: string
  messageCount: number
  messages: SessionMessage[]
  createdAt: string
  updatedAt: string
  model?: string
  kind?: string
  sessionState?: SessionState
  sessionStateTimestamp?: number
}

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<Session[]>([])
  const currentSession = ref<Session | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const activeSessions = computed(() =>
    sessions.value.filter(s => s.status === 'active')
  )

  const idleSessions = computed(() =>
    sessions.value.filter(s => s.status === 'idle')
  )

  function getSessionIdentity(session: Pick<Session, 'id' | 'key'>): string {
    return session.key || session.id
  }

  function matchesSession(session: Pick<Session, 'id' | 'key'>, idOrKey: string | undefined): boolean {
    if (!idOrKey) return false
    return session.id === idOrKey || session.key === idOrKey || getSessionIdentity(session) === idOrKey
  }

  function dedupeSessionsByIdentity(sessionList: Session[]) {
    const result: Session[] = []
    const indexByIdentity = new Map<string, number>()

    for (const session of sessionList) {
      if (!session?.id && !session?.key) continue
      const identity = getSessionIdentity(session)
      const existingIndex = indexByIdentity.get(identity)

      if (existingIndex === undefined) {
        indexByIdentity.set(identity, result.length)
        result.push(session)
      } else {
        result[existingIndex] = { ...result[existingIndex], ...session }
      }
    }

    return result
  }

  function upsertSession(session: Session) {
    const identity = getSessionIdentity(session)
    const firstIndex = sessions.value.findIndex(s =>
      matchesSession(s, session.id) || matchesSession(s, session.key) || getSessionIdentity(s) === identity
    )
    const withoutSameSession = sessions.value.filter(s =>
      !matchesSession(s, session.id) && !matchesSession(s, session.key) && getSessionIdentity(s) !== identity
    )
    const nextSession = firstIndex === -1 ? session : { ...sessions.value[firstIndex], ...session }

    if (firstIndex === -1) {
      sessions.value = dedupeSessionsByIdentity([...withoutSameSession, nextSession])
    } else {
      const nextSessions = [...withoutSameSession]
      nextSessions.splice(firstIndex, 0, nextSession)
      sessions.value = dedupeSessionsByIdentity(nextSessions)
    }

    if (currentSession.value &&
      (matchesSession(currentSession.value, session.id) || matchesSession(currentSession.value, session.key))) {
      currentSession.value = { ...currentSession.value, ...session }
    }
  }

  async function fetchSessions() {
    loading.value = true
    error.value = null
    try {
      sessions.value = dedupeSessionsByIdentity(await sessionApi.fetchSessions())
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function fetchSession(id: string) {
    loading.value = true
    error.value = null
    try {
      const result = await sessionApi.fetchSession(id)
      currentSession.value = result
      return result
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createSession(config: { agentId?: string; taskId?: string; label?: string; message?: string }) {
    loading.value = true
    error.value = null
    try {
      const created = await sessionApi.createSession(config)
      upsertSession(created)
      return created
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function sendMessage(sessionId: string, message: string) {
    error.value = null
    try {
      return await sessionApi.sendMessage(sessionId, message)
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function fetchMessages(sessionId: string) {
    loading.value = true
    error.value = null
    try {
      const messages = await sessionApi.fetchMessages(sessionId)
      if (currentSession.value) {
        currentSession.value.messages = messages
        currentSession.value.messageCount = messages.length
      }
      const session = sessions.value.find(s => s.id === sessionId || s.key === sessionId)
      if (session) {
        session.messages = messages
        session.messageCount = messages.length
      }
      return messages
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  function addSession(session: Session) {
    upsertSession(session)
  }

  function updateSession(session: Session) {
    upsertSession(session)
  }

  function addMessage(sessionId: string, message: SessionMessage) {
    const session = sessions.value.find(s => matchesSession(s, sessionId))
    if (session) {
      const hasMessage = message.id && session.messages.some(existing => existing.id === message.id)
      if (!hasMessage) {
        session.messages.push(message)
        session.messageCount = session.messages.length
      }
    }
    if (currentSession.value && matchesSession(currentSession.value, sessionId)) {
      const hasMessage = message.id && currentSession.value.messages.some(existing => existing.id === message.id)
      if (!hasMessage) {
        currentSession.value.messages.push(message)
        currentSession.value.messageCount = currentSession.value.messages.length
      }
    }
  }

  function updateSessionState(sessionId: string, data: {
    state: SessionState
    role?: string
    agentId?: string
    sessionKey?: string
    timestamp: number
  }) {
    const session = sessions.value.find(s => matchesSession(s, sessionId) || matchesSession(s, data.sessionKey))
    if (session) {
      if (typeof session.sessionStateTimestamp === 'number' && data.timestamp < session.sessionStateTimestamp) return
      session.sessionState = data.state
      session.sessionStateTimestamp = data.timestamp
      if (data.agentId) session.agentId = data.agentId
    }
    if (currentSession.value &&
      (matchesSession(currentSession.value, sessionId) || matchesSession(currentSession.value, data.sessionKey))) {
      if (typeof currentSession.value.sessionStateTimestamp === 'number' && data.timestamp < currentSession.value.sessionStateTimestamp) return
      currentSession.value.sessionState = data.state
      currentSession.value.sessionStateTimestamp = data.timestamp
    }
  }

  function getSessionState(sessionId: string): SessionState {
    const session = sessions.value.find(s => matchesSession(s, sessionId))
    return session?.sessionState ?? 'idle'
  }

  function getSessionById(id: string) {
    return sessions.value.find(s => matchesSession(s, id))
  }

  return {
    sessions, currentSession, loading, error,
    activeSessions, idleSessions,
    fetchSessions, fetchSession, createSession,
    sendMessage, fetchMessages,
    addSession, updateSession, addMessage,
    getSessionById, updateSessionState, getSessionState
  }
})
