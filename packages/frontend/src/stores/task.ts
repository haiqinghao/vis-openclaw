import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export interface TaskAgent {
  agentId: string
  role: 'primary' | 'secondary' | 'reviewer'
  instructions?: string
}

export interface Task {
  id: string
  name: string
  description: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed'
  collaborationMode: 'sequential' | 'parallel' | 'hierarchical'
  agents: TaskAgent[]
  sessionIds: string[]
  createdAt: string
  updatedAt: string
}

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const runningTasks = computed(() =>
    tasks.value.filter(t => t.status === 'running')
  )

  const pendingTasks = computed(() =>
    tasks.value.filter(t => t.status === 'pending')
  )

  const completedTasks = computed(() =>
    tasks.value.filter(t => t.status === 'completed' || t.status === 'failed')
  )

  async function fetchTasks() {
    loading.value = true
    error.value = null
    try {
      const response = await axios.get('/api/tasks')
      tasks.value = response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[TaskStore] Fetch tasks failed:', e)
    } finally {
      loading.value = false
    }
  }

  async function createTask(task: Partial<Task>) {
    loading.value = true
    error.value = null
    try {
      const response = await axios.post('/api/tasks', task)
      tasks.value.push(response.data)
      return response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[TaskStore] Create task failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateTask(id: string, updates: Partial<Task>) {
    loading.value = true
    error.value = null
    try {
      const response = await axios.put(`/api/tasks/${id}`, updates)
      const index = tasks.value.findIndex(t => t.id === id)
      if (index !== -1) {
        tasks.value[index] = response.data
      }
      return response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[TaskStore] Update task failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteTask(id: string) {
    loading.value = true
    error.value = null
    try {
      await axios.delete(`/api/tasks/${id}`)
      tasks.value = tasks.value.filter(t => t.id !== id)
    } catch (e: any) {
      error.value = e.message
      console.error('[TaskStore] Delete task failed:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function startTask(id: string) {
    error.value = null
    try {
      const response = await axios.post(`/api/tasks/${id}/start`)
      const index = tasks.value.findIndex(t => t.id === id)
      if (index !== -1) {
        tasks.value[index] = response.data
      }
      return response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[TaskStore] Start task failed:', e)
      throw e
    }
  }

  async function pauseTask(id: string) {
    error.value = null
    try {
      const response = await axios.post(`/api/tasks/${id}/pause`)
      const index = tasks.value.findIndex(t => t.id === id)
      if (index !== -1) {
        tasks.value[index] = response.data
      }
      return response.data
    } catch (e: any) {
      error.value = e.message
      console.error('[TaskStore] Pause task failed:', e)
      throw e
    }
  }

  function addTask(task: Task) {
    const index = tasks.value.findIndex(t => t.id === task.id)
    if (index === -1) {
      tasks.value.push(task)
    }
  }

  function updateTask(task: Task) {
    const index = tasks.value.findIndex(t => t.id === task.id)
    if (index !== -1) {
      tasks.value[index] = task
    }
  }

  function getTaskById(id: string) {
    return tasks.value.find(t => t.id === id)
  }

  return {
    tasks,
    loading,
    error,
    runningTasks,
    pendingTasks,
    completedTasks,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    startTask,
    pauseTask,
    addTask,
    updateTask,
    getTaskById
  }
})