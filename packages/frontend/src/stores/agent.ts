import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as agentApi from '@/api/agents'

export interface Agent {
  id: string
  name: string
  description: string
  status: 'online' | 'offline' | 'busy'
  model?: string
  avatar?: string | null
  emoji?: string | null
  avatarUnit?: string | null
  systemPrompt?: string
  workspace?: string
  hasActiveSession?: boolean
  agentState?: string
  stateDetail?: string | null
  stateSource?: string | null
  lastEventAt?: number | null
  stateAgeMs?: number | null
  createdAt: string
  updatedAt: string
}

export const useAgentStore = defineStore('agent', () => {
  const agents = ref<Agent[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const onlineAgents = computed(() =>
    agents.value.filter(a => a.status === 'online' || a.status === 'busy')
  )

  const offlineAgents = computed(() =>
    agents.value.filter(a => a.status === 'offline')
  )

  function dedupeAgentsById(agentList: Agent[]) {
    const result: Agent[] = []
    const indexById = new Map<string, number>()

    for (const agent of agentList) {
      if (!agent?.id) continue

      const existingIndex = indexById.get(agent.id)
      if (existingIndex === undefined) {
        indexById.set(agent.id, result.length)
        result.push(agent)
      } else {
        result[existingIndex] = { ...result[existingIndex], ...agent }
      }
    }

    return result
  }

  function upsertAgent(agent: Agent) {
    const firstIndex = agents.value.findIndex(a => a.id === agent.id)
    const withoutSameAgent = agents.value.filter(a => a.id !== agent.id)

    if (firstIndex === -1) {
      agents.value = dedupeAgentsById([...withoutSameAgent, agent])
      return
    }

    const nextAgents = [...withoutSameAgent]
    nextAgents.splice(firstIndex, 0, { ...agents.value[firstIndex], ...agent })
    agents.value = dedupeAgentsById(nextAgents)
  }

  async function fetchAgents() {
    loading.value = true
    error.value = null
    try {
      agents.value = dedupeAgentsById(await agentApi.fetchAgents())
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function createAgent(agent: Partial<Agent>) {
    loading.value = true
    error.value = null
    try {
      const created = await agentApi.createAgent(agent)
      upsertAgent(created)
      return created
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateAgent(id: string, updates: Partial<Agent>) {
    loading.value = true
    error.value = null
    try {
      const updated = await agentApi.updateAgent(id, updates)
      upsertAgent(updated)
      return updated
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteAgent(id: string) {
    loading.value = true
    error.value = null
    try {
      await agentApi.deleteAgent(id)
      agents.value = agents.value.filter(a => a.id !== id)
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  function updateAgentStatus(agentId: string, status: Agent['status']) {
    const index = agents.value.findIndex(a => a.id === agentId)
    if (index !== -1) agents.value[index].status = status
  }

  function updateAgentRuntimeState(agentId: string, runtime: Partial<Agent>) {
    const index = agents.value.findIndex(a => a.id === agentId)
    if (index !== -1) {
      const incomingEventAt = typeof runtime.lastEventAt === 'number' ? runtime.lastEventAt : null
      const currentEventAt = typeof agents.value[index].lastEventAt === 'number' ? agents.value[index].lastEventAt : null
      if (incomingEventAt !== null && currentEventAt !== null && incomingEventAt < currentEventAt) return

      agents.value[index] = { ...agents.value[index], ...runtime }
    }
  }

  function syncAgentToLocal(agent: Agent) {
    upsertAgent(agent)
  }

  function getAgentById(id: string) {
    return agents.value.find(a => a.id === id)
  }

  return {
    agents, loading, error, onlineAgents, offlineAgents,
    fetchAgents, createAgent, updateAgent, deleteAgent,
    updateAgentStatus, updateAgentRuntimeState, syncAgentToLocal, getAgentById
  }
})
