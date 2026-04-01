import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export interface SessionMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

export interface Session {
  id: string
  key?: string  // session key 格式：agent:xxx:main 或 agent:xxx:subagent:uuid
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
  kind?: string  // 'direct' 或 'subagent'
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

  async function fetchSessions() {
    loading.value = true
    error.value = null
    try {
      const response = await axios.get('/api/sessions')
      sessions.value = response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[SessionStore] Fetch sessions failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function fetchSession(id: string) {
    loading.value = true
    error.value = null
    try {
      const response = await axios.get(`/api/sessions/${id}`)
      currentSession.value = response.data
      return response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[SessionStore] Fetch session failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createSession(config: { agentId?: string; taskId?: string; label?: string; message?: string }) {
    loading.value = true
    error.value = null
    try {
      const response = await axios.post('/api/sessions', config)
      sessions.value.push(response.data)
      return response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[SessionStore] Create session failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function sendMessage(sessionId: string, message: string) {
    error.value = null
    try {
      const response = await axios.post(`/api/sessions/${sessionId}/send`, { message })
      return response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[SessionStore] Send message failed:', e)
      throw e
    }
  }

  async function fetchMessages(sessionId: string) {
    loading.value = true
    error.value = null
    try {
      const response = await axios.get(`/api/sessions/${sessionId}/messages`)
      const messages = response.data
      // 更新 currentSession 的 messages
      if (currentSession.value) {
        currentSession.value.messages = messages
        currentSession.value.messageCount = messages.length
      }
      // 同时更新 sessions 数组中的会话
      const session = sessions.value.find(s => s.id === sessionId || s.key === sessionId)
      if (session) {
        session.messages = messages
        session.messageCount = messages.length
      }
      return messages
    } catch (e: any) {
      error.value = e.message
      console.error('[SessionStore] Fetch messages failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  function addSession(session: Session) {
    const index = sessions.value.findIndex(s => s.id === session.id)
    if (index === -1) {
      sessions.value.push(session)
    }
  }

  function updateSession(session: Session) {
    const index = sessions.value.findIndex(s => s.id === session.id)
    if (index !== -1) {
      sessions.value[index] = session
    }
    if (currentSession.value?.id === session.id) {
      currentSession.value = session
    }
  }

  function addMessage(sessionId: string, message: SessionMessage) {
    const session = sessions.value.find(s => s.id === sessionId)
    if (session) {
      session.messages.push(message)
      session.messageCount++
    }
    if (currentSession.value?.id === sessionId) {
      currentSession.value.messages.push(message)
    }
  }

  function getSessionById(id: string) {
    return sessions.value.find(s => s.id === id)
  }

  return {
    sessions,
    currentSession,
    loading,
    error,
    activeSessions,
    idleSessions,
    fetchSessions,
    fetchSession,
    createSession,
    sendMessage,
    fetchMessages,
    addSession,
    updateSession,
    addMessage,
    getSessionById
  }
})