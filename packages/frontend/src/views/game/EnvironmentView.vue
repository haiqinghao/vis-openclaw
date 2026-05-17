<template>
  <div class="environment-view">
    <div ref="canvasContainer" class="canvas-container"></div>

    <div class="controls">
      <h3>🌍 环境元素演示</h3>
      <div class="control-group">
        <label>动画速度:</label>
        <input type="range" v-model="animationSpeed" min="0.05" max="0.5" step="0.05" />
        <span>{{ animationSpeed }}</span>
      </div>
      <div class="control-group">
        <label>缩放:</label>
        <input type="range" v-model="scale" min="0.5" max="2" step="0.1" />
        <span>{{ scale }}x</span>
      </div>
      <div class="info" v-if="selectedElement">
        <h4>{{ selectedElement.name }}</h4>
        <p>文件: {{ selectedElement.file }}.png</p>
        <p>尺寸: {{ selectedElement.frameW }}x{{ selectedElement.frameH }}</p>
        <p>帧数: {{ selectedElement.frames }}</p>
        <p>类型: {{ selectedElement.type }}</p>
      </div>
      <div class="legend">
        <span class="legend-item">🌲 树木</span>
        <span class="legend-item">🪨 石头</span>
        <span class="legend-item">🌿 灌木</span>
        <span class="legend-item">💧 水域</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as PIXI from 'pixi.js'

const canvasContainer = ref<HTMLElement>()
const animationSpeed = ref(0.12)
const scale = ref(1.0)
const selectedElement = ref<any>(null)

let app: PIXI.Application | null = null
let animatedSprites: PIXI.AnimatedSprite[] = []
let allSprites: (PIXI.AnimatedSprite | PIXI.Sprite)[] = []
let elementLabels: PIXI.Text[] = []

// 环境元素配置 - 按类别分组
const elementConfigs = {
  trees: [
    { name: 'Tree 1', file: 'tree1', frameW: 192, frameH: 256, frames: 8, type: '树木' },
    { name: 'Tree 2', file: 'tree2', frameW: 192, frameH: 256, frames: 8, type: '树木' },
    { name: 'Tree 3', file: 'tree3', frameW: 192, frameH: 192, frames: 8, type: '树木' },
    { name: 'Tree 4', file: 'tree4', frameW: 192, frameH: 192, frames: 8, type: '树木' },
  ],
  rocks: [
    { name: 'Rock', file: 'rock', frameW: 64, frameH: 64, frames: 1, type: '石头' },
    { name: 'Rock 1', file: 'rock1', frameW: 64, frameH: 64, frames: 1, type: '石头' },
    { name: 'Rock 2', file: 'rock2', frameW: 64, frameH: 64, frames: 1, type: '石头' },
  ],
  bushes: [
    { name: 'Bush', file: 'bush', frameW: 128, frameH: 128, frames: 8, type: '灌木' },
    { name: 'Bush 2', file: 'bush2', frameW: 128, frameH: 128, frames: 8, type: '灌木' },
  ],
  water: [
    { name: 'Water', file: 'water', frameW: 64, frameH: 64, frames: 1, type: '水域' },
    { name: 'Water Rock', file: 'water_rock', frameW: 64, frameH: 64, frames: 16, type: '水域' },
  ],
}



onMounted(async () => {
  if (!canvasContainer.value) return

  await nextTick()

  const width = canvasContainer.value.clientWidth || 1200
  const height = canvasContainer.value.clientHeight || 600

  app = new PIXI.Application({
    width,
    height,
    backgroundColor: 0x1a1a2e,
  })

  canvasContainer.value.appendChild(app.view as HTMLCanvasElement)

  await loadElements()
})

async function loadElements() {
  if (!app) return

  const screenW = app.screen.width
  const screenH = app.screen.height

  // 绘制分类背景区域
  const categories = Object.keys(elementConfigs)
  const categoryHeight = screenH / categories.length

  categories.forEach((category, index) => {
    const bg = new PIXI.Graphics()
    const color = getCategoryColor(category)
    bg.beginFill(color, 0.1)
    bg.drawRect(0, index * categoryHeight, screenW, categoryHeight)
    bg.endFill()

    // 分类标签
    const categoryLabel = new PIXI.Text(getCategoryLabel(category), {
      fontFamily: 'Arial',
      fontSize: 16,
      fill: color,
      fontWeight: 'bold',
    })
    categoryLabel.x = 10
    categoryLabel.y = index * categoryHeight + 5
    app!.stage.addChild(categoryLabel)
    app!.stage.addChild(bg)
  })

  // 绘制地面线
  const ground = new PIXI.Graphics()
  ground.lineStyle(2, 0x00ff88, 0.5)
  for (let index = 0; index < categories.length; index++) {
    const y = (index + 1) * categoryHeight
    ground.moveTo(0, y)
    ground.lineTo(screenW, y)
  }
  app.stage.addChild(ground)

  // 加载各分类元素
  let categoryIndex = 0
  for (const [, elements] of Object.entries(elementConfigs)) {
    const baseY = categoryIndex * categoryHeight + categoryHeight - 40
    const spacing = screenW / (elements.length + 1)

    for (let i = 0; i < elements.length; i++) {
      const config = elements[i]
      const x = spacing * (i + 1)

      try {
        await loadElement(config, x, baseY)
      } catch (error) {
        console.error(`Error loading ${config.name}:`, error)
      }
    }

    categoryIndex++
  }

  console.log('All elements loaded, total sprites:', allSprites.length)
}

async function loadElement(config: any, x: number, y: number) {
  if (!app) return

  const texturePath = `/assets/sprites/terrain/${config.file}.png`
  console.log(`Loading ${config.name} from ${texturePath}`)

  const texture = await PIXI.Assets.load(texturePath)

  let sprite: PIXI.AnimatedSprite | PIXI.Sprite
  let displayH = config.frameH

  if (config.frames > 1) {
    // 动画精灵
    const frames: PIXI.Texture[] = []
    for (let f = 0; f < config.frames; f++) {
      const rect = new PIXI.Rectangle(f * config.frameW, 0, config.frameW, config.frameH)
      const frame = new PIXI.Texture(texture.baseTexture, rect)
      frames.push(frame)
    }

    const animSprite = new PIXI.AnimatedSprite(frames)
    animSprite.animationSpeed = animationSpeed.value
    animSprite.scale.set(scale.value)
    animSprite.anchor.set(0.5, 1)
    animSprite.x = x
    animSprite.y = y
    animSprite.play()
    animatedSprites.push(animSprite)
    sprite = animSprite
  } else {
    // 静态精灵
    sprite = new PIXI.Sprite(texture)
    sprite.scale.set(scale.value)
    sprite.anchor.set(0.5, 1)
    sprite.x = x
    sprite.y = y
  }

  allSprites.push(sprite)
  app.stage.addChild(sprite)

  // 添加阴影（仅对大元素）
  if (config.frameW > 64 || config.frameH > 64) {
    const shadow = new PIXI.Graphics()
    shadow.beginFill(0x000000, 0.2)
    shadow.drawEllipse(0, 0, config.frameW * scale.value / 4, config.frameH * scale.value / 8)
    shadow.endFill()
    shadow.x = x
    shadow.y = y
    app.stage.addChild(shadow)
  }

  // 添加名称标签
  const label = new PIXI.Text(config.name, {
    fontFamily: 'Arial',
    fontSize: 11,
    fill: 0xffffff,
    fontWeight: 'bold',
    stroke: 0x000000,
    strokeThickness: 2,
  })
  label.anchor.set(0.5)
  label.x = x
  label.y = y - displayH * scale.value - 10
  label.eventMode = 'static'
  label.cursor = 'pointer'
  label.on('pointerover', () => {
    selectedElement.value = config
    label.style.fill = 0x00ff88
  })
  label.on('pointerout', () => {
    label.style.fill = 0xffffff
  })

  app.stage.addChild(label)
  elementLabels.push(label)

  console.log(`${config.name} loaded successfully`)
}

function getCategoryColor(category: string): number {
  const colors: Record<string, number> = {
    trees: 0x228b22,
    rocks: 0x808080,
    bushes: 0x32cd32,
    water: 0x4169e1,
  }
  return colors[category] || 0xffffff
}

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    trees: '🌲 树木',
    rocks: '🪨 石头',
    bushes: '🌿 灌木',
    water: '💧 水域',
  }
  return labels[category] || category
}

watch(animationSpeed, (newSpeed) => {
  animatedSprites.forEach(sprite => {
    sprite.animationSpeed = newSpeed
  })
})

watch(scale, (newScale) => {
  allSprites.forEach(sprite => {
    sprite.scale.set(newScale)
  })
})

onUnmounted(() => {
  if (app) {
    app.destroy(true)
    app = null
  }
  animatedSprites = []
  allSprites = []
  elementLabels = []
})
</script>

<style scoped>
.environment-view {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #0a0a0f;
}

.canvas-container {
  flex: 1;
  min-height: 500px;
}

.controls {
  padding: 15px 20px;
  background: rgba(26, 26, 46, 0.95);
  border-top: 2px solid #00ff88;
  font-family: 'Courier New', monospace;
}

.controls h3 {
  color: #00ff88;
  margin-bottom: 12px;
  font-size: 14px;
}

.control-group {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 10px;
}

.control-group label {
  color: #00aaff;
  font-size: 12px;
}

.control-group input[type="range"] {
  width: 180px;
  accent-color: #00ff88;
}

.control-group span {
  color: #ffaa00;
  font-size: 12px;
  min-width: 40px;
}

.info {
  margin-top: 10px;
  padding: 10px;
  background: rgba(0, 255, 136, 0.1);
  border: 1px solid #00ff88;
  border-radius: 4px;
}

.info h4 {
  color: #00ff88;
  margin: 0 0 8px 0;
  font-size: 13px;
}

.info p {
  color: #00ff88;
  font-size: 11px;
  margin: 3px 0;
}

.legend {
  margin-top: 10px;
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
}

.legend-item {
  font-size: 11px;
  color: #aaa;
}
</style>
