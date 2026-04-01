import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export interface Agent {
  id: string
  name: string
  description: string
  status: 'online' | 'offline' | 'busy'
  model?: string
  avatar?: string | null
  emoji?: string | null
  systemPrompt?: string
  workspace?: string
  hasActiveSession?: boolean  // 是否有活跃会话
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

  async function fetchAgents() {
    loading.value = true
    error.value = null
    try {
      const response = await axios.get('/api/agents')
      agents.value = response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[AgentStore] Fetch agents failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function createAgent(agent: Partial<Agent>) {
    loading.value = true
    error.value = null
    try {
      const response = await axios.post('/api/agents', agent)
      agents.value.push(response.data)
      return response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[AgentStore] Create agent failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateAgent(id: string, updates: Partial<Agent>) {
    loading.value = true
    error.value = null
    try {
      const response = await axios.put(`/api/agents/${id}`, updates)
      const index = agents.value.findIndex(a => a.id === id)
      if (index !== -1) {
        agents.value[index] = response.data
      }
      return response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[AgentStore] Update agent failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteAgent(id: string) {
    loading.value = true
    error.value = null
    try {
      await axios.delete(`/api/agents/${id}`)
      agents.value = agents.value.filter(a => a.id !== id)
    } catch (e: any) {
      error.value = e.message
      console.error('[AgentStore] Delete agent failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  function setAgentLocal(agent: Agent) {
    const index = agents.value.findIndex(a => a.id === agent.id)
    if (index !== -1) {
      agents.value[index] = agent
    } else {
      agents.value.push(agent)
    }
  }

  function getAgentById(id: string) {
    return agents.value.find(a => a.id === id)
  }

  return {
    agents,
    loading,
    error,
    onlineAgents,
    offlineAgents,
    fetchAgents,
    createAgent,
    updateAgent,
    deleteAgent,
    setAgentLocal,
    getAgentById
  }
})