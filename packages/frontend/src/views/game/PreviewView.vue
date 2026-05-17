<template>
  <div class="preview-container">
    <!-- 左侧地图列表 -->
    <div class="map-list-panel">
      <h3 class="panel-title">📂 已保存地图</h3>
      <div v-if="maps.length === 0" class="no-maps">
        <p>暂无保存的地图</p>
        <p>请先在地图编辑器中创建地图</p>
      </div>
      <div v-else class="map-list">
        <div
          v-for="map in maps"
          :key="map.id"
          class="map-item"
          :class="{ selected: selectedMapId === map.id }"
          @click="loadMap(map.id)"
        >
          <span class="map-icon">🗺️</span>
          <div class="map-info">
            <span class="map-name">{{ map.name }}</span>
            <span class="map-size">{{ map.width }} x {{ map.height }}</span>
          </div>
        </div>
      </div>

      <!-- 游戏界面选择 -->
      <div class="game-interface-select">
        <h3 class="panel-title">🎮 游戏界面选择</h3>
        <select
          v-model="gameInterfaceMapId"
          class="game-select"
          @change="onGameInterfaceChange"
        >
          <option value="">-- 请选择地图 --</option>
          <option v-for="map in maps" :key="map.id" :value="map.id">
            {{ map.name }} ({{ map.width }}x{{ map.height }})
          </option>
        </select>
        <p class="select-tip">💡 选中后可在左侧「游戏界面」查看</p>
      </div>
    </div>

    <!-- 中间预览画布 -->
    <div class="preview-main">
      <div class="preview-header" v-if="currentMap">
        <h2>👁️ {{ currentMap.name }}</h2>
        <div class="preview-controls">
          <label>动画速度:</label>
          <input type="range" v-model="animationSpeed" min="0.05" max="0.3" step="0.01">
          <span>{{ animationSpeed }}</span>
          <label style="margin-left: 20px;">缩放:</label>
          <select v-model="zoomLevel">
            <option v-for="level in ZOOM_LEVELS" :key="level" :value="level">
              {{ formatZoomLabel(level) }}
            </option>
          </select>
          <button
            class="btn-view-tool"
            :class="{ active: isPanMode }"
            @click="isPanMode = !isPanMode"
          >拖动地图</button>
          <button class="btn-view-tool" @click="resetPanToCenter">居中</button>
        </div>
      </div>
      <div
        class="canvas-wrapper"
        ref="canvasWrapper"
        :class="{ 'pan-active': isPanMode, panning: isPanning }"
        @wheel.prevent="handleWheelZoom"
      >
        <div v-if="!currentMap" class="placeholder">
          <p>👈 请选择一个地图进行预览</p>
        </div>
      </div>
    </div>

    <!-- 右侧信息面板 -->
    <div class="info-panel" v-if="currentMap">
      <!-- 选中单位信息 -->
      <div v-if="selectedUnit" class="selected-unit-section">
        <h3 class="panel-title highlight">🎯 选中单位</h3>
        <div class="unit-avatar">
          <div class="avatar-frame" :class="selectedUnit.category">
            <span class="unit-icon">{{ getUnitIcon(selectedUnit.type) }}</span>
          </div>
        </div>
        <div class="info-item">
          <span class="label">类型:</span>
          <span class="value">{{ getUnitTypeName(selectedUnit.type) }}</span>
        </div>
        <div class="info-item">
          <span class="label">ID:</span>
          <span class="value small">{{ selectedUnit.id }}</span>
        </div>
        <div class="info-item">
          <span class="label">坐标:</span>
          <span class="value">({{ selectedUnit.gridX }}, {{ selectedUnit.gridY }})</span>
        </div>
        <div class="info-item">
          <span class="label">分类:</span>
          <span class="value">{{ selectedUnit.category }}</span>
        </div>
        <div class="info-item">
          <span class="label">动作:</span>
          <span class="value">{{ selectedUnit.currentAction || 'Idle' }}</span>
        </div>

        <!-- 动作切换区域 -->
        <div v-if="getUnitActions(selectedUnit.type).length > 0" class="action-switch-section">
          <h4 class="action-title">🎬 动作切换</h4>
          <div class="action-buttons">
            <button
              v-for="action in getUnitActions(selectedUnit.type)"
              :key="action.action"
              class="btn-action-small"
              :class="{ active: selectedUnit.currentAction === action.action }"
              @click="switchUnitAction(selectedUnit, action)"
            >
              {{ action.action }}
            </button>
          </div>
        </div>

        <div class="unit-actions">
          <button
            class="btn-action"
            :class="{ active: isMoveMode }"
            @click="toggleMoveMode"
          >
            {{ isMoveMode ? '🎯 移动模式 (点击地图)' : '🚀 开启移动' }}
          </button>
          <button class="btn-action" @click="deselectUnit">取消选中</button>
        </div>
      </div>

      <!-- 地图统计 -->
      <h3 class="panel-title">📊 地图信息</h3>
      <div class="info-item">
        <span class="label">名称:</span>
        <span class="value">{{ currentMap.name }}</span>
      </div>
      <div class="info-item">
        <span class="label">尺寸:</span>
        <span class="value">{{ currentMap.width }} x {{ currentMap.height }}</span>
      </div>
      <div class="info-item">
        <span class="label">地形瓦片:</span>
        <span class="value">{{ terrainCount }}</span>
      </div>
      <div class="info-item">
        <span class="label">环境元素:</span>
        <span class="value">{{ currentMap.layers.environment.length }}</span>
      </div>
      <div class="info-item">
        <span class="label">单位数量:</span>
        <span class="value">{{ currentMap.layers.units.length }}</span>
      </div>

      <div class="tips-section">
        <p class="tip">💡 点击单位可选中</p>
        <p class="tip">💡 选中后开启移动模式，点击地图瞬移</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import * as PIXI from 'pixi.js'
import { useGameStore } from '@/stores/game'
import { getMapList, getMapData, type MapData, type MapListItem } from '@/types/map'

const gameStore = useGameStore()

// =====================================================
// 类型定义
// =====================================================

/** 单位分类 */
type UnitCategory = 'warrior' | 'monster' | 'building' | 'animal'

/** 单位实例 */
interface UnitInstance {
  id: string           // 唯一标识
  type: string         // 单位类型
  category: UnitCategory
  gridX: number        // 网格坐标
  gridY: number
  sprite: PIXI.AnimatedSprite  // 精灵引用
  currentAction: string       // 当前动作
}

// =====================================================
// 常量配置
// =====================================================
const TILE_SIZE = 32
const ZOOM_LEVELS = [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1]

function formatZoomLabel(level: number) {
  return `${Math.round(level * 100)}%`
}

// 单位类型配置
const UNIT_TYPE_INFO: Record<string, { name: string; category: UnitCategory; icon: string }> = {
  warrior: { name: '战士', category: 'warrior', icon: '⚔️' },
  archer: { name: '弓箭手', category: 'warrior', icon: '🏹' },
  monk: { name: '僧侣', category: 'warrior', icon: '🧙' },
  pawn: { name: '步兵', category: 'warrior', icon: '🗡️' },
  lancer: { name: '枪骑兵', category: 'warrior', icon: '🏇' },
  monster_warrior: { name: '怪物战士', category: 'monster', icon: '👹' },
  monster_archer: { name: '怪物弓手', category: 'monster', icon: '👺' },
  monster_boss: { name: '怪物Boss', category: 'monster', icon: '👿' },
  barracks: { name: '兵营', category: 'building', icon: '🏠' },
  castle: { name: '城堡', category: 'building', icon: '🏰' },
  castle_yellow: { name: '黄城堡', category: 'building', icon: '🏰' },
  // 动物/资源
  gold: { name: '金矿', category: 'animal', icon: '💰' },
  sheep: { name: '绵羊', category: 'animal', icon: '🐑' },
  sheep_idle: { name: '绵羊(站立)', category: 'animal', icon: '🐑' },
  sheep_move: { name: '绵羊(移动)', category: 'animal', icon: '🐑' },
}

// 素材路径配置
const TERRAIN_FILES: Record<string, string> = {
  grass1: '/assets/sprites/terrain/grass1.png',
  grass2: '/assets/sprites/terrain/grass2.png',
}

const ENVIRONMENT_CONFIG: Record<string, { path: string; frameW: number; frameH: number }> = {
  tree1: { path: '/assets/sprites/terrain/tree1.png', frameW: 192, frameH: 256 },
  tree2: { path: '/assets/sprites/terrain/tree2.png', frameW: 192, frameH: 256 },
  tree3: { path: '/assets/sprites/terrain/tree3.png', frameW: 192, frameH: 192 },
  tree4: { path: '/assets/sprites/terrain/tree4.png', frameW: 192, frameH: 192 },
  rock: { path: '/assets/sprites/terrain/rock.png', frameW: 64, frameH: 64 },
  rock1: { path: '/assets/sprites/terrain/rock1.png', frameW: 64, frameH: 64 },
  rock2: { path: '/assets/sprites/terrain/rock2.png', frameW: 64, frameH: 64 },
  rock3: { path: '/assets/sprites/terrain/rock3.png', frameW: 64, frameH: 64 },
  bush: { path: '/assets/sprites/terrain/bush.png', frameW: 128, frameH: 128 },
  bush1: { path: '/assets/sprites/terrain/bush1.png', frameW: 128, frameH: 128 },
  bush2: { path: '/assets/sprites/terrain/bush2.png', frameW: 128, frameH: 128 },
}

const UNIT_FILES: Record<string, { path: string; frameW: number; frameH: number }> = {
  warrior: { path: '/assets/sprites/units/warrior.png', frameW: 192, frameH: 192 },
  archer: { path: '/assets/sprites/units/archer.png', frameW: 192, frameH: 192 },
  monk: { path: '/assets/sprites/units/monk.png', frameW: 192, frameH: 192 },
  pawn: { path: '/assets/sprites/units/pawn.png', frameW: 192, frameH: 192 },
  lancer: { path: '/assets/sprites/units/Lancer_Idle.png', frameW: 192, frameH: 320 },
  monster_warrior: { path: '/assets/sprites/units/monster_warrior.png', frameW: 192, frameH: 192 },
  monster_archer: { path: '/assets/sprites/units/monster_archer.png', frameW: 192, frameH: 192 },
  monster_boss: { path: '/assets/sprites/units/monster_boss.png', frameW: 192, frameH: 192 },
  barracks: { path: '/assets/sprites/buildings/barracks.png', frameW: 192, frameH: 256 },
  castle: { path: '/assets/sprites/buildings/castle.png', frameW: 320, frameH: 256 },
  castle_yellow: { path: '/assets/sprites/buildings/castle_yellow.png', frameW: 320, frameH: 256 },
  // 动物/资源（从 terrain 文件夹）
  gold: { path: '/assets/sprites/terrain/gold.png', frameW: 128, frameH: 128 },
  sheep: { path: '/assets/sprites/terrain/sheep_idle.png', frameW: 128, frameH: 128 },
  sheep_idle: { path: '/assets/sprites/terrain/sheep_idle.png', frameW: 128, frameH: 128 },
  sheep_move: { path: '/assets/sprites/terrain/sheep_move.png', frameW: 128, frameH: 128 },
}

// Black Units 动作配置（来自单位演示）
const UNIT_ACTIONS: Record<string, { action: string; file: string; path: string; frameW: number; frameH: number; frames: number }[]> = {
  warrior: [
    { action: 'Idle', file: 'Warrior_Idle', path: '/assets/sprites/black-units/Warrior/Warrior_Idle.png', frameW: 192, frameH: 192, frames: 8 },
    { action: 'Run', file: 'Warrior_Run', path: '/assets/sprites/black-units/Warrior/Warrior_Run.png', frameW: 192, frameH: 192, frames: 6 },
    { action: 'Attack1', file: 'Warrior_Attack1', path: '/assets/sprites/black-units/Warrior/Warrior_Attack1.png', frameW: 192, frameH: 192, frames: 4 },
    { action: 'Attack2', file: 'Warrior_Attack2', path: '/assets/sprites/black-units/Warrior/Warrior_Attack2.png', frameW: 192, frameH: 192, frames: 4 },
    { action: 'Guard', file: 'Warrior_Guard', path: '/assets/sprites/black-units/Warrior/Warrior_Guard.png', frameW: 192, frameH: 192, frames: 6 },
  ],
  archer: [
    { action: 'Idle', file: 'Archer_Idle', path: '/assets/sprites/black-units/Archer/Archer_Idle.png', frameW: 192, frameH: 192, frames: 6 },
    { action: 'Run', file: 'Archer_Run', path: '/assets/sprites/black-units/Archer/Archer_Run.png', frameW: 192, frameH: 192, frames: 4 },
    { action: 'Shoot', file: 'Archer_Shoot', path: '/assets/sprites/black-units/Archer/Archer_Shoot.png', frameW: 192, frameH: 192, frames: 8 },
  ],
  lancer: [
    { action: 'Idle', file: 'Lancer_Idle', path: '/assets/sprites/black-units/Lancer/Lancer_Idle.png', frameW: 320, frameH: 320, frames: 12 },
    { action: 'Run', file: 'Lancer_Run', path: '/assets/sprites/black-units/Lancer/Lancer_Run.png', frameW: 320, frameH: 320, frames: 6 },
    { action: 'Attack→', file: 'Lancer_Right_Attack', path: '/assets/sprites/black-units/Lancer/Lancer_Right_Attack.png', frameW: 320, frameH: 320, frames: 3 },
    { action: 'Defence→', file: 'Lancer_Right_Defence', path: '/assets/sprites/black-units/Lancer/Lancer_Right_Defence.png', frameW: 320, frameH: 320, frames: 6 },
    { action: 'Attack↑', file: 'Lancer_Up_Attack', path: '/assets/sprites/black-units/Lancer/Lancer_Up_Attack.png', frameW: 320, frameH: 320, frames: 3 },
    { action: 'Attack↓', file: 'Lancer_Down_Attack', path: '/assets/sprites/black-units/Lancer/Lancer_Down_Attack.png', frameW: 320, frameH: 320, frames: 3 },
  ],
  monk: [
    { action: 'Idle', file: 'Idle', path: '/assets/sprites/black-units/Monk/Idle.png', frameW: 192, frameH: 192, frames: 6 },
    { action: 'Run', file: 'Run', path: '/assets/sprites/black-units/Monk/Run.png', frameW: 192, frameH: 192, frames: 4 },
    { action: 'Heal', file: 'Heal', path: '/assets/sprites/black-units/Monk/Heal.png', frameW: 192, frameH: 192, frames: 11 },
    { action: 'Heal FX', file: 'Heal_Effect', path: '/assets/sprites/black-units/Monk/Heal_Effect.png', frameW: 192, frameH: 192, frames: 11 },
  ],
  pawn: [
    { action: 'Idle', file: 'Pawn_Idle', path: '/assets/sprites/black-units/Pawn/Pawn_Idle.png', frameW: 192, frameH: 192, frames: 8 },
    { action: 'Run', file: 'Pawn_Run', path: '/assets/sprites/black-units/Pawn/Pawn_Run.png', frameW: 192, frameH: 192, frames: 6 },
    { action: 'Idle🪓', file: 'Pawn_Idle_Axe', path: '/assets/sprites/black-units/Pawn/Pawn_Idle_Axe.png', frameW: 192, frameH: 192, frames: 8 },
    { action: 'Run🪓', file: 'Pawn_Run_Axe', path: '/assets/sprites/black-units/Pawn/Pawn_Run_Axe.png', frameW: 192, frameH: 192, frames: 6 },
    { action: 'Idle🔨', file: 'Pawn_Idle_Hammer', path: '/assets/sprites/black-units/Pawn/Pawn_Idle_Hammer.png', frameW: 192, frameH: 192, frames: 8 },
    { action: 'Run🔨', file: 'Pawn_Run_Hammer', path: '/assets/sprites/black-units/Pawn/Pawn_Run_Hammer.png', frameW: 192, frameH: 192, frames: 6 },
  ],
  monster_warrior: [
    { action: 'Idle', file: 'monster_warrior', path: '/assets/sprites/units/monster_warrior.png', frameW: 192, frameH: 192, frames: 4 },
    { action: 'Run', file: 'monster_warrior_run', path: '/assets/sprites/units/monster_warrior_run.png', frameW: 192, frameH: 192, frames: 4 },
  ],
  monster_archer: [
    { action: 'Idle', file: 'monster_archer', path: '/assets/sprites/units/monster_archer.png', frameW: 192, frameH: 192, frames: 4 },
    { action: 'Run', file: 'monster_archer_run', path: '/assets/sprites/units/monster_archer_run.png', frameW: 192, frameH: 192, frames: 4 },
  ],
  monster_boss: [
    { action: 'Idle', file: 'monster_boss', path: '/assets/sprites/units/monster_boss.png', frameW: 192, frameH: 192, frames: 4 },
    { action: 'Run', file: 'monster_boss_run', path: '/assets/sprites/units/monster_boss_run.png', frameW: 192, frameH: 192, frames: 4 },
  ],
  sheep: [
    { action: 'Idle', file: 'sheep_idle', path: '/assets/sprites/terrain/sheep_idle.png', frameW: 128, frameH: 128, frames: 6 },
    { action: 'Move', file: 'sheep_move', path: '/assets/sprites/terrain/sheep_move.png', frameW: 128, frameH: 128, frames: 4 },
  ],
  gold: [
    { action: 'Static', file: 'gold', path: '/assets/sprites/terrain/gold.png', frameW: 128, frameH: 128, frames: 1 },
  ],
  barracks: [
    { action: 'Static', file: 'barracks', path: '/assets/sprites/buildings/barracks.png', frameW: 192, frameH: 256, frames: 1 },
  ],
  castle: [
    { action: 'Static', file: 'castle', path: '/assets/sprites/buildings/castle.png', frameW: 320, frameH: 256, frames: 1 },
  ],
  castle_yellow: [
    { action: 'Static', file: 'castle_yellow', path: '/assets/sprites/buildings/castle_yellow.png', frameW: 320, frameH: 256, frames: 1 },
  ],
}

// 获取单位可用动作列表
function getUnitActions(unitType: string): { action: string; file: string; path: string; frameW: number; frameH: number; frames: number }[] {
  return UNIT_ACTIONS[unitType] || []
}

// =====================================================
// 状态
// =====================================================
const maps = ref<MapListItem[]>([])
const selectedMapId = ref<string | null>(null)
const currentMap = ref<MapData | null>(null)
const canvasWrapper = ref<HTMLElement>()
const animationSpeed = ref(0.1)
const zoomLevel = ref(1)
const isPanMode = ref(false)
const isPanning = ref(false)
const panOffset = ref({ x: 0, y: 0 })
let panStart = { pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 }
let zoomAnchor: { clientX: number; clientY: number } | null = null

// 游戏界面选择
const gameInterfaceMapId = ref<string>('')

// 单位选中状态
const selectedUnit = shallowRef<UnitInstance | null>(null)
const isMoveMode = ref(false)  // 移动模式

// PixiJS
let app: PIXI.Application | null = null
let terrainContainer: PIXI.Container | null = null
let environmentContainer: PIXI.Container | null = null
let unitContainer: PIXI.Container | null = null
let selectionGraphics: PIXI.Graphics | null = null  // 选中高亮
let textureCache: Map<string, PIXI.Texture> = new Map()
let animatedSprites: PIXI.AnimatedSprite[] = []

// 单位实例映射
let unitInstances: Map<string, UnitInstance> = new Map()

// 统计
const terrainCount = computed(() => {
  if (!currentMap.value) return 0
  let count = 0
  currentMap.value.layers.terrain.forEach(row => {
    row.forEach(cell => {
      if (cell !== 'empty') count++
    })
  })
  return count
})

// =====================================================
// 工具函数
// =====================================================

function getUnitTypeName(type: string): string {
  return UNIT_TYPE_INFO[type]?.name || type
}

function getUnitIcon(type: string): string {
  return UNIT_TYPE_INFO[type]?.icon || '❓'
}

function getCanvasElement(): HTMLCanvasElement | null {
  return app ? app.view as HTMLCanvasElement : null
}

function applyCanvasTransform() {
  const canvas = getCanvasElement()
  if (!canvas) return

  canvas.style.transform = `translate(${panOffset.value.x}px, ${panOffset.value.y}px) scale(${zoomLevel.value})`
  canvas.style.transformOrigin = 'top left'
}

function resetPanToCenter() {
  if (!canvasWrapper.value || !currentMap.value) return

  const scaledWidth = currentMap.value.width * TILE_SIZE * zoomLevel.value
  const scaledHeight = currentMap.value.height * TILE_SIZE * zoomLevel.value
  panOffset.value = {
    x: Math.round((canvasWrapper.value.clientWidth - scaledWidth) / 2),
    y: Math.round((canvasWrapper.value.clientHeight - scaledHeight) / 2)
  }
  applyCanvasTransform()
}

function updateZoom(previousZoom = zoomLevel.value) {
  if (!canvasWrapper.value || !currentMap.value) {
    applyCanvasTransform()
    return
  }

  const rect = canvasWrapper.value.getBoundingClientRect()
  const anchorX = zoomAnchor
    ? zoomAnchor.clientX - rect.left
    : canvasWrapper.value.clientWidth / 2
  const anchorY = zoomAnchor
    ? zoomAnchor.clientY - rect.top
    : canvasWrapper.value.clientHeight / 2
  const mapAnchorX = (anchorX - panOffset.value.x) / previousZoom
  const mapAnchorY = (anchorY - panOffset.value.y) / previousZoom

  panOffset.value = {
    x: anchorX - mapAnchorX * zoomLevel.value,
    y: anchorY - mapAnchorY * zoomLevel.value
  }
  zoomAnchor = null
  applyCanvasTransform()
}

function handleWheelZoom(event: WheelEvent) {
  if (!currentMap.value) return

  const currentIndex = ZOOM_LEVELS.findIndex((value) => value === zoomLevel.value)
  const safeIndex = currentIndex >= 0 ? currentIndex : 0
  const direction = event.deltaY > 0 ? 1 : -1
  const nextIndex = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, safeIndex + direction))
  const nextZoom = ZOOM_LEVELS[nextIndex]
  if (nextZoom === zoomLevel.value) return

  zoomAnchor = { clientX: event.clientX, clientY: event.clientY }
  zoomLevel.value = nextZoom
}

function getPointerClientPosition(event: PIXI.FederatedPointerEvent) {
  const eventLike = event as any
  if (typeof eventLike.clientX === 'number' && typeof eventLike.clientY === 'number') {
    return { x: eventLike.clientX, y: eventLike.clientY }
  }

  const nativeEvent = eventLike.nativeEvent as PointerEvent | MouseEvent | undefined
  if (nativeEvent && typeof nativeEvent.clientX === 'number' && typeof nativeEvent.clientY === 'number') {
    return { x: nativeEvent.clientX, y: nativeEvent.clientY }
  }

  const canvas = getCanvasElement()
  const rect = canvas?.getBoundingClientRect()
  return {
    x: (rect?.left || 0) + event.global.x * zoomLevel.value,
    y: (rect?.top || 0) + event.global.y * zoomLevel.value
  }
}

function getPointerTile(event: PIXI.FederatedPointerEvent) {
  const canvas = getCanvasElement()
  if (!canvas) return null

  const pointer = getPointerClientPosition(event)
  const rect = canvas.getBoundingClientRect()
  const localX = (pointer.x - rect.left) / zoomLevel.value
  const localY = (pointer.y - rect.top) / zoomLevel.value

  return {
    gridX: Math.floor(localX / TILE_SIZE),
    gridY: Math.floor(localY / TILE_SIZE)
  }
}

// =====================================================
// 加载地图列表
// =====================================================
async function loadMapList() {
  maps.value = await getMapList()
  // 初始化游戏界面选择（从store中恢复）
  if (gameStore.selectedGameMapId) {
    gameInterfaceMapId.value = gameStore.selectedGameMapId
  }
}

// =====================================================
// 游戏界面选择变化
// =====================================================
function onGameInterfaceChange() {
  if (gameInterfaceMapId.value) {
    const selectedMap = maps.value.find(m => m.id === gameInterfaceMapId.value)
    if (selectedMap) {
      gameStore.setGameMap(gameInterfaceMapId.value, selectedMap.name)
    }
  } else {
    gameStore.clearGameMap()
  }
}

// =====================================================
// 加载地图
// =====================================================
async function loadMap(mapId: string) {
  selectedMapId.value = mapId
  selectedUnit.value = null  // 切换地图时清除选中
  const mapData = await getMapData(mapId)
  if (mapData) {
    currentMap.value = mapData
    await nextTick()
    await initPreview()
  }
}

// =====================================================
// 加载素材
// =====================================================
async function loadAssets() {
  for (const [key, path] of Object.entries(TERRAIN_FILES)) {
    if (!textureCache.has(key)) {
      const tex = await PIXI.Assets.load(path)
      textureCache.set(key, tex)
    }
  }

  for (const [key, config] of Object.entries(ENVIRONMENT_CONFIG)) {
    if (!textureCache.has(key)) {
      const tex = await PIXI.Assets.load(config.path)
      textureCache.set(key, tex)
    }
  }

  for (const [key, config] of Object.entries(UNIT_FILES)) {
    if (!textureCache.has(key)) {
      const tex = await PIXI.Assets.load(config.path)
      textureCache.set(key, tex)
    }
  }
}

// =====================================================
// 初始化预览
// =====================================================
async function initPreview() {
  if (!canvasWrapper.value || !currentMap.value) return

  destroyPreview()

  await loadAssets()

  const mapData = currentMap.value
  const width = mapData.width * TILE_SIZE
  const height = mapData.height * TILE_SIZE

  app = new PIXI.Application({
    width,
    height,
    backgroundColor: 0x2a2a3e,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    antialias: false,
  })

  const canvas = app.view as HTMLCanvasElement
  canvas.style.position = 'absolute'
  canvas.style.left = '0'
  canvas.style.top = '0'
  canvas.style.transformOrigin = 'top left'
  canvasWrapper.value.appendChild(canvas)
  resetPanToCenter()

  // 创建容器（从下到上）
  terrainContainer = new PIXI.Container()
  environmentContainer = new PIXI.Container()
  unitContainer = new PIXI.Container()
  selectionGraphics = new PIXI.Graphics()  // 选中高亮层

  app.stage.addChild(terrainContainer)
  app.stage.addChild(environmentContainer)
  app.stage.addChild(unitContainer)
  app.stage.addChild(selectionGraphics)  // 最上层

  renderTerrain()
  renderEnvironment()
  await renderUnits()

  // 启动动画循环
  app.ticker.add(() => {
    animatedSprites.forEach(sprite => {
      if (sprite.playing) {
        sprite.animationSpeed = animationSpeed.value
      }
    })
  })

  // 地图点击事件（用于移动单位）
  app.stage.eventMode = 'static'
  app.stage.hitArea = new PIXI.Rectangle(0, 0, width, height)
  app.stage.on('pointerdown', handleStagePointerDown)
  app.stage.on('pointermove', handleStagePointerMove)
  app.stage.on('pointerup', handleStagePointerUp)
  app.stage.on('pointerupoutside', handleStagePointerUp)
}

// =====================================================
// 渲染地形层
// =====================================================
function renderTerrain() {
  if (!terrainContainer || !currentMap.value) return

  terrainContainer.removeChildren()

  currentMap.value.layers.terrain.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === 'empty') return

      const tex = textureCache.get(cell)
      if (tex) {
        const sprite = new PIXI.Sprite(tex)
        sprite.x = x * TILE_SIZE
        sprite.y = y * TILE_SIZE
        sprite.width = TILE_SIZE
        sprite.height = TILE_SIZE
        terrainContainer!.addChild(sprite)
      }
    })
  })
}

// =====================================================
// 渲染环境层
// =====================================================
function renderEnvironment() {
  if (!environmentContainer || !currentMap.value) return

  environmentContainer.removeChildren()

  currentMap.value.layers.environment.forEach(item => {
    const config = ENVIRONMENT_CONFIG[item.type]
    const tex = textureCache.get(item.type)

    if (!config || !tex) return

    const frames: PIXI.Texture[] = []
    const cols = Math.floor(tex.width / config.frameW)

    for (let i = 0; i < cols && i < 8; i++) {
      const frameRect = new PIXI.Rectangle(
        i * config.frameW,
        0,
        config.frameW,
        config.frameH
      )
      const frameTex = new PIXI.Texture(tex.baseTexture, frameRect)
      frames.push(frameTex)
    }

    if (frames.length > 0) {
      const animSprite = new PIXI.AnimatedSprite(frames)
      animSprite.x = item.x * TILE_SIZE
      animSprite.y = item.y * TILE_SIZE
      animSprite.animationSpeed = animationSpeed.value * 0.5
      animSprite.play()

      animatedSprites.push(animSprite)
      environmentContainer!.addChild(animSprite)
    }
  })
}

// =====================================================
// 渲染单位层（带交互）
// =====================================================
async function renderUnits() {
  if (!unitContainer || !currentMap.value) return

  unitContainer.removeChildren()
  animatedSprites = []
  unitInstances.clear()

  currentMap.value.layers.units.forEach((item, index) => {
    const config = UNIT_FILES[item.type]
    if (!config) return

    const tex = textureCache.get(item.type)
    if (!tex) return

    // 创建帧纹理
    const frames: PIXI.Texture[] = []
    const cols = Math.floor(tex.width / config.frameW)

    for (let i = 0; i < cols && i < 6; i++) {
      const frameRect = new PIXI.Rectangle(
        i * config.frameW,
        0,
        config.frameW,
        config.frameH
      )
      const frameTex = new PIXI.Texture(tex.baseTexture, frameRect)
      frames.push(frameTex)
    }

    if (frames.length > 0) {
      const animSprite = new PIXI.AnimatedSprite(frames)
      animSprite.x = item.x * TILE_SIZE
      animSprite.y = item.y * TILE_SIZE
      animSprite.animationSpeed = animationSpeed.value
      animSprite.play()

      // 生成唯一ID
      const unitId = `unit_${index}_${item.type}_${item.x}_${item.y}`

      // 存储单位实例
      const unitInfo = UNIT_TYPE_INFO[item.type] || { category: 'warrior' as UnitCategory }
      const unitInstance: UnitInstance = {
        id: unitId,
        type: item.type,
        category: unitInfo.category,
        gridX: item.x,
        gridY: item.y,
        sprite: animSprite,
        currentAction: 'Idle',  // 默认动作
      }
      unitInstances.set(unitId, unitInstance)

      // 启用交互
      animSprite.eventMode = 'static'
      animSprite.cursor = 'pointer'

      // 存储ID到精灵上
      ;(animSprite as any).unitId = unitId

      // 点击事件
      animSprite.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        if (isPanMode.value) return
        event.stopPropagation()
        selectUnit(unitId)
      })

      // 鼠标悬停效果
      animSprite.on('pointerover', () => {
        if (selectedUnit.value?.id !== unitId) {
          drawHoverHighlight(unitInstance)
        }
      })

      animSprite.on('pointerout', () => {
        if (selectedUnit.value?.id !== unitId) {
          clearHoverHighlight()
        }
      })

      animatedSprites.push(animSprite)
      unitContainer!.addChild(animSprite)
    }
  })
}

// =====================================================
// 选中单位
// =====================================================
function selectUnit(unitId: string) {
  const unit = unitInstances.get(unitId)
  if (!unit) return

  selectedUnit.value = unit
  console.log('[Preview] Unit selected:', unitId, unit.type, `(${unit.gridX}, ${unit.gridY})`)

  // 绘制选中高亮
  drawSelectionHighlight(unit)
}

// =====================================================
// 取消选中
// =====================================================
function deselectUnit() {
  selectedUnit.value = null
  isMoveMode.value = false
  clearSelectionHighlight()
}

// =====================================================
// 切换单位动作
// =====================================================
async function switchUnitAction(unit: UnitInstance, actionConfig: { action: string; file: string; path: string; frameW: number; frameH: number; frames: number }) {
  if (!unit.sprite || !unitContainer) return

  try {
    // 加载新动作的纹理
    let tex = textureCache.get(actionConfig.file)
    if (!tex) {
      tex = await PIXI.Assets.load(actionConfig.path) as PIXI.Texture
      if (!tex) return
      textureCache.set(actionConfig.file, tex)
    }

    // 创建新的帧纹理数组
    const frames: PIXI.Texture[] = []
    for (let i = 0; i < actionConfig.frames; i++) {
      const frameRect = new PIXI.Rectangle(
        i * actionConfig.frameW,
        0,
        actionConfig.frameW,
        actionConfig.frameH
      )
      const frameTex = new PIXI.Texture(tex.baseTexture, frameRect)
      frames.push(frameTex)
    }

    // 保存当前位置
    const x = unit.sprite.x
    const y = unit.sprite.y
    const playing = unit.sprite.playing

    // 从 animatedSprites 数组中移除旧精灵
    const oldSpriteIndex = animatedSprites.indexOf(unit.sprite)
    if (oldSpriteIndex >= 0) {
      animatedSprites.splice(oldSpriteIndex, 1)
    }

    // 从容器移除并销毁旧精灵
    unitContainer.removeChild(unit.sprite)
    unit.sprite.destroy()

    // 创建新的动画精灵
    const newSprite = new PIXI.AnimatedSprite(frames)
    newSprite.x = x
    newSprite.y = y
    newSprite.animationSpeed = animationSpeed.value
    if (playing) newSprite.play()

    // 恢复交互
    newSprite.eventMode = 'static'
    newSprite.cursor = 'pointer'
    ;(newSprite as any).unitId = unit.id

    newSprite.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
      if (isPanMode.value) return
      event.stopPropagation()
      selectUnit(unit.id)
    })

    newSprite.on('pointerover', () => {
      if (selectedUnit.value?.id !== unit.id) {
        drawHoverHighlight(unit)
      }
    })

    newSprite.on('pointerout', () => {
      if (selectedUnit.value?.id !== unit.id) {
        clearHoverHighlight()
      }
    })

    // 更新单位实例
    unit.sprite = newSprite
    unit.currentAction = actionConfig.action

    // 添加到数组和容器
    animatedSprites.push(newSprite)
    unitContainer.addChild(newSprite)

    // 更新选中高亮
    if (selectedUnit.value?.id === unit.id) {
      drawSelectionHighlight(unit)
    }

    console.log(`[Preview] Unit action switched: ${unit.type} -> ${actionConfig.action}`)

  } catch (error) {
    console.error(`[Preview] Failed to switch action: ${actionConfig.path}`, error)
  }
}

// =====================================================
// 切换移动模式
// =====================================================
function toggleMoveMode() {
  if (!selectedUnit.value) return

  isMoveMode.value = !isMoveMode.value

  if (isMoveMode.value) {
    console.log('[Preview] Move mode enabled - click on map to move unit')
    // 更新高亮颜色为蓝色
    drawSelectionHighlight(selectedUnit.value)
  } else {
    // 恢复普通选中颜色
    if (selectedUnit.value) {
      drawSelectionHighlight(selectedUnit.value)
    }
  }
}

// =====================================================
// 移动单位到指定位置
// =====================================================
function moveUnitTo(unit: UnitInstance, targetX: number, targetY: number) {
  if (!unit.sprite || !currentMap.value) return

  const oldX = unit.gridX
  const oldY = unit.gridY

  // 更新单位实例
  unit.gridX = targetX
  unit.gridY = targetY

  // 更新精灵位置（瞬间移动）
  unit.sprite.x = targetX * TILE_SIZE
  unit.sprite.y = targetY * TILE_SIZE

  // 更新地图数据
  const unitIndex = currentMap.value.layers.units.findIndex(
    u => u.x === oldX && u.y === oldY && u.type === unit.type
  )
  if (unitIndex >= 0) {
    currentMap.value.layers.units[unitIndex].x = targetX
    currentMap.value.layers.units[unitIndex].y = targetY
  }

  // 更新选中高亮位置
  drawSelectionHighlight(unit)

  // 退出移动模式
  isMoveMode.value = false

  console.log(`[Preview] Unit moved: (${oldX}, ${oldY}) → (${targetX}, ${targetY})`)
}

// =====================================================
// 处理地图点击（移动单位）
// =====================================================
function handleStagePointerDown(event: PIXI.FederatedPointerEvent) {
  if (isPanMode.value) {
    const pointer = getPointerClientPosition(event)
    isPanning.value = true
    panStart = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      offsetX: panOffset.value.x,
      offsetY: panOffset.value.y
    }
    return
  }

  handleMapClick(event)
}

function handleStagePointerMove(event: PIXI.FederatedPointerEvent) {
  if (!isPanning.value) return

  const pointer = getPointerClientPosition(event)
  panOffset.value = {
    x: panStart.offsetX + pointer.x - panStart.pointerX,
    y: panStart.offsetY + pointer.y - panStart.pointerY
  }
  applyCanvasTransform()
}

function handleStagePointerUp() {
  isPanning.value = false
}

function handleMapClick(event: PIXI.FederatedPointerEvent) {
  if (!isMoveMode.value || !selectedUnit.value || !app) return

  const tile = getPointerTile(event)
  if (!tile) return
  const { gridX, gridY } = tile

  // 边界检查
  if (!currentMap.value) return
  if (gridX < 0 || gridX >= currentMap.value.width || gridY < 0 || gridY >= currentMap.value.height) {
    console.log('[Preview] Click out of bounds')
    return
  }

  // 检查目标位置是否已有单位
  const targetUnit = Array.from(unitInstances.values()).find(
    u => u.gridX === gridX && u.gridY === gridY
  )

  if (targetUnit && targetUnit.id !== selectedUnit.value.id) {
    console.log('[Preview] Target position occupied by another unit')
    return
  }

  // 执行移动
  moveUnitTo(selectedUnit.value, gridX, gridY)
}

// =====================================================
// 绘制选中高亮
// =====================================================
function drawSelectionHighlight(unit: UnitInstance) {
  if (!selectionGraphics || !unit.sprite) return

  selectionGraphics.clear()

  const sprite = unit.sprite
  const bounds = sprite.getBounds()

  // 根据分类选择颜色
  const colors: Record<UnitCategory, number> = {
    warrior: 0x00ff88,    // 绿色 - 友方
    monster: 0xff4444,    // 红色 - 敌方
    building: 0xffaa00,   // 橙色 - 建筑
    animal: 0xaaddff,     // 浅蓝色 - 动物/资源
  }

  let color = colors[unit.category] || 0x00ff88

  // 移动模式时使用不同颜色
  if (isMoveMode.value) {
    color = 0x00aaff  // 蓝色表示等待移动
  }

  // 绘制选中边框
  selectionGraphics.lineStyle(3, color, 1)
  selectionGraphics.drawRect(
    bounds.x - 2,
    bounds.y - 2,
    bounds.width + 4,
    bounds.height + 4
  )

  // 绘制四角标记
  const cornerSize = 8
  selectionGraphics.beginFill(color, 1)

  // 左上角
  selectionGraphics.drawRect(bounds.x - 2, bounds.y - 2, cornerSize, 3)
  selectionGraphics.drawRect(bounds.x - 2, bounds.y - 2, 3, cornerSize)

  // 右上角
  selectionGraphics.drawRect(bounds.x + bounds.width - cornerSize + 2, bounds.y - 2, cornerSize, 3)
  selectionGraphics.drawRect(bounds.x + bounds.width - 1, bounds.y - 2, 3, cornerSize)

  // 左下角
  selectionGraphics.drawRect(bounds.x - 2, bounds.y + bounds.height - 1, cornerSize, 3)
  selectionGraphics.drawRect(bounds.x - 2, bounds.y + bounds.height - cornerSize + 2, 3, cornerSize)

  // 右下角
  selectionGraphics.drawRect(bounds.x + bounds.width - cornerSize + 2, bounds.y + bounds.height - 1, cornerSize, 3)
  selectionGraphics.drawRect(bounds.x + bounds.width - 1, bounds.y + bounds.height - cornerSize + 2, 3, cornerSize)

  selectionGraphics.endFill()

  // 移动模式时绘制目标指示
  if (isMoveMode.value) {
    selectionGraphics.lineStyle(1, color, 0.3)
    // 可以在这里添加一些视觉提示
  }
}

// =====================================================
// 绘制悬停高亮
// =====================================================
function drawHoverHighlight(unit: UnitInstance) {
  if (!selectionGraphics || selectedUnit.value || !unit.sprite) return

  const sprite = unit.sprite
  const bounds = sprite.getBounds()

  selectionGraphics.lineStyle(2, 0xffffff, 0.5)
  selectionGraphics.drawRect(
    bounds.x - 1,
    bounds.y - 1,
    bounds.width + 2,
    bounds.height + 2
  )
}

// =====================================================
// 清除悬停高亮
// =====================================================
function clearHoverHighlight() {
  if (selectedUnit.value) return
  if (selectionGraphics) {
    selectionGraphics.clear()
  }
}

// =====================================================
// 清除选中高亮
// =====================================================
function clearSelectionHighlight() {
  if (selectionGraphics) {
    selectionGraphics.clear()
  }
}

// =====================================================
// 清理
// =====================================================
function destroyPreview() {
  animatedSprites.forEach(s => s.destroy())
  animatedSprites = []
  unitInstances.clear()
  selectedUnit.value = null
  isPanning.value = false

  if (app) {
    app.destroy(true)
    app = null
    terrainContainer = null
    environmentContainer = null
    unitContainer = null
    selectionGraphics = null
  }
}

function handleWindowResize() {
  updateZoom(zoomLevel.value)
}

// =====================================================
// 监听缩放变化
// =====================================================
watch(zoomLevel, (_value, oldValue) => {
  if (app) {
    const previousZoom = typeof oldValue === 'number' ? oldValue : zoomLevel.value
    updateZoom(previousZoom)

    // 重绘选中高亮（位置会变）
    if (selectedUnit.value) {
      nextTick(() => {
        drawSelectionHighlight(selectedUnit.value!)
      })
    }
  }
})

// =====================================================
// 监听移动模式变化
// =====================================================
watch(isMoveMode, () => {
  if (selectedUnit.value) {
    drawSelectionHighlight(selectedUnit.value)
  }
})

// =====================================================
// 生命周期
// =====================================================
onMounted(async () => {
  await loadMapList()
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  destroyPreview()
})
</script>

<style scoped>
.preview-container {
  display: flex;
  height: calc(100vh - 50px);
  background: #0a0a0f;
}

.map-list-panel {
  width: 200px;
  background: rgba(26, 26, 46, 0.95);
  border-right: 2px solid #00ff88;
  padding: 15px;
  overflow-y: auto;
}

.panel-title {
  font-size: 13px;
  color: #00ff88;
  margin-bottom: 15px;
  border-bottom: 1px solid rgba(0, 255, 136, 0.3);
  padding-bottom: 8px;
}

.panel-title.highlight {
  color: #ffaa00;
  border-bottom-color: rgba(255, 170, 0, 0.3);
}

.no-maps {
  color: #666;
  font-size: 12px;
  text-align: center;
  padding: 20px 0;
}

.map-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.map-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: rgba(42, 42, 62, 0.8);
  border: 2px solid #333;
  cursor: pointer;
  transition: all 0.2s;
}

.map-item:hover {
  border-color: #00aaff;
}

.map-item.selected {
  border-color: #00ff88;
  background: rgba(0, 255, 136, 0.1);
}

.map-icon {
  font-size: 20px;
}

.map-info {
  display: flex;
  flex-direction: column;
}

.map-name {
  font-size: 12px;
  color: #fff;
}

.map-size {
  font-size: 10px;
  color: #888;
}

.preview-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background: rgba(26, 26, 46, 0.9);
  border-bottom: 1px solid #333;
}

.preview-header h2 {
  font-size: 14px;
  color: #00ff88;
  margin: 0;
}

.preview-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #aaa;
}

.preview-controls input[type="range"] {
  width: 80px;
}

.preview-controls select {
  background: #1a1a2e;
  border: 1px solid #00ff88;
  color: #00ff88;
  padding: 4px 8px;
}

.btn-view-tool {
  background: #1a1a2e;
  border: 1px solid #00ff88;
  color: #00ff88;
  padding: 4px 8px;
  cursor: pointer;
}

.btn-view-tool:hover,
.btn-view-tool.active {
  background: #00ff88;
  color: #0a0a0f;
}

.canvas-wrapper {
  flex: 1;
  position: relative;
  overflow: hidden;
  background: #0a0a0f;
  cursor: default;
  touch-action: none;
}

.canvas-wrapper.pan-active { cursor: grab; }
.canvas-wrapper.panning { cursor: grabbing; }

.canvas-wrapper :deep(canvas) {
  position: absolute;
  left: 0;
  top: 0;
  image-rendering: pixelated;
  cursor: inherit;
  user-select: none;
}

.placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  inset: 0;
  height: 100%;
  color: #666;
  font-size: 14px;
}

.info-panel {
  width: 180px;
  background: rgba(26, 26, 46, 0.95);
  border-left: 2px solid #00ff88;
  padding: 15px;
  overflow-y: auto;
}

.info-item {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.info-item .label {
  color: #888;
  font-size: 11px;
}

.info-item .value {
  color: #00ff88;
  font-size: 12px;
}

.info-item .value.small {
  font-size: 10px;
  color: #aaa;
}

/* 选中单位区域 */
.selected-unit-section {
  background: rgba(0, 255, 136, 0.05);
  border: 1px solid rgba(0, 255, 136, 0.3);
  border-radius: 4px;
  padding: 10px;
  margin-bottom: 15px;
}

.unit-avatar {
  display: flex;
  justify-content: center;
  margin: 10px 0;
}

.avatar-frame {
  width: 50px;
  height: 50px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid;
}

.avatar-frame.warrior {
  background: rgba(0, 255, 136, 0.1);
  border-color: #00ff88;
}

.avatar-frame.monster {
  background: rgba(255, 68, 68, 0.1);
  border-color: #ff4444;
}

.avatar-frame.building {
  background: rgba(255, 170, 0, 0.1);
  border-color: #ffaa00;
}

.avatar-frame.animal {
  background: rgba(170, 221, 255, 0.1);
  border-color: #aaddff;
}

.unit-icon {
  font-size: 24px;
}

.unit-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.btn-action {
  font-size: 11px;
  padding: 6px 10px;
  background: #1a1a2e;
  border: 1px solid #00ff88;
  color: #00ff88;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-action:hover {
  background: #00ff88;
  color: #0a0a0f;
}

.btn-action.active {
  background: #00ff88;
  color: #0a0a0f;
  box-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
}

/* 动作切换区域 */
.action-switch-section {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 170, 0, 0.2);
}

.action-title {
  font-size: 11px;
  color: #ffaa00;
  margin: 0 0 8px 0;
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.btn-action-small {
  font-size: 10px;
  padding: 4px 8px;
  background: #1a1a2e;
  border: 1px solid #ffaa00;
  color: #ffaa00;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 50px;
}

.btn-action-small:hover {
  background: #ffaa00;
  color: #0a0a0f;
}

.btn-action-small.active {
  background: #ffaa00;
  color: #0a0a0f;
  box-shadow: 0 0 6px rgba(255, 170, 0, 0.5);
}

.tips-section {
  margin-top: 15px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.tip {
  font-size: 11px;
  color: #666;
  margin: 0;
}

/* 游戏界面选择区域 */
.game-interface-select {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid rgba(0, 255, 136, 0.3);
}

.game-select {
  width: 100%;
  padding: 8px 12px;
  background: rgba(42, 42, 62, 0.8);
  border: 2px solid #00aaff;
  color: #00aaff;
  font-size: 12px;
  cursor: pointer;
  margin-top: 10px;
}

.game-select:hover {
  border-color: #00ff88;
  color: #00ff88;
}

.game-select:focus {
  outline: none;
  box-shadow: 0 0 6px rgba(0, 170, 255, 0.3);
}

.select-tip {
  font-size: 11px;
  color: #888;
  margin-top: 8px;
}
</style>
