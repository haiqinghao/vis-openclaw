import { defineStore } from 'pinia'
import { ref } from 'vue'

// localStorage 键名
const GAME_MAP_STORAGE_KEY = 'vis_game_interface_map'

export const useGameStore = defineStore('game', () => {
  // 从 localStorage 恢复状态
  const savedMapId = localStorage.getItem(GAME_MAP_STORAGE_KEY + '_id')
  const savedMapName = localStorage.getItem(GAME_MAP_STORAGE_KEY + '_name')

  // 选中的游戏界面地图ID
  const selectedGameMapId = ref<string | null>(savedMapId || null)

  // 选中的地图名称（用于显示）
  const selectedGameMapName = ref<string>(savedMapName || '')

  function setGameMap(mapId: string, mapName: string) {
    selectedGameMapId.value = mapId
    selectedGameMapName.value = mapName
    // 持久化到 localStorage
    localStorage.setItem(GAME_MAP_STORAGE_KEY + '_id', mapId)
    localStorage.setItem(GAME_MAP_STORAGE_KEY + '_name', mapName)
    console.log('[GameStore] Selected game map:', mapId, mapName)
  }

  function clearGameMap() {
    selectedGameMapId.value = null
    selectedGameMapName.value = ''
    // 清除 localStorage
    localStorage.removeItem(GAME_MAP_STORAGE_KEY + '_id')
    localStorage.removeItem(GAME_MAP_STORAGE_KEY + '_name')
  }

  return {
    selectedGameMapId,
    selectedGameMapName,
    setGameMap,
    clearGameMap
  }
})