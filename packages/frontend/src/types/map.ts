// 地图数据类型定义
// 用于地图编辑器

// =====================================================
// 地图编辑器类型
// =====================================================

/**
 * 环境元素数据（编辑器）
 */
export interface EditorEnvironmentItem {
  x: number
  y: number
  type: string
}

/**
 * 单位数据（编辑器）
 */
export interface EditorUnitItem {
  x: number
  y: number
  type: string
}

/**
 * 图层数据（编辑器）
 */
export interface EditorMapLayers {
  terrain: string[][] // 瓦片ID二维数组（使用瓦片名称如 'grass', 'water' 等）
  environment: EditorEnvironmentItem[]
  units: EditorUnitItem[]
}

/**
 * 地图数据结构（编辑器）
 */
export interface MapData {
  id: string
  name: string
  width: number
  height: number
  layers: EditorMapLayers
  createdAt: number
  updatedAt: number
}

/**
 * 导入导出的地图数据格式
 */
export interface MapExportData {
  version: string
  name: string
  width: number
  height: number
  layers: EditorMapLayers
  exportedAt: number
}

/**
 * localStorage 存储的地图列表项
 */
export interface MapListItem {
  id: string
  name: string
  width: number
  height: number
  createdAt: number
  updatedAt: number
}

/**
 * 生成唯一ID
 */
export function generateMapId(): string {
  return `map_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * localStorage 键名
 */
export const MAP_STORAGE_KEY = 'vis_map_editor_maps'
export const MAP_LIST_KEY = 'vis_map_editor_list'

// 后端 API 地址（使用相对路径，通过 vite proxy 代理到后端）
const API_BASE = '/api'

// 是否使用后端存储
let useBackend = false
let backendStatusPromise: Promise<boolean> | null = null

// 检查后端状态
export async function checkBackendStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/maps`, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    })
    useBackend = response.ok
    console.log('[MapStorage] Backend status:', useBackend ? 'online' : 'offline')
    return useBackend
  } catch {
    useBackend = false
    console.log('[MapStorage] Backend offline, using localStorage')
    return false
  }
}

async function ensureBackendStatus(): Promise<boolean> {
  if (!backendStatusPromise) {
    backendStatusPromise = checkBackendStatus()
  }
  return backendStatusPromise
}

/**
 * 获取所有地图列表
 */
export async function getMapList(): Promise<MapListItem[]> {
  await ensureBackendStatus()

  if (useBackend) {
    try {
      const response = await fetch(`${API_BASE}/maps`)
      const data = await response.json()
      if (data.success) {
        console.log('[MapStorage] Loaded maps from backend:', data.list.length)
        return data.list
      }
    } catch (error) {
      console.error('[MapStorage] Failed to load from backend:', error)
    }
  }

  // 使用 localStorage
  try {
    const data = localStorage.getItem(MAP_LIST_KEY)
    const list = data ? JSON.parse(data) : []
    console.log('[MapStorage] Loaded maps from localStorage:', list.length)
    return list
  } catch {
    return []
  }
}

/**
 * 保存地图列表
 */
export function saveMapList(list: MapListItem[]): void {
  localStorage.setItem(MAP_LIST_KEY, JSON.stringify(list))
}

/**
 * 获取单个地图数据
 */
export async function getMapData(id: string): Promise<MapData | null> {
  await ensureBackendStatus()

  if (useBackend) {
    try {
      const response = await fetch(`${API_BASE}/maps/${id}`)
      const data = await response.json()
      if (data.success) {
        console.log('[MapStorage] Loaded map from backend:', id, data.map.name)
        return data.map
      }
    } catch (error) {
      console.error('[MapStorage] Failed to load map from backend:', error)
    }
  }

  // 使用 localStorage
  try {
    const data = localStorage.getItem(`${MAP_STORAGE_KEY}_${id}`)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

/**
 * 保存单个地图数据
 */
export async function saveMapData(map: MapData): Promise<void> {
  await ensureBackendStatus()

  // 同时保存到后端和本地
  if (useBackend) {
    try {
      const response = await fetch(`${API_BASE}/maps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(map),
      })
      const data = await response.json()
      if (data.success) {
        console.log('[MapStorage] Saved map to backend:', map.id, map.name)
      }
    } catch (error) {
      console.error('[MapStorage] Failed to save to backend:', error)
    }
  }

  // 始终保存到 localStorage 作为备份
  localStorage.setItem(`${MAP_STORAGE_KEY}_${map.id}`, JSON.stringify(map))

  // 更新列表
  const list = await getMapList()
  const existingIdx = list.findIndex(item => item.id === map.id)
  const listItem: MapListItem = {
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    createdAt: map.createdAt,
    updatedAt: map.updatedAt,
  }

  if (existingIdx >= 0) {
    list[existingIdx] = listItem
  } else {
    list.unshift(listItem)
  }
  saveMapList(list)

  console.log('[MapStorage] Saved map to localStorage:', map.id, map.name)
}

/**
 * 删除地图
 */
export async function deleteMap(id: string): Promise<void> {
  await ensureBackendStatus()

  if (useBackend) {
    try {
      await fetch(`${API_BASE}/maps/${id}`, { method: 'DELETE' })
      console.log('[MapStorage] Deleted map from backend:', id)
    } catch (error) {
      console.error('[MapStorage] Failed to delete from backend:', error)
    }
  }

  localStorage.removeItem(`${MAP_STORAGE_KEY}_${id}`)
  const list = await getMapList()
  const newList = list.filter(item => item.id !== id)
  saveMapList(newList)
}

backendStatusPromise = checkBackendStatus()

// 初始化时检查后端状态
checkBackendStatus()
