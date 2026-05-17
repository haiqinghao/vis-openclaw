<template>
  <div class="map-editor">
    <!-- 左侧素材面板 - 三层分类 -->
    <div class="tile-panel">
      <!-- 分类切换 -->
      <div class="layer-tabs">
        <button
          :class="{ active: currentLayer === 'terrain' }"
          @click="switchLayer('terrain')"
        >🗺️ 地形</button>
        <button
          :class="{ active: currentLayer === 'environment' }"
          @click="switchLayer('environment')"
        >🌍 环境</button>
        <button
          :class="{ active: currentLayer === 'unit' }"
          @click="switchLayer('unit')"
        >🏹 单位</button>
      </div>

      <!-- 地形层素材 -->
      <div v-if="currentLayer === 'terrain'" class="layer-content">
        <h3 class="panel-title">地形瓦片</h3>
        <div class="tile-categories">
          <div class="category">
            <h4>草地</h4>
            <div class="tile-grid">
              <div
                v-for="tile in terrainTiles"
                :key="tile.id"
                class="tile-item"
                :class="{ selected: selectedItem?.id === tile.id && currentLayer === 'terrain' }"
                @click="selectTerrainTile(tile)"
              >
                <canvas class="tile-preview-canvas" :data-id="tile.id" :data-type="'terrain'"></canvas>
                <span class="tile-name">{{ tile.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 环境层素材 -->
      <div v-if="currentLayer === 'environment'" class="layer-content">
        <h3 class="panel-title">环境元素</h3>
        <div class="tile-categories">
          <div class="category">
            <h4>🌲 树木</h4>
            <div class="tile-grid">
              <div
                v-for="elem in treeElements"
                :key="elem.id"
                class="tile-item"
                :class="{ selected: selectedItem?.id === elem.id && currentLayer === 'environment' }"
                @click="selectEnvironmentElement(elem)"
              >
                <canvas class="tile-preview-canvas" :data-id="elem.id" :data-type="'environment'"></canvas>
                <span class="tile-name">{{ elem.name }}</span>
              </div>
            </div>
          </div>
          <div class="category">
            <h4>🪨 石头</h4>
            <div class="tile-grid">
              <div
                v-for="elem in rockElements"
                :key="elem.id"
                class="tile-item"
                :class="{ selected: selectedItem?.id === elem.id && currentLayer === 'environment' }"
                @click="selectEnvironmentElement(elem)"
              >
                <canvas class="tile-preview-canvas" :data-id="elem.id" :data-type="'environment'"></canvas>
                <span class="tile-name">{{ elem.name }}</span>
              </div>
            </div>
          </div>
          <div class="category">
            <h4>🌿 灌木</h4>
            <div class="tile-grid">
              <div
                v-for="elem in bushElements"
                :key="elem.id"
                class="tile-item"
                :class="{ selected: selectedItem?.id === elem.id && currentLayer === 'environment' }"
                @click="selectEnvironmentElement(elem)"
              >
                <canvas class="tile-preview-canvas" :data-id="elem.id" :data-type="'environment'"></canvas>
                <span class="tile-name">{{ elem.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 单位层素材 -->
      <div v-if="currentLayer === 'unit'" class="layer-content">
        <h3 class="panel-title">单位</h3>
        <div class="tile-categories">
          <div class="category">
            <h4>🛡️ 战士</h4>
            <div class="tile-grid">
              <div
                v-for="unit in warriorUnits"
                :key="unit.id"
                class="tile-item"
                :class="{ selected: selectedItem?.id === unit.id && currentLayer === 'unit' }"
                @click="selectUnit(unit)"
              >
                <canvas class="tile-preview-canvas" :data-id="unit.id" :data-type="'unit'"></canvas>
                <span class="tile-name">{{ unit.name }}</span>
              </div>
            </div>
          </div>
          <div class="category">
            <h4>👾 怪物</h4>
            <div class="tile-grid">
              <div
                v-for="unit in monsterUnits"
                :key="unit.id"
                class="tile-item"
                :class="{ selected: selectedItem?.id === unit.id && currentLayer === 'unit' }"
                @click="selectUnit(unit)"
              >
                <canvas class="tile-preview-canvas" :data-id="unit.id" :data-type="'unit'"></canvas>
                <span class="tile-name">{{ unit.name }}</span>
              </div>
            </div>
          </div>
          <div class="category">
            <h4>🏰 建筑</h4>
            <div class="tile-grid">
              <div
                v-for="unit in buildingUnits"
                :key="unit.id"
                class="tile-item"
                :class="{ selected: selectedItem?.id === unit.id && currentLayer === 'unit' }"
                @click="selectUnit(unit)"
              >
                <canvas class="tile-preview-canvas" :data-id="unit.id" :data-type="'unit'"></canvas>
                <span class="tile-name">{{ unit.name }}</span>
              </div>
            </div>
          </div>
          <div class="category">
            <h4>🐑 动物/资源</h4>
            <div class="tile-grid">
              <div
                v-for="unit in animalUnits"
                :key="unit.id"
                class="tile-item"
                :class="{ selected: selectedItem?.id === unit.id && currentLayer === 'unit' }"
                @click="selectUnit(unit)"
              >
                <canvas class="tile-preview-canvas" :data-id="unit.id" :data-type="'unit'"></canvas>
                <span class="tile-name">{{ unit.name }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 当前选中 -->
      <div class="current-selection">
        <h4>当前选中</h4>
        <div v-if="selectedItem" class="selected-preview">
          <span class="layer-badge">{{ layerBadge }}</span>
          <span>{{ selectedItem.name }}</span>
        </div>
        <div v-else class="no-selection">未选择</div>
      </div>
    </div>

    <!-- 中间画布区域 -->
    <div class="canvas-area">
      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="tool-group">
          <button
            :class="{ active: currentTool === 'brush' }"
            @click="currentTool = 'brush'"
          >🖌️ 画笔</button>
          <button
            :class="{ active: currentTool === 'eraser' }"
            @click="currentTool = 'eraser'"
          >🧹 橡皮擦</button>
          <button
            :class="{ active: currentTool === 'pan' }"
            @click="currentTool = 'pan'"
          >拖动</button>
          <button
            :class="{ active: currentTool === 'fill' }"
            @click="currentTool = 'fill'"
          >🪣 填充</button>
        </div>

        <div class="tool-group">
          <button @click="clearMap">🗑️ 清空</button>
          <button @click="fillAll">📦 填充全部</button>
        </div>

        <div class="tool-group">
          <label>网格:</label>
          <select v-model="gridPresetIndex">
            <option v-for="(preset, idx) in GRID_PRESETS" :key="idx" :value="idx">
              {{ preset.label }}
            </option>
          </select>
        </div>

        <div class="tool-group">
          <label>缩放:</label>
          <select v-model="zoomLevel">
            <option v-for="(opt, idx) in ZOOM_OPTIONS" :key="idx" :value="idx">
              {{ opt.label }}
            </option>
          </select>
          <button @click="resetPanToCenter">居中</button>
        </div>
      </div>

      <!-- PixiJS 画布容器 -->
      <div
        ref="canvasContainer"
        class="canvas-container"
        :class="{ 'pan-active': currentTool === 'pan', panning: isPanning }"
        @wheel.prevent="handleWheelZoom"
      ></div>

      <!-- 坐标显示 -->
      <div class="coords-display">
        <span>X: {{ cursorX }}</span>
        <span>Y: {{ cursorY }}</span>
        <span>瓦片: {{ currentTileId || '空' }}</span>
      </div>
    </div>

    <!-- 右侧面板 -->
    <div class="right-panel">
      <div class="save-load-section">
        <h3 class="panel-title">地图操作</h3>

        <div class="map-name-section">
          <label>地图名称:</label>
          <input v-model="mapName" type="text" placeholder="输入地图名称" />
        </div>

        <div class="action-buttons">
          <button class="btn-save" @click="saveMapToStorage">💾 保存</button>
          <button class="btn-list" @click="showMapList = !showMapList">📋 列表 ({{ savedMaps.length }})</button>
          <button class="btn-export" @click="exportMapToJSON">📤 导出</button>
          <button class="btn-import" @click="triggerLoad">📥 导入</button>
          <input ref="fileInput" type="file" accept=".json" @change="loadMapFromFile" hidden />
        </div>

        <!-- 地图列表 -->
        <div v-if="showMapList" class="saved-map-list">
          <div v-if="savedMaps.length === 0" class="no-maps">暂无地图</div>
          <div v-for="map in savedMaps" :key="map.id" class="saved-map-item">
            <div class="map-info">
              <div class="map-name">{{ map.name }}</div>
              <div class="map-meta">{{ map.width }}x{{ map.height }}</div>
            </div>
            <div class="map-actions">
              <button @click="loadMapFromStorage(map.id)">📂</button>
              <button class="delete" @click="deleteMapFromStorage(map.id)">🗑️</button>
            </div>
          </div>
        </div>
      </div>

      <div class="layer-info">
        <h3 class="panel-title">统计</h3>
        <div class="stat">🗺️ 地形瓦片: {{ terrainCount }}</div>
        <div class="stat">🌍 环境元素: {{ environmentCount }}</div>
        <div class="stat">🏹 单位: {{ unitCount }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'
import * as PIXI from 'pixi.js'
import {
  getMapList as fetchMapListApi,
  getMapData as fetchMapDataApi,
  saveMapData as storeMapDataApi,
  deleteMap as removeMapApi,
  generateMapId,
  type MapData as MapDataStored,
  type MapListItem
} from '@/types/map'

// =====================================================
// 类型定义
// =====================================================
interface TileDef {
  id: string
  name: string
  file: string
  type: 'terrain' | 'environment' | 'unit'
  frameW?: number  // 帧宽度（用于截取第一帧）
  frameH?: number  // 帧高度
}

interface PlacedObject {
  id: string      // 素材ID
  x: number       // 网格X坐标
  y: number       // 网格Y坐标
  type: 'terrain' | 'environment' | 'unit'
}

// =====================================================
// 常量配置
// =====================================================
const TILE_SIZE = 32

// 网格预设配置（标注分辨率）
const GRID_PRESETS = [
  { width: 16, height: 12, label: '16x12 (SD)' },
  { width: 24, height: 12, label: '24x12 (SD+)' },
  { width: 32, height: 12, label: '32x12 (720P半)' },
  { width: 60, height: 34, label: '60x34 (1080P)' },
  { width: 80, height: 45, label: '80x45 (2K)' },
  { width: 120, height: 68, label: '120x68 (4K)' },
]

// 缩放比例选项
const ZOOM_OPTIONS = [
  { value: 1, label: '100%' },
  { value: 0.85, label: '85%' },
  { value: 0.7, label: '70%' },
  { value: 0.55, label: '55%' },
  { value: 0.4, label: '40%' },
  { value: 0.25, label: '25%' },
  { value: 0.1, label: '10%' },
]

// ==================== 地形瓦片 ====================
const terrainTiles: TileDef[] = [
  { id: 'grass1', name: '草地1', file: 'grass1', type: 'terrain' },
  { id: 'grass2', name: '草地2', file: 'grass2', type: 'terrain' },
]

const TERRAIN_FILES: Record<string, string> = {
  grass1: '/assets/sprites/terrain/grass1.png',
  grass2: '/assets/sprites/terrain/grass2.png',
}

// ==================== 环境元素 ====================
const treeElements: TileDef[] = [
  { id: 'tree1', name: '树木1', file: 'tree1', type: 'environment', frameW: 192, frameH: 256 },
  { id: 'tree2', name: '树木2', file: 'tree2', type: 'environment', frameW: 192, frameH: 256 },
  { id: 'tree3', name: '树木3', file: 'tree3', type: 'environment', frameW: 192, frameH: 192 },
  { id: 'tree4', name: '树木4', file: 'tree4', type: 'environment', frameW: 192, frameH: 192 },
]

const rockElements: TileDef[] = [
  { id: 'rock', name: '石头', file: 'rock', type: 'environment', frameW: 64, frameH: 64 },
  { id: 'rock1', name: '石头1', file: 'rock1', type: 'environment', frameW: 64, frameH: 64 },
  { id: 'rock2', name: '石头2', file: 'rock2', type: 'environment', frameW: 64, frameH: 64 },
  { id: 'rock3', name: '石头3', file: 'rock3', type: 'environment', frameW: 64, frameH: 64 },
]

const bushElements: TileDef[] = [
  { id: 'bush', name: '灌木', file: 'bush', type: 'environment', frameW: 128, frameH: 128 },
  { id: 'bush1', name: '灌木1', file: 'bush1', type: 'environment', frameW: 128, frameH: 128 },
  { id: 'bush2', name: '灌木2', file: 'bush2', type: 'environment', frameW: 128, frameH: 128 },
]

const ENVIRONMENT_FILES: Record<string, string> = {
  tree1: '/assets/sprites/terrain/tree1.png',
  tree2: '/assets/sprites/terrain/tree2.png',
  tree3: '/assets/sprites/terrain/tree3.png',
  tree4: '/assets/sprites/terrain/tree4.png',
  rock: '/assets/sprites/terrain/rock.png',
  rock1: '/assets/sprites/terrain/rock1.png',
  rock2: '/assets/sprites/terrain/rock2.png',
  rock3: '/assets/sprites/terrain/rock3.png',
  bush: '/assets/sprites/terrain/bush.png',
  bush1: '/assets/sprites/terrain/bush1.png',
  bush2: '/assets/sprites/terrain/bush2.png',
}

// ==================== 单位 ====================
const warriorUnits: TileDef[] = [
  { id: 'warrior', name: '战士', file: 'warrior', type: 'unit', frameW: 192, frameH: 192 },
  { id: 'archer', name: '弓箭手', file: 'archer', type: 'unit', frameW: 192, frameH: 192 },
  { id: 'monk', name: '僧侣', file: 'monk', type: 'unit', frameW: 192, frameH: 192 },
  { id: 'pawn', name: '步兵', file: 'pawn', type: 'unit', frameW: 192, frameH: 192 },
  { id: 'lancer', name: '枪骑兵', file: 'lancer', type: 'unit', frameW: 192, frameH: 320 },
]

const monsterUnits: TileDef[] = [
  { id: 'monster_warrior', name: '怪物战士', file: 'monster_warrior', type: 'unit', frameW: 192, frameH: 192 },
  { id: 'monster_archer', name: '怪物弓手', file: 'monster_archer', type: 'unit', frameW: 192, frameH: 192 },
  { id: 'monster_boss', name: '怪物Boss', file: 'monster_boss', type: 'unit', frameW: 192, frameH: 192 },
]

// ==================== 建筑 ====================
const buildingUnits: TileDef[] = [
  { id: 'barracks', name: '兵营', file: 'barracks', type: 'unit', frameW: 192, frameH: 256 },
  { id: 'castle', name: '城堡', file: 'castle', type: 'unit', frameW: 320, frameH: 256 },
  { id: 'castle_yellow', name: '黄城堡', file: 'castle_yellow', type: 'unit', frameW: 320, frameH: 256 },
]

// ==================== 动物/资源 ====================
const animalUnits: TileDef[] = [
  { id: 'gold', name: '金矿', file: 'gold', type: 'unit', frameW: 128, frameH: 128 },
  { id: 'sheep', name: '绵羊', file: 'sheep_idle', type: 'unit', frameW: 128, frameH: 128 },
]

const UNIT_FILES: Record<string, string> = {
  warrior: '/assets/sprites/units/warrior.png',
  archer: '/assets/sprites/units/archer.png',
  monk: '/assets/sprites/units/monk.png',
  pawn: '/assets/sprites/units/pawn.png',
  lancer: '/assets/sprites/units/Lancer_Idle.png',
  monster_warrior: '/assets/sprites/units/monster_warrior.png',
  monster_archer: '/assets/sprites/units/monster_archer.png',
  monster_boss: '/assets/sprites/units/monster_boss.png',
  barracks: '/assets/sprites/buildings/barracks.png',
  castle: '/assets/sprites/buildings/castle.png',
  castle_yellow: '/assets/sprites/buildings/castle_yellow.png',
  gold: '/assets/sprites/terrain/gold.png',
  sheep_idle: '/assets/sprites/terrain/sheep_idle.png',
}

// 所有素材合集
const allElements = [...terrainTiles, ...treeElements, ...rockElements, ...bushElements, ...warriorUnits, ...monsterUnits, ...buildingUnits, ...animalUnits]

// =====================================================
// 状态
// =====================================================
const canvasContainer = ref<HTMLElement>()
const fileInput = ref<HTMLInputElement>()
const selectedItem = ref<TileDef | null>(null)
const currentLayer = ref<'terrain' | 'environment' | 'unit'>('terrain')
const currentTool = ref<'brush' | 'eraser' | 'fill' | 'pan'>('brush')
const gridPresetIndex = ref(3) // 默认选中 1080P (索引3)
const zoomLevel = ref(0) // 默认 100%
const cursorX = ref(0)
const cursorY = ref(0)
const currentTileId = ref('')
const mapName = ref('未命名地图')
const savedMaps = ref<MapListItem[]>([])
const showMapList = ref(false)

// 三层数据
const terrainLayer = ref<string[][]>([])           // 地形层：瓦片网格
const environmentLayer = ref<PlacedObject[]>([])   // 环境层：对象列表
const unitLayer = ref<PlacedObject[]>([])          // 单位层：对象列表

// 当前网格尺寸（计算属性）
const gridWidth = computed(() => GRID_PRESETS[gridPresetIndex.value].width)
const gridHeight = computed(() => GRID_PRESETS[gridPresetIndex.value].height)
// 当前缩放比例（计算属性）
const zoomRatio = computed(() => ZOOM_OPTIONS[zoomLevel.value].value)

// 层徽章显示
const layerBadge = computed(() => {
  switch (currentLayer.value) {
    case 'terrain': return '🗺️'
    case 'environment': return '🌍'
    case 'unit': return '🏹'
  }
})

// 统计
const terrainCount = computed(() => {
  let count = 0
  terrainLayer.value.forEach(row => {
    row.forEach(cell => {
      if (cell !== 'empty') count++
    })
  })
  return count
})

const environmentCount = computed(() => environmentLayer.value.length)
const unitCount = computed(() => unitLayer.value.length)

// PixiJS
let app: PIXI.Application | null = null
let terrainContainer: PIXI.Container | null = null
let environmentContainer: PIXI.Container | null = null
let unitContainer: PIXI.Container | null = null
let gridGraphics: PIXI.Graphics | null = null
let isDrawing = false
const isPanning = ref(false)
const panOffset = ref({ x: 0, y: 0 })
let panStart = { pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 }
let zoomAnchor: { clientX: number; clientY: number } | null = null
let elementTextures: Map<string, PIXI.Texture> = new Map()

// =====================================================
// 选择方法
// =====================================================
function selectTerrainTile(tile: TileDef) {
  selectedItem.value = tile
  currentLayer.value = 'terrain'
}

function selectEnvironmentElement(elem: TileDef) {
  selectedItem.value = elem
  currentLayer.value = 'environment'
}

function selectUnit(unit: TileDef) {
  selectedItem.value = unit
  currentLayer.value = 'unit'
}

// 切换层时清除选择
function switchLayer(layer: 'terrain' | 'environment' | 'unit') {
  currentLayer.value = layer
  selectedItem.value = null  // 切换层时清除选择，避免混淆
}

// =====================================================
// 数据初始化
// =====================================================
function initMapData() {
  // 地形层：网格初始化
  terrainLayer.value = []
  for (let y = 0; y < gridHeight.value; y++) {
    terrainLayer.value[y] = []
    for (let x = 0; x < gridWidth.value; x++) {
      terrainLayer.value[y][x] = 'empty'
    }
  }
  // 环境层和单位层：空数组
  environmentLayer.value = []
  unitLayer.value = []
}

// =====================================================
// 加载素材
// =====================================================
async function loadAllAssets() {
  try {
    // 加载地形瓦片
    for (const [key, path] of Object.entries(TERRAIN_FILES)) {
      const tex = await PIXI.Assets.load(path)
      elementTextures.set(key, tex)
    }
    // 加载环境元素
    for (const [key, path] of Object.entries(ENVIRONMENT_FILES)) {
      const tex = await PIXI.Assets.load(path)
      elementTextures.set(key, tex)
    }
    // 加载单位
    for (const [key, path] of Object.entries(UNIT_FILES)) {
      const tex = await PIXI.Assets.load(path)
      elementTextures.set(key, tex)
    }
    return true
  } catch (e) {
    console.error('Failed to load assets:', e)
    return false
  }
}

function updateTilePreviews() {
  const canvases = document.querySelectorAll('.tile-preview-canvas')
  canvases.forEach((canvas) => {
    const id = canvas.getAttribute('data-id')
    const elem = allElements.find(e => e.id === id)
    const tex = elem ? elementTextures.get(elem.file) : null

    if (tex && canvas instanceof HTMLCanvasElement && elem) {
      const ctx = canvas.getContext('2d')
      if (ctx && app?.renderer) {
        canvas.width = 32
        canvas.height = 32

        // 如果有帧信息，只渲染第一帧
        let renderTex = tex
        if (elem.frameW && elem.frameH) {
          const frameRect = new PIXI.Rectangle(0, 0, elem.frameW, elem.frameH)
          renderTex = new PIXI.Texture(tex.baseTexture, frameRect)
        }

        const sprite = new PIXI.Sprite(renderTex)
        const renderTexture = PIXI.RenderTexture.create({
          width: renderTex.width,
          height: renderTex.height
        })
        app.renderer.render(sprite, { renderTexture })

        const canvas2d = app.renderer.extract.canvas(renderTexture) as unknown as CanvasImageSource
        // 缩放到 32x32 预览
        ctx.drawImage(canvas2d, 0, 0, renderTex.width, renderTex.height, 0, 0, 32, 32)
        renderTexture.destroy(true)
      }
    }
  })
}

function getCanvasElement(): HTMLCanvasElement | null {
  return app ? app.view as HTMLCanvasElement : null
}

function applyCanvasTransform() {
  const canvas = getCanvasElement()
  if (!canvas) return

  canvas.style.transform = `translate(${panOffset.value.x}px, ${panOffset.value.y}px) scale(${zoomRatio.value})`
  canvas.style.transformOrigin = 'top left'
}

function resetPanToCenter() {
  if (!canvasContainer.value || !app) return

  const scaledWidth = gridWidth.value * TILE_SIZE * zoomRatio.value
  const scaledHeight = gridHeight.value * TILE_SIZE * zoomRatio.value

  panOffset.value = {
    x: Math.round((canvasContainer.value.clientWidth - scaledWidth) / 2),
    y: Math.round((canvasContainer.value.clientHeight - scaledHeight) / 2)
  }
  applyCanvasTransform()
}

function updateZoom(previousZoom = zoomRatio.value) {
  if (!app || !canvasContainer.value) {
    applyCanvasTransform()
    return
  }

  const rect = canvasContainer.value.getBoundingClientRect()
  const anchorX = zoomAnchor
    ? zoomAnchor.clientX - rect.left
    : canvasContainer.value.clientWidth / 2
  const anchorY = zoomAnchor
    ? zoomAnchor.clientY - rect.top
    : canvasContainer.value.clientHeight / 2
  const mapAnchorX = (anchorX - panOffset.value.x) / previousZoom
  const mapAnchorY = (anchorY - panOffset.value.y) / previousZoom

  panOffset.value = {
    x: anchorX - mapAnchorX * zoomRatio.value,
    y: anchorY - mapAnchorY * zoomRatio.value
  }
  zoomAnchor = null
  applyCanvasTransform()
}

function handleWheelZoom(event: WheelEvent) {
  if (!app) return

  const direction = event.deltaY > 0 ? 1 : -1
  const nextIndex = Math.max(0, Math.min(ZOOM_OPTIONS.length - 1, zoomLevel.value + direction))
  if (nextIndex === zoomLevel.value) return

  zoomAnchor = { clientX: event.clientX, clientY: event.clientY }
  zoomLevel.value = nextIndex
}

function getPointerClientPosition(e: PIXI.FederatedPointerEvent) {
  const eventLike = e as any
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
    x: (rect?.left || 0) + e.globalX * zoomRatio.value,
    y: (rect?.top || 0) + e.globalY * zoomRatio.value
  }
}

function getPointerTile(e: PIXI.FederatedPointerEvent) {
  const canvas = getCanvasElement()
  if (!canvas) return null

  const pointer = getPointerClientPosition(e)
  const rect = canvas.getBoundingClientRect()
  const localX = (pointer.x - rect.left) / zoomRatio.value
  const localY = (pointer.y - rect.top) / zoomRatio.value

  return {
    x: Math.floor(localX / TILE_SIZE),
    y: Math.floor(localY / TILE_SIZE)
  }
}

async function initPixi() {
  if (!canvasContainer.value) return

  await loadAllAssets()

  const width = gridWidth.value * TILE_SIZE
  const height = gridHeight.value * TILE_SIZE

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

  canvasContainer.value.appendChild(canvas)
  resetPanToCenter()

  // 创建三层容器（从下到上）
  terrainContainer = new PIXI.Container()
  environmentContainer = new PIXI.Container()
  unitContainer = new PIXI.Container()
  gridGraphics = new PIXI.Graphics()

  // 添加到舞台（顺序很重要）
  app.stage.addChild(terrainContainer)    // 最底层
  app.stage.addChild(environmentContainer) // 中层
  app.stage.addChild(unitContainer)        // 最上层
  app.stage.addChild(gridGraphics)         // 网格线

  // 在 app 创建后更新预览
  await nextTick()
  updateTilePreviews()

  drawGrid()
  drawAllLayers()

  app.stage.eventMode = 'static'
  app.stage.hitArea = new PIXI.Rectangle(0, 0, width, height)

  app.stage.on('pointerdown', handlePointerDown)
  app.stage.on('pointermove', handlePointerMove)
  app.stage.on('pointerup', handlePointerUp)
  app.stage.on('pointerupoutside', handlePointerUp)
}

function drawGrid() {
  if (!gridGraphics) return

  gridGraphics.clear()
  gridGraphics.lineStyle(1, 0x444455, 0.3)

  const width = gridWidth.value * TILE_SIZE
  const height = gridHeight.value * TILE_SIZE

  for (let x = 0; x <= width; x += TILE_SIZE) {
    gridGraphics.moveTo(x, 0)
    gridGraphics.lineTo(x, height)
  }

  for (let y = 0; y <= height; y += TILE_SIZE) {
    gridGraphics.moveTo(0, y)
    gridGraphics.lineTo(width, y)
  }
}

// 绘制所有层
function drawAllLayers() {
  drawTerrainLayer()
  drawEnvironmentLayer()
  drawUnitLayer()
}

// 绘制地形层
function drawTerrainLayer() {
  if (!terrainContainer) return

  terrainContainer.removeChildren()

  terrainLayer.value.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === 'empty') return

      const tex = elementTextures.get(cell)
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

// 绘制环境层
function drawEnvironmentLayer() {
  if (!environmentContainer) return

  environmentContainer.removeChildren()

  environmentLayer.value.forEach(obj => {
    const elem = allElements.find(e => e.id === obj.id)
    const tex = elem ? elementTextures.get(elem.file) : null
    if (tex && elem) {
      // 如果有帧信息，只显示第一帧
      if (elem.frameW && elem.frameH) {
        const frameRect = new PIXI.Rectangle(0, 0, elem.frameW, elem.frameH)
        const frameTex = new PIXI.Texture(tex.baseTexture, frameRect)
        const sprite = new PIXI.Sprite(frameTex)
        sprite.x = obj.x * TILE_SIZE
        sprite.y = obj.y * TILE_SIZE
        environmentContainer!.addChild(sprite)
      } else {
        // 没有帧信息，显示整个图片
        const sprite = new PIXI.Sprite(tex)
        sprite.x = obj.x * TILE_SIZE
        sprite.y = obj.y * TILE_SIZE
        environmentContainer!.addChild(sprite)
      }
    }
  })
}

// 绘制单位层
function drawUnitLayer() {
  if (!unitContainer) return

  unitContainer.removeChildren()

  unitLayer.value.forEach(obj => {
    const elem = allElements.find(e => e.id === obj.id)
    const tex = elem ? elementTextures.get(elem.file) : null
    if (tex && elem) {
      // 如果有帧信息，只显示第一帧
      if (elem.frameW && elem.frameH) {
        const frameRect = new PIXI.Rectangle(0, 0, elem.frameW, elem.frameH)
        const frameTex = new PIXI.Texture(tex.baseTexture, frameRect)
        const sprite = new PIXI.Sprite(frameTex)
        sprite.x = obj.x * TILE_SIZE
        sprite.y = obj.y * TILE_SIZE
        unitContainer!.addChild(sprite)
      } else {
        // 没有帧信息，显示整个图片
        const sprite = new PIXI.Sprite(tex)
        sprite.x = obj.x * TILE_SIZE
        sprite.y = obj.y * TILE_SIZE
        unitContainer!.addChild(sprite)
      }
    }
  })
}

function handlePointerDown(e: PIXI.FederatedPointerEvent) {
  if (currentTool.value === 'pan') {
    const pointer = getPointerClientPosition(e)
    isPanning.value = true
    panStart = {
      pointerX: pointer.x,
      pointerY: pointer.y,
      offsetX: panOffset.value.x,
      offsetY: panOffset.value.y
    }
    return
  }

  const tile = getPointerTile(e)
  if (!tile) return

  isDrawing = true
  applyTool(tile.x, tile.y)
  return
}

function handlePointerMove(e: PIXI.FederatedPointerEvent) {
  if (isPanning.value) {
    const pointer = getPointerClientPosition(e)
    panOffset.value = {
      x: panStart.offsetX + pointer.x - panStart.pointerX,
      y: panStart.offsetY + pointer.y - panStart.pointerY
    }
    applyCanvasTransform()
    return
  }

  const tile = getPointerTile(e)
  if (!tile) return

  const { x, y } = tile
  cursorX.value = Math.max(0, Math.min(x, gridWidth.value - 1))
  cursorY.value = Math.max(0, Math.min(y, gridHeight.value - 1))

  if (currentLayer.value === 'terrain') {
    currentTileId.value = terrainLayer.value[y]?.[x] || 'empty'
  } else if (currentLayer.value === 'environment') {
    const obj = environmentLayer.value.find(o => o.x === x && o.y === y)
    currentTileId.value = obj ? obj.id : 'empty'
  } else if (currentLayer.value === 'unit') {
    const obj = unitLayer.value.find(o => o.x === x && o.y === y)
    currentTileId.value = obj ? obj.id : 'empty'
  }

  if (isDrawing && currentTool.value === 'brush') {
    applyTool(x, y)
  }
  return
}

function handlePointerUp() {
  isDrawing = false
  isPanning.value = false
}

function applyTool(x: number, y: number) {
  if (x < 0 || x >= gridWidth.value || y < 0 || y >= gridHeight.value) return

  if (currentTool.value === 'brush' && selectedItem.value) {
    // 根据当前层执行不同操作
    if (currentLayer.value === 'terrain') {
      // 地形层：瓦片填充
      terrainLayer.value[y][x] = selectedItem.value.id
      drawTerrainLayer()
    } else if (currentLayer.value === 'environment') {
      // 环境层：添加对象（检查是否已有）
      const existingIdx = environmentLayer.value.findIndex(o => o.x === x && o.y === y)
      if (existingIdx >= 0) {
        // 替换已有对象
        environmentLayer.value[existingIdx].id = selectedItem.value.id
      } else {
        // 添加新对象
        environmentLayer.value.push({ id: selectedItem.value.id, x, y, type: 'environment' })
      }
      drawEnvironmentLayer()
    } else if (currentLayer.value === 'unit') {
      // 单位层：添加对象（检查是否已有）
      const existingIdx = unitLayer.value.findIndex(o => o.x === x && o.y === y)
      if (existingIdx >= 0) {
        unitLayer.value[existingIdx].id = selectedItem.value.id
      } else {
        unitLayer.value.push({ id: selectedItem.value.id, x, y, type: 'unit' })
      }
      drawUnitLayer()
    }
  } else if (currentTool.value === 'eraser') {
    // 橡皮擦：根据当前层删除
    if (currentLayer.value === 'terrain') {
      terrainLayer.value[y][x] = 'empty'
      drawTerrainLayer()
    } else if (currentLayer.value === 'environment') {
      const idx = environmentLayer.value.findIndex(o => o.x === x && o.y === y)
      if (idx >= 0) {
        environmentLayer.value.splice(idx, 1)
        drawEnvironmentLayer()
      }
    } else if (currentLayer.value === 'unit') {
      const idx = unitLayer.value.findIndex(o => o.x === x && o.y === y)
      if (idx >= 0) {
        unitLayer.value.splice(idx, 1)
        drawUnitLayer()
      }
    }
  } else if (currentTool.value === 'fill' && selectedItem.value && currentLayer.value === 'terrain') {
    // 填充只对地形层有效
    const targetType = terrainLayer.value[y][x]
    floodFill(x, y, targetType, selectedItem.value.id)
    drawTerrainLayer()
  }
}

function floodFill(x: number, y: number, targetType: string, newType: string) {
  if (x < 0 || x >= gridWidth.value || y < 0 || y >= gridHeight.value) return
  if (terrainLayer.value[y][x] !== targetType) return
  if (targetType === newType) return

  terrainLayer.value[y][x] = newType

  floodFill(x + 1, y, targetType, newType)
  floodFill(x - 1, y, targetType, newType)
  floodFill(x, y + 1, targetType, newType)
  floodFill(x, y - 1, targetType, newType)
}

function clearMap() {
  initMapData()
  drawAllLayers()
}

function fillAll() {
  const defaultTile = terrainTiles[0]
  if (!defaultTile) return

  for (let y = 0; y < gridHeight.value; y++) {
    for (let x = 0; x < gridWidth.value; x++) {
      terrainLayer.value[y][x] = defaultTile.id
    }
  }
  drawTerrainLayer()
}

// ============== 存储 ==============
// 使用 map.ts 中定义的存储函数

async function loadSavedMaps() {
  const list = await fetchMapListApi()
  savedMaps.value = list
}

function generateId(): string {
  return generateMapId()
}

async function saveMapToStorage() {
  const name = mapName.value.trim() || '未命名地图'
  const id = generateId()

  const mapData: MapDataStored = {
    id,
    name,
    width: gridWidth.value,
    height: gridHeight.value,
    layers: {
      terrain: terrainLayer.value,
      environment: environmentLayer.value.map(obj => ({ x: obj.x, y: obj.y, type: obj.id })),
      units: unitLayer.value.map(obj => ({ x: obj.x, y: obj.y, type: obj.id })),
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  await storeMapDataApi(mapData)
  console.log('[MapEditor] Map saved:', id, name)

  await loadSavedMaps()
}

async function loadMapFromStorage(id: string) {
  const mapData = await fetchMapDataApi(id)
  if (!mapData) {
    console.error('[MapEditor] Failed to load map:', id)
    return
  }

  console.log('[MapEditor] Loading map:', id, mapData.name)
  mapName.value = mapData.name

  const presetIdx = GRID_PRESETS.findIndex(p => p.width === mapData.width && p.height === mapData.height)
  const targetPresetIdx = presetIdx >= 0 ? presetIdx : 3

  if (gridPresetIndex.value !== targetPresetIdx) {
    gridPresetIndex.value = targetPresetIdx

    nextTick(() => {
      terrainLayer.value = mapData.layers.terrain
      environmentLayer.value = mapData.layers.environment.map((e: any) => ({
        id: e.type, x: e.x, y: e.y, type: 'environment'
      }))
      unitLayer.value = mapData.layers.units.map((u: any) => ({
        id: u.type, x: u.x, y: u.y, type: 'unit'
      }))
      drawAllLayers()
    })
  } else {
    terrainLayer.value = mapData.layers.terrain
    environmentLayer.value = mapData.layers.environment.map((e: any) => ({
      id: e.type, x: e.x, y: e.y, type: 'environment'
    }))
    unitLayer.value = mapData.layers.units.map((u: any) => ({
      id: u.type, x: u.x, y: u.y, type: 'unit'
    }))
    drawAllLayers()
  }

  showMapList.value = false
}

async function deleteMapFromStorage(id: string) {
  await removeMapApi(id)
  await loadSavedMaps()
}

function exportMapToJSON() {
  const data = {
    version: '2.0',  // 升级版本号
    name: mapName.value || '未命名地图',
    width: gridWidth.value,
    height: gridHeight.value,
    terrain: terrainLayer.value,
    environment: environmentLayer.value,
    units: unitLayer.value,
    exportedAt: Date.now(),
  }

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `${mapName.value || 'map'}_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerLoad() {
  fileInput.value?.click()
}

function loadMapFromFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target?.result as string)

      mapName.value = data.name || '导入的地图'
      // 找到匹配的预设索引，或默认1080P
      const presetIdx = GRID_PRESETS.findIndex(p => p.width === (data.width || 60) && p.height === (data.height || 34))
      gridPresetIndex.value = presetIdx >= 0 ? presetIdx : 3
      initMapData()

      // 加载三层数据
      if (data.terrain) {
        terrainLayer.value = data.terrain
      }
      if (data.environment) {
        environmentLayer.value = data.environment
      }
      if (data.units) {
        unitLayer.value = data.units
      }

      destroyPixi()
      initPixi()
    } catch (err) {
      console.error('加载失败:', err)
    }
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

function destroyPixi() {
  if (app) {
    app.destroy(true)
    app = null
    terrainContainer = null
    environmentContainer = null
    unitContainer = null
    gridGraphics = null
  }
  elementTextures.clear()
}

function handleWindowResize() {
  updateZoom(zoomRatio.value)
}

watch(gridPresetIndex, async () => {
  initMapData()
  destroyPixi()
  await initPixi()
})

watch(zoomLevel, (_value, oldValue) => {
  const previousZoom = ZOOM_OPTIONS[oldValue]?.value || zoomRatio.value
  updateZoom(previousZoom)
})

onMounted(async () => {
  initMapData()
  await initPixi()
  await loadSavedMaps()
  window.addEventListener('resize', handleWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  destroyPixi()
})
</script>

<style scoped>
.map-editor {
  width: 100%;
  height: 100vh;
  display: flex;
  background: #0a0a0f;
  font-family: 'Courier New', monospace;
  color: #ccc;
}

.tile-panel {
  width: 220px;
  background: rgba(26, 26, 46, 0.95);
  border-right: 2px solid #00ff88;
  padding: 15px;
  overflow-y: auto;
}

.layer-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 15px;
}

.layer-tabs button {
  flex: 1;
  font-size: 10px;
  padding: 6px 4px;
  background: rgba(42, 42, 62, 0.8);
  border: 2px solid #444;
  color: #888;
  cursor: pointer;
  transition: all 0.2s;
}

.layer-tabs button:hover { border-color: #00aaff; color: #00aaff; }
.layer-tabs button.active {
  border-color: #00ff88;
  background: rgba(0, 255, 136, 0.1);
  color: #00ff88;
}

.layer-content { margin-top: 10px; }

.layer-badge {
  display: inline-block;
  margin-right: 6px;
  font-size: 12px;
}

.panel-title {
  font-size: 13px;
  color: #00ff88;
  margin-bottom: 15px;
  border-bottom: 1px solid rgba(0, 255, 136, 0.3);
  padding-bottom: 8px;
}

.tile-categories { display: flex; flex-direction: column; gap: 15px; }
.category h4 { font-size: 10px; color: #ffaa00; margin-bottom: 8px; }
.tile-grid { display: flex; flex-wrap: wrap; gap: 6px; }

.tile-item {
  width: 55px;
  height: 55px;
  background: rgba(42, 42, 62, 0.8);
  border: 2px solid #444;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.tile-item:hover { border-color: #00aaff; }
.tile-item.selected {
  border-color: #00ff88;
  background: rgba(0, 255, 136, 0.1);
  box-shadow: 0 0 8px rgba(0, 255, 136, 0.5);
}

.tile-preview-canvas { width: 24px; height: 24px; image-rendering: pixelated; }
.tile-name { font-size: 8px; color: #888; margin-top: 2px; }

.current-selection { margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(0, 255, 136, 0.3); }
.selected-preview { padding: 8px; background: rgba(0, 255, 136, 0.1); border: 1px solid #00ff88; color: #00ff88; }
.no-selection { color: #666; text-align: center; }

.canvas-area { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

.toolbar {
  display: flex; gap: 15px; padding: 10px 20px;
  background: rgba(26, 26, 46, 0.9);
  border-bottom: 2px solid #00ff88;
}

.tool-group { display: flex; align-items: center; gap: 8px; }
.tool-group button {
  font-size: 12px; padding: 6px 12px;
  background: #1a1a2e; border: 2px solid #00ff88; color: #00ff88;
  cursor: pointer;
}
.tool-group button:hover { background: #00ff88; color: #0a0a0f; }
.tool-group button.active { background: #00ff88; color: #0a0a0f; }
.tool-group label { color: #888; font-size: 10px; }
.tool-group select {
  font-size: 12px; padding: 4px 8px;
  background: #1a1a2e; border: 2px solid #00ff88; color: #00ff88;
}

.canvas-container {
  flex: 1;
  position: relative;
  background: #0a0a0f;
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
}

.canvas-container.pan-active { cursor: grab; }
.canvas-container.panning { cursor: grabbing; }

.canvas-container :deep(canvas) {
  position: absolute;
  left: 0;
  top: 0;
  image-rendering: pixelated;
  cursor: inherit;
  user-select: none;
}

.coords-display {
  padding: 8px 20px; background: rgba(26, 26, 46, 0.9);
  border-top: 2px solid #00aaff;
  display: flex; gap: 20px; color: #00aaff; font-size: 12px;
}

.right-panel {
  width: 180px;
  background: rgba(26, 26, 46, 0.95);
  border-left: 2px solid #00aaff;
  padding: 15px;
  display: flex; flex-direction: column; gap: 15px;
}

.save-load-section { display: flex; flex-direction: column; gap: 10px; }

.map-name-section { display: flex; flex-direction: column; gap: 4px; }
.map-name-section label { font-size: 10px; color: #888; }
.map-name-section input {
  font-size: 12px; padding: 8px;
  background: #1a1a2e; border: 2px solid #00aaff; color: #00aaff;
}

.action-buttons { display: flex; flex-direction: column; gap: 6px; }
.action-buttons button {
  font-size: 12px; padding: 8px;
  background: #1a1a2e; border: 2px solid #00aaff; color: #00aaff;
  cursor: pointer;
}
.action-buttons button:hover { background: #00aaff; color: #0a0a0f; }
.btn-save { border-color: #00ff88 !important; color: #00ff88 !important; }
.btn-save:hover { background: #00ff88 !important; }
.btn-export { border-color: #ffaa00 !important; color: #ffaa00 !important; }
.btn-export:hover { background: #ffaa00 !important; color: #0a0a0f !important; }

.saved-map-list {
  max-height: 200px; overflow-y: auto;
  border: 1px solid #444; padding: 8px; background: rgba(42, 42, 62, 0.5);
}

.saved-map-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px; background: rgba(42, 42, 62, 0.8);
  border: 1px solid #444; margin-bottom: 6px;
}

.map-info { flex: 1; }
.map-info .map-name { font-size: 11px; color: #00ff88; }
.map-info .map-meta { font-size: 9px; color: #666; }

.map-actions { display: flex; gap: 4px; }
.map-actions button { font-size: 12px; padding: 4px 6px; background: #1a1a2e; border: 1px solid #444; cursor: pointer; }
.map-actions button:hover { border-color: #00ff88; }
.map-actions .delete { border-color: #ff0066; }
.map-actions .delete:hover { background: #ff0066; }

.no-maps { color: #666; text-align: center; padding: 15px; font-size: 12px; }

.layer-info { border-top: 1px solid rgba(0, 170, 255, 0.3); padding-top: 15px; }
.stat { font-size: 12px; color: #00ff88; }
</style>
