import { apiClient } from './client'
import type { CreateTaskInput, ScheduledConfig, Task } from '@/stores/task'

export async function fetchTasks() {
  const { data } = await apiClient.get<Task[]>('/tasks')
  return data
}

export async function createTask(task: CreateTaskInput) {
  const { data } = await apiClient.post<Task>('/tasks', task)
  return data
}

export async function updateTask(id: string, updates: Partial<Task>) {
  const { data } = await apiClient.put<Task>(`/tasks/${id}`, updates)
  return data
}

export async function deleteTask(id: string) {
  await apiClient.delete(`/tasks/${id}`)
}

export async function startTask(id: string) {
  const { data } = await apiClient.post<Task>(`/tasks/${id}/start`)
  return data
}

export async function pauseTask(id: string) {
  const { data } = await apiClient.post<Task>(`/tasks/${id}/pause`)
  return data
}

export async function setSchedule(id: string, config: ScheduledConfig) {
  const { data } = await apiClient.put<Task>(`/tasks/${id}/schedule`, config)
  return data
}

export async function clearSchedule(id: string) {
  const { data } = await apiClient.delete<Task>(`/tasks/${id}/schedule`)
  return data
}

export async function triggerTask(id: string) {
  const { data } = await apiClient.post(`/tasks/${id}/trigger`)
  return data
}
