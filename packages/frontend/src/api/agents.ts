import { apiClient } from './client'
import type { Agent } from '@/stores/agent'

export async function fetchAgents() {
  const { data } = await apiClient.get<Agent[]>('/agents')
  return data
}

export async function createAgent(agent: Partial<Agent>) {
  const { data } = await apiClient.post<Agent>('/agents', agent)
  return data
}

export async function updateAgent(id: string, updates: Partial<Agent>) {
  const { data } = await apiClient.put<Agent>(`/agents/${id}`, updates)
  return data
}

export async function deleteAgent(id: string) {
  await apiClient.delete(`/agents/${id}`)
}

export async function getAvailableModels() {
  const { data } = await apiClient.get<string[]>('/agents/models')
  return data
}

export async function getAgentFiles(id: string) {
  const { data } = await apiClient.get(`/agents/${id}/files`)
  return data
}

export async function getAgentFile(id: string, name: string) {
  const { data } = await apiClient.get(`/agents/${id}/files/${name}`)
  return data
}

export async function saveAgentFile(id: string, name: string, content: string) {
  const { data } = await apiClient.put(`/agents/${id}/files/${name}`, { content })
  return data
}

export async function startAgentSession(id: string, message?: string, channel?: string) {
  const { data } = await apiClient.post(`/agents/${id}/start-session`, { message, channel })
  return data
}

export async function getCommunicationConfig() {
  const { data } = await apiClient.get('/agents/communication-config')
  return data
}

export async function updateCommunicationConfig(enabled: boolean, allowList: string[]) {
  const { data } = await apiClient.put('/agents/communication-config', { enabled, allowList })
  return data
}

export async function getSessionStates() {
  const { data } = await apiClient.get('/agents/session-states')
  return data
}

export async function getSessionState(sessionId: string) {
  const { data } = await apiClient.get(`/agents/session-states/${sessionId}`)
  return data
}
