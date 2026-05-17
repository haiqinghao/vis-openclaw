<template>
  <div class="game-view-container">
    <!-- 无地图时显示提示 -->
    <div v-if="isLoadingMap && !currentMap" class="no-map-placeholder loading-placeholder">
      <div class="placeholder-content loading-content">
        <span class="icon loading-hourglass">⏳</span>
        <h2>正在加载地图</h2>
        <p>正在恢复已选择的游戏界面地图...</p>
      </div>
    </div>

    <div v-else-if="!currentMap" class="no-map-placeholder">
      <div class="placeholder-content">
        <span class="icon">🎮</span>
        <h2>游戏界面</h2>
        <p>请先在「游戏界面编辑 → 预览」中选择一个地图作为游戏界面</p>
        <button class="btn-go" @click="goToPreview">前往预览选择</button>
      </div>
    </div>

    <!-- 有地图时展示 -->
    <div v-else class="game-display">
      <div class="game-header">
        <span class="map-name">{{ currentMap.name }}</span>
        <div class="game-controls">
          <label>动画速度:</label>
          <input type="range" v-model="animationSpeed" min="0.05" max="0.3" step="0.01">
          <span>{{ animationSpeed.toFixed(2) }}</span>
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

      <!-- 任务信息面板（地图左侧） -->
      <div class="task-info-panel">
        <div class="task-panel-title">当前任务</div>
        <div class="task-list">
          <div
            v-for="task in tasksWithAgents"
            :key="task.id"
            class="task-ribbon"
            :style="{ backgroundImage: `url('/assets/sprites/ui/RegularPaper.png')` }"
          >
            <!-- 任务头像和名称 -->
            <div class="ribbon-task-info">
              <span class="task-avatar">{{ getTaskAvatarEmoji(task.avatarType) }}</span>
              <span class="task-name">{{ task.name }}</span>
            </div>
            <!-- 参与任务的 Agent 头像和名称 -->
            <div class="ribbon-agents">
              <div
                v-for="agent in task.participatingAgents"
                :key="agent.id"
                class="agent-item"
              >
                <img
                  v-if="agent.avatarUnit && getAvatarImgUrl(agent.avatarUnit)"
                  :src="getAvatarImgUrl(agent.avatarUnit)"
                  class="agent-avatar-img"
                  alt="agent avatar"
                />
                <span v-else class="agent-avatar-emoji">🤖</span>
                <span class="agent-name">{{ agent.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 选中信息面板 -->
      <div v-if="selectedUnit" class="selection-panel">
        <div class="selection-header">
          <!-- Agent 显示匹配的头像图片 -->
          <img
            v-if="selectedUnit.type === 'agent' && getAvatarImgUrl(selectedUnit.data.avatarUnit)"
            :src="getAvatarImgUrl(selectedUnit.data.avatarUnit)"
            class="selection-avatar"
            alt="avatar"
          />
          <!-- 任务显示 emoji -->
          <span v-else class="selection-icon">{{ selectedUnit.type === 'agent' ? '🤖' : getTaskAvatarEmoji(selectedUnit.data.avatarType) }}</span>
          <span class="selection-type">{{ selectedUnit.type === 'agent' ? 'Agent' : '任务' }}</span>
          <button class="btn-close" @click="clearSelection">✕</button>
        </div>
        <div class="selection-body">
          <div class="selection-name">{{ selectedUnit.data.name }}</div>
          <div class="selection-detail">
            <span v-if="selectedUnit.type === 'agent'">
              形象: {{ getAvatarLabel(selectedUnit.data.avatarUnit) }}
            </span>
            <span v-else>
              形象: {{ selectedUnit.data.avatarType === 'sheep' ? '🐑 羊' : '💎 金子' }}
            </span>
          </div>
          <div class="selection-status" v-if="selectedUnit.type === 'agent'">
            状态: {{ selectedUnit.data.status || 'online' }}
          </div>
        </div>
      </div>

      <div
        class="canvas-wrapper"
        ref="canvasWrapper"
        :class="{ 'pan-active': isPanMode, panning: isPanning }"
        @wheel.prevent="handleWheelZoom"
      ></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { useRouter } from 'vue-router'
import * as PIXI from 'pixi.js'
import { useGameStore } from '@/stores/game'
import { useAgentStore } from '@/stores/agent'
import { useTaskStore } from '@/stores/task'
import { checkBackendStatus, getMapData, type MapData } from '@/types/map'
import { getAgentAvatarUnitById, getAvatarUnitPath, getAvatarImgPath } from '@/config/agentAvatars'
import { getAgentAnimationClip, getAgentEffectClip, resolveAgentAnimationKey, type AgentAnimationClip, type AgentDirection } from '@/config/agentAnimations'
import * as agentApi from '@/api/agents'
import * as taskApi from '@/api/tasks'
import { io, Socket } from 'socket.io-client'

const router = useRouter()
const gameStore = useGameStore()
const agentStore = useAgentStore()
const taskStore = useTaskStore()

// =====================================================
// 常量配置（复用PreviewView的配置）
// =====================================================
const TILE_SIZE = 32
const ZOOM_LEVELS = [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.1]

function formatZoomLabel(level: number) {
  return `${Math.round(level * 100)}%`
}

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

const UNIT_FILES: Record<string, { path: string; frameW: number; frameH: number; frames: number }> = {
  warrior: { path: '/assets/sprites/units/warrior.png', frameW: 192, frameH: 192, frames: 6 },
  archer: { path: '/assets/sprites/units/archer.png', frameW: 192, frameH: 192, frames: 6 },
  monk: { path: '/assets/sprites/units/monk.png', frameW: 192, frameH: 192, frames: 6 },
  pawn: { path: '/assets/sprites/units/pawn.png', frameW: 192, frameH: 192, frames: 6 },
  lancer: { path: '/assets/sprites/units/Lancer_Idle.png', frameW: 192, frameH: 320, frames: 6 },
  monster_warrior: { path: '/assets/sprites/units/monster_warrior.png', frameW: 192, frameH: 192, frames: 6 },
  monster_archer: { path: '/assets/sprites/units/monster_archer.png', frameW: 192, frameH: 192, frames: 6 },
  monster_boss: { path: '/assets/sprites/units/monster_boss.png', frameW: 192, frameH: 192, frames: 6 },
  barracks: { path: '/assets/sprites/buildings/barracks.png', frameW: 192, frameH: 256, frames: 1 },
  castle: { path: '/assets/sprites/buildings/castle.png', frameW: 320, frameH: 256, frames: 1 },
  castle_yellow: { path: '/assets/sprites/buildings/castle_yellow.png', frameW: 320, frameH: 256, frames: 1 },
}

// 任务形象配置
const TASK_AVATAR_FILES: Record<string, { path: string; frameW: number; frameH: number; frames: number }> = {
  sheep: { path: '/assets/sprites/terrain/sheep_idle.png', frameW: 128, frameH: 128, frames: 6 },
  gold: { path: '/assets/sprites/terrain/gold.png', frameW: 128, frameH: 128, frames: 1 },
}
type TaskAvatarType = keyof typeof TASK_AVATAR_FILES

function getTaskAvatarType(task: any): TaskAvatarType {
  return task?.avatarType === 'gold' || task?.avatarType === 'sheep'
    ? task.avatarType
    : 'sheep'
}

// =====================================================
// 状态
// =====================================================
const currentMap = ref<MapData | null>(null)
const isLoadingMap = ref(Boolean(gameStore.selectedGameMapId))
const canvasWrapper = ref<HTMLElement>()
const animationSpeed = ref(0.1)
const zoomLevel = ref(1)
const isPanMode = ref(false)
const isPanning = ref(false)
const panOffset = ref({ x: 0, y: 0 })
let panStart = { pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 }
let zoomAnchor: { clientX: number; clientY: number } | null = null
let mapLoadSeq = 0

// 任务和Agent数据（用于左侧面板）
const tasksData = ref<any[]>([])
const agentsData = ref<any[]>([])
const ACTIVE_TASK_STATUSES = new Set(['dispatching', 'distributed', 'running'])
const TERMINAL_TASK_STATUSES = new Set(['completed', 'failed', 'stale'])
let mapBackendReady: Promise<boolean> | null = null

// 计算属性：任务列表及其参与的Agent
const tasksWithAgents = computed(() => {
  return tasksData.value.map(task => {
    // 获取参与此任务的Agent列表
    const participatingAgents = (task.agents || []).map((ta: any) => {
      const agent = agentsData.value.find(a => a.id === ta.agentId || a.name === ta.agentId)
      return agent || { id: ta.agentId, name: ta.agentId, avatarUnit: null }
    })
    return {
      ...task,
      avatarType: getTaskAvatarType(task),
      participatingAgents
    }
  })
})

// Socket.io 连接
let socket: Socket | null = null

// Agent 活动事件接口
interface AgentActivityEvent {
  agentId: string
  sessionKey?: string
  sessionId?: string
  state?: string
  status?: string
  taskId?: string
  detail?: string
  toolName?: string
  hook?: string
  stream?: string
  phase?: string
  timestamp: number
}

const activeAgentIds = new Set<string>()

// Agent 原位置存储 key
const AGENT_ORIGINAL_POSITION_KEY = 'vis_agent_original_positions'

// 选中状态
const selectedUnit = shallowRef<{ type: 'agent' | 'task'; data: any; sprite: PIXI.AnimatedSprite | null } | null>(null)
const selectionBorder = ref<PIXI.Graphics | null>(null)

// 存储所有可点击的单位 sprite 及其数据
const clickableSprites: Map<PIXI.AnimatedSprite, { type: 'agent' | 'task'; data: any }> = new Map()

// 存储单位对应的名称标签（使用名称作为 key）
const spriteLabels: Map<string, PIXI.Text> = new Map()

// 存储单位 sprite 的数据（用于移动时查找）
const spriteDataMap: Map<PIXI.AnimatedSprite, { type: 'agent' | 'task'; id: string; name: string }> = new Map()

// =====================================================
// 单位位置持久化（localStorage）
// =====================================================
const UNIT_POSITIONS_KEY = 'vis_unit_positions'

interface UnitPositions {
  agents: Record<string, { gridX: number; gridY: number }>   // agent.id -> grid position
  tasks: Record<string, { gridX: number; gridY: number }>   // task.id -> grid position
}

function loadUnitPositions(): UnitPositions {
  try {
    const saved = localStorage.getItem(UNIT_POSITIONS_KEY)
    return saved ? JSON.parse(saved) : { agents: {}, tasks: {} }
  } catch {
    return { agents: {}, tasks: {} }
  }
}

function saveUnitPositions(positions: UnitPositions) {
  localStorage.setItem(UNIT_POSITIONS_KEY, JSON.stringify(positions))
}

function saveUnitPosition(type: 'agent' | 'task', id: string, gridX: number, gridY: number) {
  const positions = loadUnitPositions()
  if (type === 'agent') {
    positions.agents[id] = { gridX, gridY }
  } else {
    positions.tasks[id] = { gridX, gridY }
  }
  saveUnitPositions(positions)
  console.log('[GameView] Position saved:', type, id, gridX, gridY)
}

// PixiJS
let app: PIXI.Application | null = null
let terrainContainer: PIXI.Container | null = null
let environmentContainer: PIXI.Container | null = null
let unitContainer: PIXI.Container | null = null
let textureCache: Map<string, PIXI.Texture> = new Map()
let animatedSprites: PIXI.AnimatedSprite[] = []
const spriteSpeedMultipliers: Map<PIXI.AnimatedSprite, number> = new Map()
const spriteAnimationKeys: Map<PIXI.AnimatedSprite, string> = new Map()
const agentAnimationSeq: Map<string, number> = new Map()
const agentEffectCooldown: Map<string, number> = new Map()

// =====================================================
// 导航到预览页面
// =====================================================
function goToPreview() {
  router.push('/game/preview')
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

  // 加载任务形象素材
  for (const [key, config] of Object.entries(TASK_AVATAR_FILES)) {
    if (!textureCache.has(key)) {
      const tex = await PIXI.Assets.load(config.path)
      textureCache.set(key, tex)
    }
  }
}

// =====================================================
// 初始化游戏显示
// =====================================================
async function initGameDisplay() {
  if (!canvasWrapper.value || !currentMap.value) return

  // 清理旧状态
  destroyGame()

  // 清除选中状态（因为sprite对象会重新创建）
  clearSelection()

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

  terrainContainer = new PIXI.Container()
  environmentContainer = new PIXI.Container()
  unitContainer = new PIXI.Container()

  app.stage.addChild(terrainContainer)
  app.stage.addChild(environmentContainer)
  app.stage.addChild(unitContainer)

  renderTerrain()
  renderEnvironment()
  renderUnits()

  // 渲染Agent形象
  await renderAgentAvatars()

  // 渲染任务形象
  await renderTaskAvatars()

  // 监听右键点击（移动单位）
  app.stage.eventMode = 'static'
  app.stage.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
    // 右键点击
    if (event.button === 2) {
      handleRightClick(event)
    }
  })

  // 禁止右键菜单
  app.stage.hitArea = new PIXI.Rectangle(0, 0, width, height)
  app.stage.on('pointerdown', handleStagePointerDown)
  app.stage.on('pointermove', handleStagePointerMove)
  app.stage.on('pointerup', handleStagePointerUp)
  app.stage.on('pointerupoutside', handleStagePointerUp)
  canvas.oncontextmenu = (e) => e.preventDefault()

  app.ticker.add(() => {
    animatedSprites.forEach(sprite => {
      if (sprite.playing) {
        sprite.animationSpeed = animationSpeed.value * (spriteSpeedMultipliers.get(sprite) ?? 1)
      }
    })
  })
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
      spriteSpeedMultipliers.set(animSprite, 0.5)
      animSprite.play()

      animatedSprites.push(animSprite)
      environmentContainer!.addChild(animSprite)
    }
  })
}

// =====================================================
// 渲染单位层
// =====================================================
function renderUnits() {
  if (!unitContainer || !currentMap.value) return

  unitContainer.removeChildren()
  animatedSprites = []

  currentMap.value.layers.units.forEach(item => {
    const config = UNIT_FILES[item.type]
    if (!config) return

    const tex = textureCache.get(item.type)
    if (!tex) return

    const frames: PIXI.Texture[] = []
    const cols = Math.floor(tex.width / config.frameW)
    const frameCount = Math.min(cols, config.frames)

    for (let i = 0; i < frameCount; i++) {
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
      spriteSpeedMultipliers.set(animSprite, 1)

      // 只有动画帧数>1才播放
      if (frames.length > 1) {
        animSprite.play()
      }

      animatedSprites.push(animSprite)
      unitContainer!.addChild(animSprite)
    }
  })
}

// =====================================================
// 清理
// =====================================================
function destroyGame() {
  // 先清除选中状态（因为sprite对象即将失效）
  clearSelection()

  isPanning.value = false
  animatedSprites.forEach(s => s.destroy())
  animatedSprites = []
  clickableSprites.clear()
  spriteLabels.clear()
  spriteDataMap.clear()
  spriteSpeedMultipliers.clear()
  spriteAnimationKeys.clear()
  agentAnimationSeq.clear()
  agentEffectCooldown.clear()

  if (app) {
    app.destroy(true)
    app = null
    terrainContainer = null
    environmentContainer = null
    unitContainer = null
  }
}

// =====================================================
// 加载选中的地图
// =====================================================
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

function handleStagePointerDown(event: PIXI.FederatedPointerEvent) {
  if (!isPanMode.value || event.button !== 0) return

  const pointer = getPointerClientPosition(event)
  isPanning.value = true
  panStart = {
    pointerX: pointer.x,
    pointerY: pointer.y,
    offsetX: panOffset.value.x,
    offsetY: panOffset.value.y
  }
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

async function loadSelectedMap() {
  const loadSeq = ++mapLoadSeq
  const selectedMapId = gameStore.selectedGameMapId

  if (!selectedMapId) {
    isLoadingMap.value = false
    currentMap.value = null
    destroyGame()
    return
  }

  isLoadingMap.value = true

  try {
    mapBackendReady ||= checkBackendStatus()
    await mapBackendReady.catch(() => false)
    if (loadSeq !== mapLoadSeq) return

    const mapData = await getMapData(selectedMapId)
    if (loadSeq !== mapLoadSeq) return

    if (mapData && gameStore.selectedGameMapId === selectedMapId) {
      currentMap.value = mapData
      await nextTick()
      if (loadSeq !== mapLoadSeq) return
      await initGameDisplay()
    } else {
      currentMap.value = null
      destroyGame()
    }
  } catch (e) {
    if (loadSeq === mapLoadSeq) {
      console.error('[GameView] Failed to load selected map:', e)
      currentMap.value = null
      destroyGame()
    }
  } finally {
    if (loadSeq === mapLoadSeq) {
      isLoadingMap.value = false
    }
  }
}

// =====================================================
// 获取所有Agent及其形象
// =====================================================
async function fetchAgentsWithAvatars() {
  try {
    return await agentApi.fetchAgents()
  } catch (e) {
    console.error('[GameView] Fetch agents failed:', e)
    return []
  }
}

// =====================================================
// 获取所有任务及其形象
// =====================================================
async function fetchTasksWithAvatars() {
  try {
    return await taskApi.fetchTasks()
  } catch (e) {
    console.error('[GameView] Fetch tasks failed:', e)
    return []
  }
}

// =====================================================
// 渲染Agent形象（在城堡左侧）
// =====================================================
async function renderAgentAvatars() {
  if (!unitContainer || !currentMap.value) return

  const agents = await fetchAgentsWithAvatars()

  // 找出有形象配置的agents
  const agentsWithAvatar = agents.filter((agent: any) =>
    typeof agent.avatarUnit === 'string' && agent.avatarUnit.length > 0
  )

  if (agentsWithAvatar.length === 0) return

  // Agent在地图左侧半边排列
  // 确保基础位置在地图左侧（x < width/2）
  const mapHalfWidth = Math.floor(currentMap.value.width / 2)

  // 找城堡位置作为参考，但确保在左侧半边
  const castleUnit = currentMap.value.layers.units.find(
    u => u.type === 'castle' || u.type === 'castle_yellow'
  )

  // 基础位置：优先城堡左侧，但要确保在左侧半边
  let baseX = castleUnit ? castleUnit.x - 3 : 2  // 左侧起始位置
  baseX = Math.min(baseX, mapHalfWidth - 5)  // 确保不超出左侧半边
  const baseY = castleUnit ? castleUnit.y : Math.floor(currentMap.value.height / 2)

  console.log('[GameView] Rendering agent avatars:', agentsWithAvatar.length, 'at', baseX, baseY)

  // 渲染每个agent的形象
  for (let i = 0; i < agentsWithAvatar.length; i++) {
    const agent = agentsWithAvatar[i]
    const avatarUnit = typeof agent.avatarUnit === 'string' ? agent.avatarUnit : ''
    if (!avatarUnit) continue

    const unitConfig = getAgentAvatarUnitById(avatarUnit)

    if (!unitConfig) continue
    const idleClip = getAgentAnimationClip(unitConfig.id, 'idle')
    if (!idleClip) continue

    // 加载素材
    const texPath = idleClip.path || getAvatarUnitPath(unitConfig)
    const textureKey = `agent:${unitConfig.id}:${idleClip.key}`
    let tex = textureCache.get(textureKey)
    if (!tex) {
      try {
        tex = await PIXI.Assets.load(texPath) as PIXI.Texture
        if (!tex) continue
        textureCache.set(textureKey, tex)
      } catch (e) {
        console.error('[GameView] Failed to load avatar texture:', texPath)
        continue
      }
    }
    if (!tex) continue

    // 创建帧纹理
    const frames: PIXI.Texture[] = []
    for (let j = 0; j < idleClip.frames; j++) {
      const frameRect = new PIXI.Rectangle(
        j * idleClip.frameW,
        0,
        idleClip.frameW,
        idleClip.frameH
      )
      const frameTex = new PIXI.Texture(tex.baseTexture, frameRect)
      frames.push(frameTex)
    }

    if (frames.length > 0) {
      const animSprite = new PIXI.AnimatedSprite(frames)

      // 在城堡左侧排列（每行3个）
      const row = Math.floor(i / 3)
      const col = i % 3

      // 检查是否有持久化的位置
      const positions = loadUnitPositions()
      const savedPos = positions.agents[agent.id]

      if (savedPos) {
        // 使用保存的位置
        animSprite.x = savedPos.gridX * TILE_SIZE
        animSprite.y = savedPos.gridY * TILE_SIZE
        console.log('[GameView] Agent using saved position:', agent.id, savedPos.gridX, savedPos.gridY)
      } else {
        // 使用默认位置
        animSprite.x = (baseX - col * 3) * TILE_SIZE
        animSprite.y = (baseY + row * 3) * TILE_SIZE
      }

      animSprite.animationSpeed = animationSpeed.value * (idleClip.speedMultiplier ?? 1)
      spriteSpeedMultipliers.set(animSprite, idleClip.speedMultiplier ?? 1)
      spriteAnimationKeys.set(animSprite, `${unitConfig.id}:${idleClip.key}`)
      if (frames.length > 1) {
        animSprite.play()
      }

      // 添加agent名称标签（放在形象底部附近）
      const nameLabel = new PIXI.Text(agent.name, {
        fontFamily: 'Arial',
        fontSize: 14,
        fill: 0xffffff,
        stroke: 0x000000,
        strokeThickness: 3,
        fontWeight: 'bold',
      })
      nameLabel.anchor.set(0.5, 1)  // 水平居中，底部对齐
      nameLabel.x = animSprite.x + animSprite.width / 2
      nameLabel.y = animSprite.y + animSprite.height - 2  // 在形象底部上方2像素
      unitContainer!.addChild(nameLabel)

      // 存储标签引用（使用 agent.name 作为 key）
      spriteLabels.set(agent.name, nameLabel)
      spriteLabels.set(agent.id, nameLabel)

      // 存储 sprite 数据映射
      spriteDataMap.set(animSprite, { type: 'agent', id: agent.id, name: agent.name })

      animatedSprites.push(animSprite)
      unitContainer!.addChild(animSprite)

      // 存储点击数据并添加交互
      clickableSprites.set(animSprite, { type: 'agent', data: agent })
      animSprite.eventMode = 'static'
      // 不设置cursor，让canvas wrapper的自定义鼠标生效
      animSprite.on('pointerdown', () => handleUnitClick(animSprite))

      console.log('[GameView] Agent avatar rendered:', agent.name, agent.avatarUnit)
    }
  }
}

// =====================================================
// 渲染任务形象（在城堡右侧）
// =====================================================
async function renderTaskAvatars(tasksOverride?: any[]) {
  if (!unitContainer || !currentMap.value) return

  const tasks = tasksOverride || await fetchTasksWithAvatars()
  if (!tasksOverride) tasksData.value = tasks

  // 找出有形象配置的任务
  const tasksWithAvatar = tasks.map((task: any) => ({
    ...task,
    avatarType: getTaskAvatarType(task)
  }))

  if (tasksWithAvatar.length === 0) return

  // 任务在地图右侧半边排列
  // 确保基础位置在地图右侧（x > width/2）
  const mapHalfWidth = Math.floor(currentMap.value.width / 2)

  // 找城堡位置作为参考，但确保在右侧半边
  const castleUnit = currentMap.value.layers.units.find(
    u => u.type === 'castle' || u.type === 'castle_yellow'
  )

  // 基础位置：优先城堡右侧，但要确保在右侧半边
  let baseX = castleUnit ? castleUnit.x + 4 : mapHalfWidth + 2  // 右侧起始位置
  baseX = Math.max(baseX, mapHalfWidth + 2)  // 确保在右侧半边
  const baseY = castleUnit ? castleUnit.y : Math.floor(currentMap.value.height / 2)

  console.log('[GameView] Rendering task avatars:', tasksWithAvatar.length, 'at', baseX, baseY)

  // 渲染每个任务的形象
  for (let i = 0; i < tasksWithAvatar.length; i++) {
    const task = tasksWithAvatar[i]
    const avatarType = task.avatarType  // 'sheep' 或 'gold'

    const config = TASK_AVATAR_FILES[avatarType]
    if (!config) continue

    // 加载素材
    let tex = textureCache.get(avatarType)
    if (!tex) {
      try {
        tex = await PIXI.Assets.load(config.path) as PIXI.Texture
        if (!tex) continue
        textureCache.set(avatarType, tex)
      } catch (e) {
        console.error('[GameView] Failed to load task avatar texture:', config.path)
        continue
      }
    }
    if (!tex) continue

    // 创建帧纹理
    const frames: PIXI.Texture[] = []
    const cols = Math.floor(tex.width / config.frameW)
    const frameCount = Math.min(cols, config.frames)

    for (let j = 0; j < frameCount; j++) {
      const frameRect = new PIXI.Rectangle(
        j * config.frameW,
        0,
        config.frameW,
        config.frameH
      )
      const frameTex = new PIXI.Texture(tex.baseTexture, frameRect)
      frames.push(frameTex)
    }

    if (frames.length > 0) {
      const animSprite = new PIXI.AnimatedSprite(frames)

      // 在城堡右侧排列（每行3个）
      const row = Math.floor(i / 3)
      const col = i % 3

      // 检查是否有持久化的位置
      const positions = loadUnitPositions()
      const savedPos = positions.tasks[task.id]
      const taskSpeedMultiplier = 1

      if (savedPos) {
        // 使用保存的位置
        animSprite.x = savedPos.gridX * TILE_SIZE
        animSprite.y = savedPos.gridY * TILE_SIZE
        console.log('[GameView] Task using saved position:', task.id, savedPos.gridX, savedPos.gridY)
      } else {
        // 使用默认位置
        animSprite.x = (baseX + col * 4) * TILE_SIZE
        animSprite.y = (baseY + row * 4) * TILE_SIZE
      }

      // 设置动画速度
      animSprite.animationSpeed = animationSpeed.value * taskSpeedMultiplier
      spriteSpeedMultipliers.set(animSprite, taskSpeedMultiplier)

      // 羊有动画，金子是静态的
      if (frames.length > 1) {
        animSprite.play()
      }

      // 添加任务名称标签（放在形象底部附近）
      const nameLabel = new PIXI.Text(task.name, {
        fontFamily: 'Arial',
        fontSize: 14,
        fill: 0xffffff,      // 白色
        stroke: 0x000000,    // 黑色描边
        strokeThickness: 2,
        fontWeight: 'bold',
      })
      nameLabel.anchor.set(0.5, 1)  // 水平居中，底部对齐
      nameLabel.x = animSprite.x + animSprite.width / 2
      nameLabel.y = animSprite.y + animSprite.height - 2  // 在形象底部上方2像素
      unitContainer!.addChild(nameLabel)

      // 存储标签引用（使用 task.name 作为 key）
      spriteLabels.set(task.id, nameLabel)
      spriteLabels.set(task.name, nameLabel)

      // 存储 sprite 数据映射
      spriteDataMap.set(animSprite, { type: 'task', id: task.id, name: task.name })

      animatedSprites.push(animSprite)
      unitContainer!.addChild(animSprite)

      // 存储点击数据并添加交互
      clickableSprites.set(animSprite, { type: 'task', data: task })
      animSprite.eventMode = 'static'
      // 不设置cursor，让canvas wrapper的自定义鼠标生效
      animSprite.on('pointerdown', () => handleUnitClick(animSprite))

      console.log('[GameView] Task avatar rendered:', task.name, avatarType)
    }
  }
}

// =====================================================
// 监听缩放变化
// =====================================================
function removeDynamicSprites(type: 'agent' | 'task') {
  for (const [sprite, data] of Array.from(spriteDataMap.entries())) {
    if (data.type !== type) continue

    const clickData = clickableSprites.get(sprite)
    const id = clickData?.data?.id || data.id
    const name = clickData?.data?.name || data.name
    const label = spriteLabels.get(id) || spriteLabels.get(name)

    if (label) {
      if (label.parent) label.parent.removeChild(label)
      label.destroy()
      spriteLabels.delete(id)
      spriteLabels.delete(name)
    }

    clickableSprites.delete(sprite)
    spriteDataMap.delete(sprite)
    spriteSpeedMultipliers.delete(sprite)
    spriteAnimationKeys.delete(sprite)
    animatedSprites = animatedSprites.filter(item => item !== sprite)
    if (sprite.parent) sprite.parent.removeChild(sprite)
    sprite.destroy()
  }
}

async function refreshTasksAndTaskSprites() {
  await loadTasksAndAgents()
  if (!unitContainer || !currentMap.value) return

  removeDynamicSprites('task')
  await renderTaskAvatars(tasksData.value)
}

watch(zoomLevel, (_value, oldValue) => {
  if (app) {
    const previousZoom = typeof oldValue === 'number' ? oldValue : zoomLevel.value
    updateZoom(previousZoom)
  }
})

// =====================================================
// 点击选中单位
// =====================================================
function handleUnitClick(sprite: PIXI.AnimatedSprite) {
  if (isPanMode.value) return

  const unitData = clickableSprites.get(sprite)
  if (!unitData) return

  console.log('[GameView] Unit clicked:', unitData.type, unitData.data.name)

  // 更新选中状态
  selectedUnit.value = {
    type: unitData.type,
    data: unitData.data,
    sprite: sprite
  }

  // 更新选中边框
  updateSelectionBorder(sprite)
}

// =====================================================
// 更新选中边框
// =====================================================
function updateSelectionBorder(sprite: PIXI.AnimatedSprite) {
  // 移除旧边框
  if (selectionBorder.value) {
    selectionBorder.value.destroy()
    selectionBorder.value = null
  }

  if (!unitContainer) return

  // 使用 Graphics 绘制选中边框
  const border = new PIXI.Graphics()

  // 获取 sprite 的边界（包含其位置和大小）
  const bounds = sprite.getBounds()

  // 绘制矩形边框（框住单位）
  // 边框稍微比单位大一点，留出间隙
  const padding = 5
  border.lineStyle(3, 0x00ff88, 1)  // 绿色边框，宽度3
  border.drawRect(
    bounds.x - padding,
    bounds.y - padding,
    bounds.width + padding * 2,
    bounds.height + padding * 2
  )

  // 在四角绘制小三角形标记（增强选中效果）
  const cornerSize = 8
  border.beginFill(0x00ff88, 1)

  // 左上角
  border.moveTo(bounds.x - padding, bounds.y - padding)
  border.lineTo(bounds.x - padding + cornerSize, bounds.y - padding)
  border.lineTo(bounds.x - padding, bounds.y - padding + cornerSize)
  border.lineTo(bounds.x - padding, bounds.y - padding)

  // 右上角
  border.moveTo(bounds.x + bounds.width + padding, bounds.y - padding)
  border.lineTo(bounds.x + bounds.width + padding - cornerSize, bounds.y - padding)
  border.lineTo(bounds.x + bounds.width + padding, bounds.y - padding + cornerSize)
  border.lineTo(bounds.x + bounds.width + padding, bounds.y - padding)

  // 左下角
  border.moveTo(bounds.x - padding, bounds.y + bounds.height + padding)
  border.lineTo(bounds.x - padding + cornerSize, bounds.y + bounds.height + padding)
  border.lineTo(bounds.x - padding, bounds.y + bounds.height + padding - cornerSize)
  border.lineTo(bounds.x - padding, bounds.y + bounds.height + padding)

  // 右下角
  border.moveTo(bounds.x + bounds.width + padding, bounds.y + bounds.height + padding)
  border.lineTo(bounds.x + bounds.width + padding - cornerSize, bounds.y + bounds.height + padding)
  border.lineTo(bounds.x + bounds.width + padding, bounds.y + bounds.height + padding - cornerSize)
  border.lineTo(bounds.x + bounds.width + padding, bounds.y + bounds.height + padding)

  border.endFill()

  selectionBorder.value = border
  unitContainer.addChild(border)

  console.log('[GameView] Selection border placed at', bounds.x, bounds.y, 'size:', bounds.width, bounds.height)
}

// =====================================================
// 清除选中状态
// =====================================================
function clearSelection() {
  selectedUnit.value = null
  if (selectionBorder.value) {
    selectionBorder.value.destroy()
    selectionBorder.value = null
  }
}

// =====================================================
// 获取 Agent 形象标签
// =====================================================
function getAvatarLabel(avatarUnit?: string | null): string {
  if (!avatarUnit) return ''
  const labels: Record<string, string> = {
    archer: '🏹 弓箭手',
    warrior: '⚔️ 战士',
    lancer: '🏇 枪骑兵',
    monk: '🧙 僧侣',
    pawn: '🔨 士兵'
  }
  return labels[avatarUnit] || avatarUnit
}

// =====================================================
// 获取 Agent 头像图片 URL
// =====================================================
function getAvatarImgUrl(avatarUnit?: string | null): string | undefined {
  if (!avatarUnit) return undefined
  const unit = getAgentAvatarUnitById(avatarUnit)
  if (!unit) return undefined
  return getAvatarImgPath(unit)
}

// =====================================================
// 获取任务形象 Emoji
// =====================================================
function getTaskAvatarEmoji(avatarType?: string | null): string {
  if (avatarType === 'gold') return '💎'
  return '🐑'
}

// =====================================================
// 右键点击处理（移动单位）
// =====================================================
function handleRightClick(event: PIXI.FederatedPointerEvent) {
  if (!selectedUnit.value || !selectedUnit.value.sprite) {
    console.log('[GameView] No unit selected, cannot move')
    return
  }

  // 获取点击位置（全局坐标）
  const globalPos = event.global

  // 将坐标转换为相对于 unitContainer 的位置
  const localPos = unitContainer?.toLocal(globalPos)

  if (!localPos) return

  // 计算目标格子坐标
  const targetGridX = Math.floor(localPos.x / TILE_SIZE)
  const targetGridY = Math.floor(localPos.y / TILE_SIZE)

  // 边界检查
  if (!currentMap.value) return
  if (targetGridX < 0 || targetGridX >= currentMap.value.width ||
      targetGridY < 0 || targetGridY >= currentMap.value.height) {
    console.log('[GameView] Target position out of bounds:', targetGridX, targetGridY)
    return
  }

  console.log('[GameView] Moving unit to grid:', targetGridX, targetGridY)

  // 移动选中的单位
  const sprite = selectedUnit.value.sprite
  const newX = targetGridX * TILE_SIZE
  const newY = targetGridY * TILE_SIZE

  // 更新单位位置（瞬移）
  sprite.x = newX
  sprite.y = newY

  // 获取单位数据，用于查找标签和保存位置
  // 注意：不使用 clickableSprites.get(sprite)，因为热更新后 sprite 对象可能不一致
  const unitData = selectedUnit.value.data
  console.log('[GameView] selectedUnit.data:', unitData)

  if (unitData) {
    // 使用名称查找标签
    const nameLabel = spriteLabels.get(unitData.id) || spriteLabels.get(unitData.name)
    if (nameLabel) {
      nameLabel.x = newX + sprite.width / 2
      nameLabel.y = newY - 5
      console.log('[GameView] Label moved to:', nameLabel.x, nameLabel.y)
    } else {
      console.log('[GameView] Label not found for name:', unitData.name)
    }

    // 持久化位置到 localStorage
    saveUnitPosition(
      selectedUnit.value.type,
      unitData.id,  // 使用 agent.id 或 task.id
      targetGridX,
      targetGridY
    )
  } else {
    console.log('[GameView] selectedUnit.data is null')
  }

  // 更新选中边框位置
  updateSelectionBorder(sprite)

  console.log('[GameView] Unit moved to grid:', targetGridX, targetGridY, 'pixel:', newX, newY)
}

// =====================================================
// 监听gameStore变化
// =====================================================
function handleWindowResize() {
  updateZoom(zoomLevel.value)
}

watch(() => gameStore.selectedGameMapId, () => {
  void (async () => {
    await loadSelectedMap()
    await loadTasksAndAgents()
    await reconcileActiveTasksFromCurrentData()
    await reconcileActiveAgentsFromCurrentData()
  })()
})

// =====================================================
// 初始化 Socket.io 连接
// =====================================================
function initSocket() {
  if (socket) {
    return
  }

  // 连接后端 Socket.io
  socket = io('/', {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000
  })

  socket.on('connect', () => {
    console.log('[GameView] Socket connected:', socket?.id)
    socket?.emit('subscribe', 'tasks')
    socket?.emit('subscribe', 'agents')
    void refreshTasksAndTaskSprites()
  })

  socket.on('disconnect', () => {
    console.log('[GameView] Socket disconnected')
  })

  socket.on('agent:status', (event) => void handleAgentStatus(event))
  socket.on('agent:running', (event) => void handleAgentStatus({ ...event, state: event.state || 'running' }))
  socket.on('agent:idle', (event) => void handleAgentStatus({ ...event, state: 'idle', status: 'idle' }))
  socket.on('task:created', (task) => void handleTaskRealtimeUpdate(task))
  socket.on('task:updated', (task) => void handleTaskRealtimeUpdate(task))
  socket.on('task:deleted', (payload) => void handleTaskRealtimeDeleted(payload))

  console.log('[GameView] Socket initialized')
}

function taskIncludesAgent(task: any, agentId: string): boolean {
  return Array.isArray(task?.agents) && task.agents.some((agent: any) => agent?.agentId === agentId)
}

function taskIncludesSession(task: any, event: AgentActivityEvent): boolean {
  const refs = new Set([event.sessionKey, event.sessionId].filter(Boolean))
  if (refs.size === 0 || !Array.isArray(task?.sessionIds)) return false
  return task.sessionIds.some((id: string) => refs.has(id))
}

function resolveTaskIdForAgentEvent(event: AgentActivityEvent): string | undefined {
  if (event.taskId) return event.taskId

  const activeTasks = tasksData.value.filter(task => ACTIVE_TASK_STATUSES.has(task.status || 'pending'))
  const sessionMatch = activeTasks.find(task => taskIncludesSession(task, event) && taskIncludesAgent(task, event.agentId))
    || activeTasks.find(task => taskIncludesSession(task, event))
  if (sessionMatch?.id) return sessionMatch.id

  const agentMatch = activeTasks.find(task => taskIncludesAgent(task, event.agentId))
  return agentMatch?.id
}

function getTaskForAgentEvent(event: AgentActivityEvent): any | undefined {
  const taskId = resolveTaskIdForAgentEvent(event)
  if (!taskId) return undefined
  return tasksData.value.find(task => task.id === taskId)
}

function getTaskAgentLayout(event: AgentActivityEvent): { index: number; total: number } {
  const task = getTaskForAgentEvent(event)
  const agentIds = Array.from(new Set(
    (task?.agents || [])
      .map((agent: any) => agent?.agentId)
      .filter((agentId: any): agentId is string => typeof agentId === 'string' && agentId.length > 0)
  ))

  const index = agentIds.indexOf(event.agentId)
  if (index >= 0) return { index, total: Math.max(agentIds.length, 1) }

  const fallbackAgents = Array.from(activeAgentIds).sort()
  const fallbackIndex = fallbackAgents.indexOf(event.agentId)
  return {
    index: fallbackIndex >= 0 ? fallbackIndex : 0,
    total: Math.max(fallbackAgents.length, 1)
  }
}

async function ensureTaskSpriteForEvent(event: AgentActivityEvent): Promise<string | undefined> {
  let taskId = resolveTaskIdForAgentEvent(event)
  if (taskId && findTaskSprite(taskId)) return taskId

  await refreshTasksAndTaskSprites()
  taskId = resolveTaskIdForAgentEvent(event)
  return taskId
}

async function moveAgentsForActiveTask(task: any) {
  if (!ACTIVE_TASK_STATUSES.has(task?.status || 'pending') || !Array.isArray(task?.agents)) return

  for (const agent of task.agents) {
    if (!agent?.agentId) continue

    const event: AgentActivityEvent = {
      agentId: agent.agentId,
      taskId: task.id,
      sessionKey: Array.isArray(task.sessionIds) ? task.sessionIds[0] : undefined,
      state: 'running',
      status: 'running',
      timestamp: Date.now()
    }

    if (activeAgentIds.has(agent.agentId)) {
      handleAgentRunning(event, { moveToTask: true })
      continue
    }

    await handleAgentStatus(event)
  }
}

async function handleTaskRealtimeUpdate(task: any) {
  if (!task?.id) return

  const index = tasksData.value.findIndex(item => item.id === task.id)
  if (index >= 0) tasksData.value[index] = task
  else tasksData.value.unshift(task)
  taskStore.syncTaskToLocal(task)

  if (unitContainer && currentMap.value) {
    removeDynamicSprites('task')
    await renderTaskAvatars(tasksData.value)
  }

  await moveAgentsForActiveTask(task)

  if (TERMINAL_TASK_STATUSES.has(task.status || 'pending') && Array.isArray(task.agents)) {
    for (const agent of task.agents) {
      if (!agent?.agentId) continue
      await handleAgentStatus({
        agentId: agent.agentId,
        taskId: task.id,
        state: 'idle',
        status: 'idle',
        timestamp: Date.now()
      })
    }
  }
}

async function handleTaskRealtimeDeleted(payload: { id?: string } | string) {
  const id = typeof payload === 'string' ? payload : payload?.id
  if (!id) return

  tasksData.value = tasksData.value.filter(task => task.id !== id)
  taskStore.removeTask(id)

  if (selectedUnit.value?.type === 'task' && selectedUnit.value.data?.id === id) {
    clearSelection()
  }

  if (unitContainer && currentMap.value) {
    removeDynamicSprites('task')
    await renderTaskAvatars(tasksData.value)
  }
}

function isActiveAgentEvent(event: AgentActivityEvent): boolean {
  return ['running', 'busy', 'thinking', 'generating', 'tool_calling', 'waiting_approval', 'finalizing'].includes(event.state || event.status || '')
}

async function reconcileActiveTasksFromCurrentData() {
  for (const task of tasksData.value) {
    await moveAgentsForActiveTask(task)
  }
}

async function reconcileActiveAgentsFromCurrentData() {
  for (const agent of agentsData.value) {
    const state = agent.agentState || (agent.hasActiveSession ? 'running' : undefined)
    if (!isActiveAgentEvent({ agentId: agent.id, state, timestamp: agent.lastEventAt || Date.now() })) continue

    await handleAgentStatus({
      agentId: agent.id,
      state,
      status: 'running',
      timestamp: agent.lastEventAt || Date.now()
    })
  }
}

async function handleAgentStatus(event: AgentActivityEvent) {
  if (!event.agentId) return

  const isActive = isActiveAgentEvent(event)
  const wasActive = activeAgentIds.has(event.agentId)

  if (isActive && !wasActive) {
    activeAgentIds.add(event.agentId)
    console.log('[GameView] Agent active:', event.agentId, event.sessionKey)
    const taskId = event.taskId ? await ensureTaskSpriteForEvent(event) : undefined
    handleAgentRunning({ ...event, taskId, status: 'running' }, { moveToTask: Boolean(taskId) })
    return
  }

  if (!isActive && wasActive) {
    activeAgentIds.delete(event.agentId)
    console.log('[GameView] Agent idle:', event.agentId, event.sessionKey)
    handleAgentIdle({ ...event, status: 'idle' })
  }
}

// =====================================================
// 断开 Socket.io 连接
// =====================================================
function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
    activeAgentIds.clear()
    console.log('[GameView] Socket disconnected')
  }
}

// =====================================================
// 处理 Agent running 事件 - 瞬移到任务位置并播放攻击动画
// =====================================================
function handleAgentRunning(event: AgentActivityEvent, options: { moveToTask?: boolean } = {}) {
  // 找到对应的 Agent sprite
  const agentName = event.agentId  // agentId is the stable sprite key.

  // 从 spriteDataMap 找到 sprite
  let agentSprite: PIXI.AnimatedSprite | null = null
  for (const [sprite, data] of spriteDataMap.entries()) {
    if (data.type === 'agent' && (data.id === agentName || data.name === agentName)) {
      agentSprite = sprite
      break
    }
  }

  if (!agentSprite) {
    console.log('[GameView] Agent sprite not found:', agentName)
    return
  }

  const shouldMoveToTask = options.moveToTask === true && Boolean(event.taskId)
  if (!shouldMoveToTask) {
    const nameLabel = spriteLabels.get(agentName)
    if (nameLabel) {
      nameLabel.x = agentSprite.x + agentSprite.width / 2
      nameLabel.y = agentSprite.y + agentSprite.height - 2
    }

    void switchToAttackAnimation(agentSprite, agentName, event)

    if (selectedUnit.value && selectedUnit.value.type === 'agent' && (selectedUnit.value.data.id === agentName || selectedUnit.value.data.name === agentName)) {
      updateSelectionBorder(agentSprite)
    }

    console.log('[GameView] Agent action in place:', agentName, agentSprite.x, agentSprite.y)
    return
  }

  // 保存当前位置到 localStorage
  const currentGridX = Math.floor(agentSprite.x / TILE_SIZE)
  const currentGridY = Math.floor(agentSprite.y / TILE_SIZE)
  if (!getAgentOriginalPosition(agentName)) {
    saveAgentOriginalPosition(agentName, currentGridX, currentGridY)
    console.log('[GameView] Saved original position:', agentName, currentGridX, currentGridY)
  }

  // 找到任务形象的位置作为目标
  let targetX = agentSprite.x
  let targetY = agentSprite.y
  let targetTaskSprite: PIXI.AnimatedSprite | null = null

  // 优先使用指定的 taskId
  if (event.taskId) {
    const taskSprite = findTaskSprite(event.taskId)
    if (taskSprite) {
      targetTaskSprite = taskSprite
      targetX = taskSprite.x
      targetY = taskSprite.y
      console.log('[GameView] Found task by taskId:', event.taskId, targetX, targetY)
    } else {
      void switchToAttackAnimation(agentSprite, agentName, event)
      console.log('[GameView] Task sprite not found, agent acts in place:', agentName, event.taskId)
      return
    }
  } else {
    // 如果没有指定 taskId，找第一个任务形象（羊或金子）
    for (const [sprite, data] of spriteDataMap.entries()) {
      if (data.type === 'task') {
        targetTaskSprite = sprite
        targetX = sprite.x
        targetY = sprite.y
        console.log('[GameView] Found first task sprite:', data.name, targetX, targetY)
        break
      }
    }
  }

  const { index: agentIndex, total: agentTotal } = getTaskAgentLayout(event)
  const rowsPerColumn = 3
  const column = Math.floor(agentIndex / rowsPerColumn)
  const row = agentIndex % rowsPerColumn
  const rowsInColumn = Math.min(rowsPerColumn, Math.max(agentTotal - column * rowsPerColumn, 1))
  const gapX = Math.max(24, Math.round(agentSprite.width * 0.16))
  const gapY = Math.max(16, Math.round(agentSprite.height * 0.16))
  const targetLeft = targetX - (column + 1) * (agentSprite.width + gapX)
  const rowOffset = (row - (rowsInColumn - 1) / 2) * (agentSprite.height + gapY)
  const mapPixelHeight = currentMap.value ? currentMap.value.height * TILE_SIZE : Number.POSITIVE_INFINITY

  agentSprite.x = Math.max(0, targetLeft)
  agentSprite.y = Math.max(0, Math.min(targetY + rowOffset, mapPixelHeight - agentSprite.height))

  console.log('[GameView] Agent position slot:', agentName, agentIndex, '/', agentTotal, agentSprite.x, agentSprite.y)

  // 更新名称标签位置（更靠近形象）
  const nameLabel = spriteLabels.get(agentName)
  if (nameLabel) {
    nameLabel.x = agentSprite.x + agentSprite.width / 2
    nameLabel.y = agentSprite.y + agentSprite.height - 2  // 在形象底部上方2像素，更靠近
  }

  // 播放攻击动画（切换到 run 动画）
  switchToAttackAnimation(agentSprite, agentName)

  // 更新选中边框（如果当前选中的是这个 Agent）
  if (selectedUnit.value && selectedUnit.value.type === 'agent' && (selectedUnit.value.data.id === agentName || selectedUnit.value.data.name === agentName)) {
    updateSelectionBorder(agentSprite)
  }

  void switchToAttackAnimation(agentSprite, agentName, event, targetTaskSprite)

  console.log('[GameView] Agent teleported to task position:', agentName, agentSprite.x, agentSprite.y)
}

// =====================================================
// 处理 Agent idle 事件 - 瞬移回原位置
// =====================================================
function handleAgentIdle(event: AgentActivityEvent) {
  const agentName = event.agentId

  // 从 spriteDataMap 找到 sprite
  let agentSprite: PIXI.AnimatedSprite | null = null
  for (const [sprite, data] of spriteDataMap.entries()) {
    if (data.type === 'agent' && (data.id === agentName || data.name === agentName)) {
      agentSprite = sprite
      break
    }
  }

  if (!agentSprite) {
    console.log('[GameView] Agent sprite not found:', agentName)
    return
  }

  // 从 localStorage 获取原位置
  const originalPos = getAgentOriginalPosition(agentName)
  if (!originalPos) {
    const nameLabel = spriteLabels.get(agentName)
    if (nameLabel) {
      nameLabel.x = agentSprite.x + agentSprite.width / 2
      nameLabel.y = agentSprite.y + agentSprite.height - 2
    }

    switchToIdleAnimation(agentSprite, agentName)

    if (selectedUnit.value && selectedUnit.value.type === 'agent' && (selectedUnit.value.data.id === agentName || selectedUnit.value.data.name === agentName)) {
      updateSelectionBorder(agentSprite)
    }

    console.log('[GameView] Agent action ended in place:', agentName)
    return
  }

  // 瞬移回原位置
  agentSprite.x = originalPos.gridX * TILE_SIZE
  agentSprite.y = originalPos.gridY * TILE_SIZE

  // 更新名称标签位置
  const nameLabel = spriteLabels.get(agentName)
  if (nameLabel) {
    nameLabel.x = agentSprite.x + agentSprite.width / 2
    nameLabel.y = agentSprite.y - 5
  }

  // 恢复 idle 动画
  switchToIdleAnimation(agentSprite, agentName)

  // 更新选中边框（如果当前选中的是这个 Agent）
  if (selectedUnit.value && selectedUnit.value.type === 'agent' && (selectedUnit.value.data.id === agentName || selectedUnit.value.data.name === agentName)) {
    updateSelectionBorder(agentSprite)
  }

  // 清除保存的原位置
  clearAgentOriginalPosition(agentName)

  console.log('[GameView] Agent returned to original position:', agentName)
}

// =====================================================
// 保存 Agent 原位置到 localStorage
// =====================================================
function saveAgentOriginalPosition(agentName: string, gridX: number, gridY: number) {
  const positions = loadAgentOriginalPositions()
  positions[agentName] = { gridX, gridY }
  localStorage.setItem(AGENT_ORIGINAL_POSITION_KEY, JSON.stringify(positions))
  console.log('[GameView] Saved original position:', agentName, gridX, gridY)
}

// =====================================================
// 加载 Agent 原位置
// =====================================================
function loadAgentOriginalPositions(): Record<string, { gridX: number; gridY: number }> {
  try {
    const saved = localStorage.getItem(AGENT_ORIGINAL_POSITION_KEY)
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

// =====================================================
// 获取特定 Agent 的原位置
// =====================================================
function getAgentOriginalPosition(agentName: string): { gridX: number; gridY: number } | null {
  const positions = loadAgentOriginalPositions()
  return positions[agentName] || null
}

// =====================================================
// 清除 Agent 原位置
// =====================================================
function clearAgentOriginalPosition(agentName: string) {
  const positions = loadAgentOriginalPositions()
  delete positions[agentName]
  localStorage.setItem(AGENT_ORIGINAL_POSITION_KEY, JSON.stringify(positions))
}

// =====================================================
// 找到任务 sprite
// =====================================================
function findTaskSprite(taskId: string): PIXI.AnimatedSprite | null {
  for (const [sprite, data] of spriteDataMap.entries()) {
    if (data.type === 'task') {
      // 从 clickableSprites 获取完整数据
      const clickData = clickableSprites.get(sprite)
      if (clickData && clickData.data.id === taskId) {
        return sprite
      }
    }
  }
  return null
}

function findAgentForAnimation(agentName: string) {
  return agentStore.getAgentById(agentName) ||
    agentsData.value.find((agent: any) => agent.id === agentName || agent.name === agentName)
}

function getDirectionBetweenSprites(from: PIXI.AnimatedSprite, to?: PIXI.AnimatedSprite | null): AgentDirection {
  if (!to) return 'right'

  const dx = to.x - from.x
  const dy = to.y - from.y
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  if (absDy > absDx * 1.2) return dy < 0 ? 'up' : 'down'
  if (dy < -from.height * 0.15) return 'upRight'
  if (dy > from.height * 0.15) return 'downRight'
  return 'right'
}

async function loadAnimationFrames(clip: AgentAnimationClip): Promise<PIXI.Texture[]> {
  const textureKey = `agent-animation:${clip.key}:${clip.path}`
  let tex = textureCache.get(textureKey)

  if (!tex) {
    tex = await PIXI.Assets.load(clip.path) as PIXI.Texture
    if (!tex) return []
    textureCache.set(textureKey, tex)
  }

  const frames: PIXI.Texture[] = []
  const cols = Math.floor(tex.width / clip.frameW)
  const frameCount = Math.max(1, Math.min(clip.frames, cols || clip.frames))

  for (let i = 0; i < frameCount; i++) {
    const frameRect = new PIXI.Rectangle(
      i * clip.frameW,
      0,
      clip.frameW,
      clip.frameH
    )
    frames.push(new PIXI.Texture(tex.baseTexture, frameRect))
  }

  return frames
}

async function playAgentAnimation(
  sprite: PIXI.AnimatedSprite,
  agentName: string,
  clip: AgentAnimationClip,
  options: { restart?: boolean } = {}
) {
  const clipKey = `${agentName}:${clip.key}:${clip.path}`
  if (!options.restart && spriteAnimationKeys.get(sprite) === clipKey && sprite.playing) return

  const seq = (agentAnimationSeq.get(agentName) || 0) + 1
  agentAnimationSeq.set(agentName, seq)

  try {
    const frames = await loadAnimationFrames(clip)
    if (agentAnimationSeq.get(agentName) !== seq || frames.length === 0) return

    sprite.textures = frames
    sprite.loop = clip.loop ?? true
    spriteSpeedMultipliers.set(sprite, clip.speedMultiplier ?? 1)
    sprite.animationSpeed = animationSpeed.value * (clip.speedMultiplier ?? 1)
    spriteAnimationKeys.set(sprite, clipKey)
    sprite.gotoAndPlay(0)
  } catch (e) {
    console.error('[GameView] Failed to load agent animation:', clip.path, e)
  }
}

async function playAgentEffect(
  sprite: PIXI.AnimatedSprite,
  agentName: string,
  unitId: string,
  animationKey: string
) {
  if (!unitContainer) return

  const effectClip = getAgentEffectClip(unitId, animationKey)
  if (!effectClip) return

  const now = Date.now()
  const lastEffectAt = agentEffectCooldown.get(agentName) || 0
  if (now - lastEffectAt < 1200) return
  agentEffectCooldown.set(agentName, now)

  try {
    const frames = await loadAnimationFrames(effectClip)
    if (frames.length === 0) return

    const effectSprite = new PIXI.AnimatedSprite(frames)
    effectSprite.x = sprite.x
    effectSprite.y = sprite.y
    effectSprite.loop = false
    effectSprite.animationSpeed = animationSpeed.value * (effectClip.speedMultiplier ?? 1)
    spriteSpeedMultipliers.set(effectSprite, effectClip.speedMultiplier ?? 1)
    effectSprite.onComplete = () => {
      animatedSprites = animatedSprites.filter(item => item !== effectSprite)
      spriteSpeedMultipliers.delete(effectSprite)
      if (effectSprite.parent) effectSprite.parent.removeChild(effectSprite)
      effectSprite.destroy()
    }

    animatedSprites.push(effectSprite)
    unitContainer.addChild(effectSprite)
    effectSprite.play()
  } catch (e) {
    console.error('[GameView] Failed to play agent effect:', effectClip.path, e)
  }
}

async function playResolvedAgentAnimation(
  sprite: PIXI.AnimatedSprite,
  agentName: string,
  event: AgentActivityEvent,
  targetSprite?: PIXI.AnimatedSprite | null
) {
  const agent = findAgentForAnimation(agentName)
  if (!agent || !agent.avatarUnit) {
    console.log('[GameView] No avatar unit for agent:', agentName)
    return
  }

  const unitConfig = getAgentAvatarUnitById(agent.avatarUnit)
  if (!unitConfig) return

  const animationKey = resolveAgentAnimationKey(unitConfig.id, {
    state: event.state || event.status || 'running',
    toolName: event.toolName,
    detail: event.detail,
    direction: getDirectionBetweenSprites(sprite, targetSprite)
  })
  const clip = getAgentAnimationClip(unitConfig.id, animationKey)
  if (!clip) return

  await playAgentAnimation(sprite, agentName, clip)
  await playAgentEffect(sprite, agentName, unitConfig.id, animationKey)
  console.log('[GameView] Switched agent animation:', agentName, event.state || event.status, animationKey)
}

// =====================================================
// 切换到攻击动画（使用 run 动画）
// =====================================================
async function switchToAttackAnimation(
  sprite: PIXI.AnimatedSprite,
  agentName: string,
  event: AgentActivityEvent = { agentId: agentName, state: 'running', timestamp: Date.now() },
  targetSprite?: PIXI.AnimatedSprite | null
) {
  await playResolvedAgentAnimation(sprite, agentName, event, targetSprite)
}

// =====================================================
// 切换回 idle 动画
// =====================================================
async function switchToIdleAnimation(sprite: PIXI.AnimatedSprite, agentName: string) {
  const idleAgent = findAgentForAnimation(agentName)
  const idleUnit = idleAgent?.avatarUnit ? getAgentAvatarUnitById(idleAgent.avatarUnit) : undefined
  const idleClip = idleUnit ? getAgentAnimationClip(idleUnit.id, 'idle') : undefined
  if (idleClip) {
    await playAgentAnimation(sprite, agentName, idleClip)
    console.log('[GameView] Switched back to idle animation for:', agentName)
  }
}

// =====================================================
// 加载任务和Agent数据（用于左侧面板）
// =====================================================
async function loadTasksAndAgents() {
  try {
    const [tasksRes, agentsRes] = await Promise.all([
      taskApi.fetchTasks(),
      agentApi.fetchAgents()
    ])
    tasksData.value = tasksRes || []
    agentsData.value = agentsRes || []
    console.log('[GameView] Loaded tasks:', tasksData.value.length, 'agents:', agentsData.value.length)
  } catch (e) {
    console.error('[GameView] Failed to load tasks/agents:', e)
  }
}

// =====================================================
// 生命周期
// =====================================================
onMounted(async () => {
  window.addEventListener('resize', handleWindowResize)
  // 填充 agentStore（switchToAttackAnimation / switchToIdleAnimation 依赖此数据）
  await agentStore.fetchAgents()
  // 加载任务和Agent数据
  await loadTasksAndAgents()
  await loadSelectedMap()
  // 初始化 Socket.io
  initSocket()
  await reconcileActiveTasksFromCurrentData()
  await reconcileActiveAgentsFromCurrentData()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  destroyGame()
  // 断开 Socket.io
  disconnectSocket()
})
</script>

<style scoped>
.game-view-container {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.no-map-placeholder {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  background: var(--bg-secondary);
}

.placeholder-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px;
  background: var(--bg-card);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}

.placeholder-content .icon {
  font-size: 48px;
}

.loading-content {
  min-width: 280px;
}

.loading-hourglass {
  display: inline-block;
  animation: hourglassPulse 1.1s ease-in-out infinite;
}

@keyframes hourglassPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.75;
  }

  50% {
    transform: scale(1.12);
    opacity: 1;
  }
}

.placeholder-content h2 {
  color: var(--text-primary);
  font-size: 24px;
  margin: 0;
}

.placeholder-content p {
  color: var(--text-secondary);
  font-size: 14px;
  text-align: center;
  max-width: 300px;
}

.btn-go {
  padding: 12px 24px;
  background: var(--accent-blue);
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  font-size: 14px;
  transition: all 0.2s;
}

.btn-go:hover {
  background: var(--accent-blue-light);
  box-shadow: 0 0 10px rgba(64, 158, 255, 0.3);
}

.game-display {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
}

.game-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.map-name {
  font-size: 16px;
  color: var(--accent-blue-light);
  font-weight: 600;
}

.game-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-secondary);
}

.game-controls input[type="range"] {
  width: 80px;
}

.game-controls select {
  background: var(--bg-card);
  border: 1px solid var(--accent-blue);
  color: var(--accent-blue);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
}

.btn-view-tool {
  background: var(--bg-card);
  border: 1px solid var(--accent-blue);
  color: var(--accent-blue);
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.btn-view-tool:hover,
.btn-view-tool.active {
  background: var(--accent-blue);
  color: var(--text-primary);
}

/* 任务信息面板（地图左侧） */
.task-info-panel {
  position: absolute;
  top: 70px;
  left: 20px;
  width: 280px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #5c3d2e;
  text-align: center;
  padding: 8px 16px;
  background-image: url('/assets/sprites/ui/ribbons/BigRibbons1.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.task-ribbon {
  display: flex;
  flex-direction: column;
  padding: 10px 20px 8px 20px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  min-height: 80px;
}

.ribbon-task-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.task-avatar {
  font-size: 20px;
}

.task-name {
  font-size: 13px;
  font-weight: 600;
  color: #3d2914;
}

.ribbon-agents {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-left: 4px;
}

.agent-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.agent-avatar-img {
  width: 24px;
  height: 24px;
  border-radius: 2px;
  object-fit: contain;
}

.agent-avatar-emoji {
  font-size: 18px;
}

.agent-name {
  font-size: 11px;
  color: #6b4423;
}

.canvas-wrapper {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: var(--bg-primary);
  /* 自定义鼠标图标 */
  cursor: url('/assets/sprites/ui/Cursor_01.png') 16 16, auto;
  touch-action: none;
}

/* canvas 内鼠标样式 */
.canvas-wrapper.pan-active { cursor: grab; }
.canvas-wrapper.panning { cursor: grabbing; }

.canvas-wrapper :deep(canvas) {
  position: absolute;
  left: 0;
  top: 0;
  image-rendering: pixelated;
  user-select: none;
  cursor: inherit;
}

/* 选中信息面板（羊皮纸背景） */
.selection-panel {
  position: absolute;
  top: 70px;
  right: 20px;
  /* 使用拼接好的羊皮纸素材作为背景 */
  background-image: url('/assets/sprites/ui/RegularPaper.png');
  background-size: 100% 100%;
  background-repeat: no-repeat;
  padding: 16px 20px;
  width: 300px;
  z-index: 100;
  /* 移除边框，使用背景图 */
  border: none;
}

.selection-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(139, 90, 43, 0.3);
}

.selection-avatar {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  object-fit: contain;
  background: rgba(139, 90, 43, 0.2);
}

.selection-icon {
  font-size: 28px;
}

.selection-type {
  font-size: 14px;
  color: #5c3d2e;
  font-weight: 600;
}

.btn-close {
  margin-left: auto;
  background: transparent;
  border: none;
  color: #8b5a2b;
  cursor: pointer;
  font-size: 16px;
  padding: 4px 8px;
}

.btn-close:hover {
  color: #5c3d2e;
}

.selection-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.selection-name {
  font-size: 16px;
  color: #3d2914;
  font-weight: 700;
}

.selection-detail, .selection-status {
  font-size: 12px;
  color: #6b4423;
}
</style>
