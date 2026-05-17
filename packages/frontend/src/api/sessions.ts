import { apiClient } from './client'
import type { Session, SessionMessage } from '@/stores/session'

export async function fetchSessions() {
  const { data } = await apiClient.get<Session[]>('/sessions')
  return data
}

export async function fetchSession(id: string) {
  const { data } = await apiClient.get<Session>(`/sessions/${id}`)
  return data
}

export async function createSession(config: { agentId?: string; taskId?: string; label?: string; message?: string }) {
  const { data } = await apiClient.post<Session>('/sessions', config)
  return data
}

export async function fetchMessages(sessionId: string) {
  const { data } = await apiClient.get<SessionMessage[]>(`/sessions/${sessionId}/messages`)
  return data
}

export async function sendMessage(sessionId: string, message: string) {
  const { data } = await apiClient.post(`/sessions/${sessionId}/send`, { message })
  return data
}
