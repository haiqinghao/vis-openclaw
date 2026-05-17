import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as taskApi from '@/api/tasks'

export interface TaskAgent {
  agentId: string
  role: 'primary' | 'secondary' | 'reviewer'
  instructions?: string
}

export type TaskStatus =
  | 'pending'
  | 'paused'
  | 'scheduled'
  | 'dispatching'
  | 'distributed'
  | 'running'
  | 'completed'
  | 'failed'
  | 'stale'

export interface ScheduledConfig {
  enabled: boolean
  mode: 'interval' | 'fixed'
  interval?: { value: number; unit: 'minutes' | 'hours' }
  fixedTime?: string
  cronId?: string
  lastRun?: string
  nextRun?: string
}

export interface TaskDispatchError {
  agentId: string
  error: string
  code?: string
  requestId?: string
}

export interface Task {
  id: string
  name: string
  description: string
  status: TaskStatus
  collaborationMode: 'sequential' | 'parallel' | 'hierarchical'
  agents: TaskAgent[]
  sessionIds: string[]
  dispatchMode?: 'bind-existing-session' | 'gateway-session-send' | 'agent-run'
  dispatchErrors?: TaskDispatchError[]
  dispatchedAt?: string
  scheduledConfig?: ScheduledConfig
  avatarType?: 'sheep' | 'gold'
  createdAt: string
  updatedAt: string
}

export interface CreateTaskInput {
  name: string
  description?: string
  collaborationMode?: Task['collaborationMode']
  agents?: TaskAgent[]
  avatarType?: Task['avatarType']
}

const ACTIVE_TASK_STATUSES = new Set<TaskStatus>(['dispatching', 'distributed', 'running'])
const PENDING_TASK_STATUSES = new Set<TaskStatus>(['pending', 'paused', 'scheduled'])
const COMPLETED_TASK_STATUSES = new Set<TaskStatus>(['completed', 'failed', 'stale'])

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const runningTasks = computed(() => tasks.value.filter(t => ACTIVE_TASK_STATUSES.has(t.status)))
  const pendingTasks = computed(() => tasks.value.filter(t => PENDING_TASK_STATUSES.has(t.status)))
  const completedTasks = computed(() =>
    tasks.value.filter(t => COMPLETED_TASK_STATUSES.has(t.status))
  )

  function dedupeTasksById(taskList: Task[]) {
    const result: Task[] = []
    const indexById = new Map<string, number>()

    for (const task of taskList) {
      if (!task?.id) continue

      const existingIndex = indexById.get(task.id)
      if (existingIndex === undefined) {
        indexById.set(task.id, result.length)
        result.push(task)
      } else {
        result[existingIndex] = task
      }
    }

    return result
  }

  function upsertTask(task: Task) {
    const firstIndex = tasks.value.findIndex(t => t.id === task.id)
    const withoutSameTask = tasks.value.filter(t => t.id !== task.id)

    if (firstIndex === -1) {
      tasks.value = dedupeTasksById([...withoutSameTask, task])
      return
    }

    const nextTasks = [...withoutSameTask]
    nextTasks.splice(firstIndex, 0, task)
    tasks.value = dedupeTasksById(nextTasks)
  }

  async function fetchTasks() {
    loading.value = true
    error.value = null
    try {
      tasks.value = dedupeTasksById(await taskApi.fetchTasks())
    } catch (e: any) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function createTask(task: CreateTaskInput) {
    loading.value = true
    error.value = null
    try {
      const created = await taskApi.createTask(task)
      upsertTask(created)
      return created
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateTask(id: string, updates: Partial<Task>) {
    loading.value = true
    error.value = null
    try {
      const updated = await taskApi.updateTask(id, updates)
      upsertTask(updated)
      return updated
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteTask(id: string) {
    loading.value = true
    error.value = null
    try {
      await taskApi.deleteTask(id)
      tasks.value = tasks.value.filter(t => t.id !== id)
    } catch (e: any) {
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  async function startTask(id: string) {
    error.value = null
    try {
      const result = await taskApi.startTask(id)
      upsertTask(result)
      return result
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  async function pauseTask(id: string) {
    error.value = null
    try {
      const result = await taskApi.pauseTask(id)
      upsertTask(result)
      return result
    } catch (e: any) {
      error.value = e.message
      throw e
    }
  }

  function addTask(task: Task) {
    upsertTask(task)
  }

  function removeTask(id: string) {
    tasks.value = tasks.value.filter(t => t.id !== id)
  }

  function syncTaskToLocal(task: Task) {
    upsertTask(task)
  }

  function getTaskById(id: string) {
    return tasks.value.find(t => t.id === id)
  }

  return {
    tasks, loading, error,
    runningTasks, pendingTasks, completedTasks,
    fetchTasks, createTask, updateTask, deleteTask,
    startTask, pauseTask,
    addTask, removeTask, syncTaskToLocal, getTaskById
  }
})
