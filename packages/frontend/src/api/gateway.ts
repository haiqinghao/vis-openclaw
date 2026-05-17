import { apiClient } from './client'

export async function getGatewayStatus() {
  const { data } = await apiClient.get('/gateway/status')
  return data
}

export async function startGateway() {
  const { data } = await apiClient.post('/gateway/start')
  return data
}

export async function restartGateway() {
  const { data } = await apiClient.post('/gateway/restart')
  return data
}

export async function getDashboardStats() {
  const { data } = await apiClient.get('/dashboard/stats')
  return data
}

export async function getMaps() {
  const { data } = await apiClient.get('/maps')
  return data
}

export async function getMap(id: string) {
  const { data } = await apiClient.get(`/maps/${id}`)
  return data
}

export async function createMap(mapData: any) {
  const { data } = await apiClient.post('/maps', mapData)
  return data
}

export async function updateMap(id: string, updates: any) {
  const { data } = await apiClient.put(`/maps/${id}`, updates)
  return data
}

export async function deleteMap(id: string) {
  await apiClient.delete(`/maps/${id}`)
}
