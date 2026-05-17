<template>
  <div class="sprite-demo-view">
    <!-- 顶部控制栏 -->
    <div class="header">
      <h2>🏹 单位演示 - Tiny Swords</h2>
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['tab-btn', { active: activeTab === tab.key }]"
          @click="switchTab(tab.key)"
        >
          {{ tab.icon }} {{ tab.name }}
        </button>
      </div>
      <div class="controls">
        <div class="control-group">
          <label>动画速度:</label>
          <input type="range" v-model="animationSpeed" min="0.05" max="0.5" step="0.05" />
          <span>{{ animationSpeed }}</span>
        </div>
        <div class="control-group">
          <label>缩放:</label>
          <input type="range" v-model="scale" min="0.3" max="2" step="0.1" />
          <span>{{ scale }}x</span>
        </div>
      </div>
    </div>

    <!-- 主画布区域 -->
    <div class="canvas-area" ref="canvasArea">
      <div ref="canvasContainer" class="canvas-container"></div>
    </div>

    <!-- 图例 -->
    <div class="legend">
      <span>💡 每个单位一行，展示所有动作</span>
      <span>🎯 点击精灵可暂停/恢复动画</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import * as PIXI from 'pixi.js'

// Tab 配置
type SpriteCategory = 'units' | 'monsters' | 'buildings' | 'animals'

const tabs: Array<{ key: SpriteCategory; name: string; icon: string }> = [
  { key: 'units', name: '战斗单位', icon: '🛡️' },
  { key: 'monsters', name: '怪物', icon: '👾' },
  { key: 'buildings', name: '建筑', icon: '🏠' },
  { key: 'animals', name: '动物/资源', icon: '🐑' }
]

const activeTab = ref<SpriteCategory>('units')
const canvasContainer = ref<HTMLElement>()
const canvasArea = ref<HTMLElement>()
const animationSpeed = ref(0.12)
const scale = ref(0.8)

let app: PIXI.Application | null = null
let animatedSprites: PIXI.AnimatedSprite[] = []

// Black Units 配置 (战斗单位)
const BLACK_UNITS_CONFIG = [
  {
    name: '🏹 Archer (弓箭手)',
    color: 0x4a90d9,
    folder: 'Archer',
    sprites: [
      { file: 'Archer_Idle', frameW: 192, frameH: 192, frames: 6, label: 'Idle' },
      { file: 'Archer_Run', frameW: 192, frameH: 192, frames: 4, label: 'Run' },
      { file: 'Archer_Shoot', frameW: 192, frameH: 192, frames: 8, label: 'Shoot' },
      { file: 'Arrow', frameW: 64, frameH: 64, frames: 1, label: 'Arrow' },
    ]
  },
  {
    name: '⚔️ Warrior (战士)',
    color: 0xd94a4a,
    folder: 'Warrior',
    sprites: [
      { file: 'Warrior_Idle', frameW: 192, frameH: 192, frames: 8, label: 'Idle' },
      { file: 'Warrior_Run', frameW: 192, frameH: 192, frames: 6, label: 'Run' },
      { file: 'Warrior_Attack1', frameW: 192, frameH: 192, frames: 4, label: 'Attack1' },
      { file: 'Warrior_Attack2', frameW: 192, frameH: 192, frames: 4, label: 'Attack2' },
      { file: 'Warrior_Guard', frameW: 192, frameH: 192, frames: 6, label: 'Guard' },
    ]
  },
  {
    name: '🏇 Lancer (枪骑兵)',
    color: 0x4ad98f,
    folder: 'Lancer',
    sprites: [
      { file: 'Lancer_Idle', frameW: 320, frameH: 320, frames: 12, label: 'Idle' },
      { file: 'Lancer_Run', frameW: 320, frameH: 320, frames: 6, label: 'Run' },
      { file: 'Lancer_Right_Attack', frameW: 320, frameH: 320, frames: 3, label: 'Attack→' },
      { file: 'Lancer_Right_Defence', frameW: 320, frameH: 320, frames: 6, label: 'Defence→' },
      { file: 'Lancer_Up_Attack', frameW: 320, frameH: 320, frames: 3, label: 'Attack↑' },
      { file: 'Lancer_Down_Attack', frameW: 320, frameH: 320, frames: 3, label: 'Attack↓' },
    ]
  },
  {
    name: '🧙 Monk (僧侣)',
    color: 0xd9d94a,
    folder: 'Monk',
    sprites: [
      { file: 'Idle', frameW: 192, frameH: 192, frames: 6, label: 'Idle' },
      { file: 'Run', frameW: 192, frameH: 192, frames: 4, label: 'Run' },
      { file: 'Heal', frameW: 192, frameH: 192, frames: 11, label: 'Heal' },
      { file: 'Heal_Effect', frameW: 192, frameH: 192, frames: 11, label: 'Heal FX' },
    ]
  },
  {
    name: '🔨 Pawn (士兵/工人)',
    color: 0xd9904a,
    folder: 'Pawn',
    sprites: [
      { file: 'Pawn_Idle', frameW: 192, frameH: 192, frames: 8, label: 'Idle' },
      { file: 'Pawn_Run', frameW: 192, frameH: 192, frames: 6, label: 'Run' },
      { file: 'Pawn_Idle_Axe', frameW: 192, frameH: 192, frames: 8, label: 'Idle🪓' },
      { file: 'Pawn_Run_Axe', frameW: 192, frameH: 192, frames: 6, label: 'Run🪓' },
      { file: 'Pawn_Idle_Hammer', frameW: 192, frameH: 192, frames: 8, label: 'Idle🔨' },
      { file: 'Pawn_Run_Hammer', frameW: 192, frameH: 192, frames: 6, label: 'Run🔨' },
      { file: 'Pawn_Idle_Pickaxe', frameW: 192, frameH: 192, frames: 8, label: 'Idle⛏️' },
      { file: 'Pawn_Run_Pickaxe', frameW: 192, frameH: 192, frames: 6, label: 'Run⛏️' },
      { file: 'Pawn_Idle_Gold', frameW: 192, frameH: 192, frames: 8, label: 'Idle💰' },
      { file: 'Pawn_Run_Gold', frameW: 192, frameH: 192, frames: 6, label: 'Run💰' },
      { file: 'Pawn_Idle_Wood', frameW: 192, frameH: 192, frames: 8, label: 'Idle🪵' },
      { file: 'Pawn_Run_Wood', frameW: 192, frameH: 192, frames: 6, label: 'Run🪵' },
    ]
  },
]

// 其他素材配置 (怪物、建筑、动物)
const SPRITE_CONFIG = {
  // 怪物
  monster_warrior: {
    name: '👹 Monster Warrior',
    color: 0xff6666,
    folder: 'units',
    sprites: [
      { file: 'monster_warrior', frameW: 192, frameH: 192, frames: 4, label: 'Idle' },
      { file: 'monster_warrior_run', frameW: 192, frameH: 192, frames: 4, label: 'Run' },
    ]
  },
  monster_archer: {
    name: '👺 Monster Archer',
    color: 0xff9966,
    folder: 'units',
    sprites: [
      { file: 'monster_archer', frameW: 192, frameH: 192, frames: 4, label: 'Idle' },
      { file: 'monster_archer_run', frameW: 192, frameH: 192, frames: 4, label: 'Run' },
    ]
  },
  monster_boss: {
    name: '👿 Monster Boss',
    color: 0xcc4444,
    folder: 'units',
    sprites: [
      { file: 'monster_boss', frameW: 192, frameH: 192, frames: 4, label: 'Idle' },
      { file: 'monster_boss_run', frameW: 192, frameH: 192, frames: 4, label: 'Run' },
    ]
  },
  // 建筑
  barracks: {
    name: '🏠 Barracks (兵营)',
    color: 0x6699aa,
    folder: 'buildings',
    sprites: [
      { file: 'barracks', frameW: 192, frameH: 256, frames: 1, label: 'Static' },
    ]
  },
  castle: {
    name: '🏰 Castle (城堡)',
    color: 0x5588bb,
    folder: 'buildings',
    sprites: [
      { file: 'castle', frameW: 320, frameH: 256, frames: 1, label: 'Static' },
    ]
  },
  castle_yellow: {
    name: '🏯 Castle Yellow',
    color: 0xaaaa55,
    folder: 'buildings',
    sprites: [
      { file: 'castle_yellow', frameW: 320, frameH: 256, frames: 1, label: 'Static' },
    ]
  },
  // 动物/资源
  gold: {
    name: '💰 Gold (金矿)',
    color: 0xffd700,
    folder: 'terrain',
    sprites: [
      { file: 'gold', frameW: 128, frameH: 128, frames: 1, label: 'Static' },
    ]
  },
  sheep: {
    name: '🐑 Sheep (绵羊)',
    color: 0xaaddff,
    folder: 'terrain',
    sprites: [
      { file: 'sheep_idle', frameW: 128, frameH: 128, frames: 6, label: 'Idle' },
      { file: 'sheep_move', frameW: 128, frameH: 128, frames: 4, label: 'Move' },
    ]
  },
}

// 分类配置
type SpriteConfigKey = keyof typeof SPRITE_CONFIG

const categoryUnits: Record<SpriteCategory, SpriteConfigKey[]> = {
  units: [], // 使用 BLACK_UNITS_CONFIG
  monsters: ['monster_warrior', 'monster_archer', 'monster_boss'],
  buildings: ['barracks', 'castle', 'castle_yellow'],
  animals: ['gold', 'sheep'],
}

const currentUnitKeys = computed(() => categoryUnits[activeTab.value] || [])

function switchTab(key: SpriteCategory) {
  activeTab.value = key
  loadScene()
}

onMounted(async () => {
  await nextTick()
  if (!canvasContainer.value || !canvasArea.value) return

  const width = canvasArea.value.clientWidth || 1200

  app = new PIXI.Application({
    width,
    height: 600,
    backgroundColor: 0x1a1a2e,
  })

  canvasContainer.value.appendChild(app.view as HTMLCanvasElement)

  await loadScene()
})

async function loadScene() {
  if (!app || !canvasArea.value) return

  // 清除现有内容
  app.stage.removeChildren()
  animatedSprites = []

  const screenW = canvasArea.value.clientWidth || 1200

  // 战斗单位使用 Black Units 配置
  if (activeTab.value === 'units') {
    await loadBlackUnits(screenW)
    return
  }

  // 其他类别使用原有配置
  const units = currentUnitKeys.value.map(key => ({
    key,
    ...SPRITE_CONFIG[key]
  }))

  const rowHeight = 150
  const startY = 20

  // 调整画布高度
  const totalHeight = units.length * rowHeight + 50
  app.renderer.resize(screenW, totalHeight)

  // 绘制背景
  const bg = new PIXI.Graphics()
  bg.beginFill(0x1a1a2e)
  bg.drawRect(0, 0, screenW, totalHeight)
  bg.endFill()
  app.stage.addChild(bg)

  for (let i = 0; i < units.length; i++) {
    const unit = units[i]
    const rowY = startY + i * rowHeight

    // 绘制行背景
    const rowBg = new PIXI.Graphics()
    rowBg.beginFill(unit.color, 0.1)
    rowBg.drawRect(0, rowY - 5, screenW, rowHeight - 15)
    rowBg.endFill()

    // 左侧边框
    rowBg.lineStyle(4, unit.color, 0.8)
    rowBg.moveTo(0, rowY - 5)
    rowBg.lineTo(0, rowY + rowHeight - 25)
    app.stage.addChild(rowBg)

    // 单位名称
    const nameLabel = new PIXI.Text(unit.name, {
      fontFamily: 'Arial',
      fontSize: 14,
      fill: unit.color,
      fontWeight: 'bold',
    })
    nameLabel.x = 15
    nameLabel.y = rowY + 45
    app.stage.addChild(nameLabel)

    // 加载该单位的所有精灵
    const sprites = unit.sprites
    const startX = 200
    const spacing = Math.min(120, (screenW - startX - 20) / Math.max(sprites.length, 1))

    for (let j = 0; j < sprites.length; j++) {
      const spriteConfig = sprites[j]
      const x = startX + j * spacing + spacing / 2
      const y = rowY + rowHeight / 2 + 20

      await loadSprite(unit, spriteConfig, x, y, false)
    }
  }

  console.log(`Loaded ${animatedSprites.length} animated sprites for ${activeTab.value}`)
}

// 加载 Black Units 战斗单位
async function loadBlackUnits(screenW: number) {
  if (!app) return

  const rowHeight = 200
  const startY = 30

  // 调整画布高度
  const totalHeight = BLACK_UNITS_CONFIG.length * rowHeight + 100
  app.renderer.resize(screenW, Math.max(totalHeight, 600))

  // 绘制背景
  const bg = new PIXI.Graphics()
  bg.beginFill(0x1a1a2e)
  bg.drawRect(0, 0, screenW, app.screen.height)
  bg.endFill()
  app.stage.addChild(bg)

  for (let i = 0; i < BLACK_UNITS_CONFIG.length; i++) {
    const unit = BLACK_UNITS_CONFIG[i]
    const rowY = startY + i * rowHeight

    // 绘制行背景
    const rowBg = new PIXI.Graphics()
    rowBg.beginFill(unit.color, 0.1)
    rowBg.drawRect(0, rowY - 10, screenW, rowHeight - 20)
    rowBg.endFill()

    // 左侧边框
    rowBg.lineStyle(4, unit.color, 0.8)
    rowBg.moveTo(0, rowY - 10)
    rowBg.lineTo(0, rowY + rowHeight - 30)
    app.stage.addChild(rowBg)

    // 单位名称
    const nameLabel = new PIXI.Text(unit.name, {
      fontFamily: 'Arial',
      fontSize: 14,
      fill: unit.color,
      fontWeight: 'bold',
    })
    nameLabel.x = 15
    nameLabel.y = rowY + 60
    app.stage.addChild(nameLabel)

    // 加载该单位的所有精灵
    const sprites = unit.sprites
    const spriteWidth = 100
    const startX = 180
    const availableWidth = screenW - startX - 20
    const spacing = Math.min(spriteWidth, availableWidth / Math.max(sprites.length, 1))

    for (let j = 0; j < sprites.length; j++) {
      const spriteConfig = sprites[j]
      const x = startX + j * spacing + spacing / 2
      const y = rowY + rowHeight / 2

      await loadSprite(unit, spriteConfig, x, y, true)
    }
  }

  console.log(`Loaded ${animatedSprites.length} Black Units animated sprites`)
}

async function loadSprite(
  unitConfig: { key?: string; name: string; color: number; folder: string },
  spriteConfig: { file: string; frameW: number; frameH: number; frames: number; label: string },
  x: number,
  y: number,
  isBlackUnit: boolean = false
) {
  if (!app) return

  // Black Units 使用单独的目录结构
  const texturePath = isBlackUnit
    ? `/assets/sprites/black-units/${unitConfig.folder}/${spriteConfig.file}.png`
    : `/assets/sprites/${unitConfig.folder}/${spriteConfig.file}.png`

  try {
    const texture = await PIXI.Assets.load(texturePath)

    const container = new PIXI.Container()
    container.x = x
    container.y = y
    container.eventMode = 'static'
    container.cursor = 'pointer'

    if (spriteConfig.frames > 1) {
      // 动画精灵
      const frameTextures: PIXI.Texture[] = []
      for (let i = 0; i < spriteConfig.frames; i++) {
        const rect = new PIXI.Rectangle(i * spriteConfig.frameW, 0, spriteConfig.frameW, spriteConfig.frameH)
        const frameTex = new PIXI.Texture(texture.baseTexture, rect)
        frameTextures.push(frameTex)
      }

      const animSprite = new PIXI.AnimatedSprite(frameTextures)
      animSprite.animationSpeed = animationSpeed.value

      // 计算缩放
      const maxH = isBlackUnit ? 80 : 80
      const spriteScale = scale.value * Math.min(maxH / spriteConfig.frameH, maxH / spriteConfig.frameW)
      animSprite.scale.set(spriteScale)
      animSprite.anchor.set(0.5, 0.5)
      animSprite.play()

      animatedSprites.push(animSprite)
      container.addChild(animSprite)

      // 点击暂停/恢复
      container.on('pointerdown', () => {
        if (animSprite.playing) {
          animSprite.stop()
        } else {
          animSprite.play()
        }
      })
    } else {
      // 静态精灵
      const sprite = new PIXI.Sprite(texture)
      const maxH = isBlackUnit ? 40 : 70
      const spriteScale = scale.value * Math.min(maxH / spriteConfig.frameH, maxH / spriteConfig.frameW)
      sprite.scale.set(spriteScale)
      sprite.anchor.set(0.5, 0.5)
      container.addChild(sprite)
    }

    // 标签
    const label = new PIXI.Text(spriteConfig.label, {
      fontFamily: 'Arial',
      fontSize: isBlackUnit ? 9 : 10,
      fill: 0xaaaaaa,
      fontWeight: 'bold',
    })
    label.anchor.set(0.5, 0)
    label.y = 50
    container.addChild(label)

    app.stage.addChild(container)

  } catch (error) {
    console.error(`Failed to load ${texturePath}:`, error)
  }
}

watch(animationSpeed, (newSpeed) => {
  animatedSprites.forEach(sprite => {
    sprite.animationSpeed = newSpeed
  })
})

watch(scale, async () => {
  await loadScene()
})

onUnmounted(() => {
  if (app) {
    app.destroy(true)
    app = null
  }
  animatedSprites = []
})
</script>

<style scoped>
.sprite-demo-view {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0a0a0f;
  color: #e0e0e0;
  font-family: 'Segoe UI', Arial, sans-serif;
}

.header {
  padding: 12px 20px;
  background: rgba(26, 26, 46, 0.95);
  border-bottom: 2px solid #00ff88;
  display: flex;
  align-items: center;
  gap: 20px;
}

.header h2 {
  color: #00ff88;
  margin: 0;
  font-size: 16px;
}

.tabs {
  display: flex;
  gap: 8px;
}

.tab-btn {
  padding: 6px 14px;
  background: rgba(0, 255, 136, 0.1);
  border: 1px solid rgba(0, 255, 136, 0.3);
  border-radius: 16px;
  color: #00aaff;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 12px;
}

.tab-btn:hover {
  background: rgba(0, 255, 136, 0.2);
  border-color: #00ff88;
}

.tab-btn.active {
  background: rgba(0, 255, 136, 0.3);
  border-color: #00ff88;
  color: #00ff88;
  font-weight: bold;
}

.controls {
  display: flex;
  gap: 15px;
  margin-left: auto;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.control-group label {
  color: #00aaff;
  font-size: 11px;
}

.control-group input[type="range"] {
  width: 80px;
  accent-color: #00ff88;
}

.control-group span {
  color: #ffaa00;
  font-size: 10px;
  min-width: 30px;
}

.canvas-area {
  flex: 1;
  overflow: auto;
  background: #1a1a2e;
}

.canvas-container {
  min-height: 100%;
}

.legend {
  padding: 8px 20px;
  background: rgba(26, 26, 46, 0.9);
  border-top: 1px solid rgba(0, 255, 136, 0.3);
  display: flex;
  gap: 30px;
  font-size: 11px;
  color: #888;
}
</style>
