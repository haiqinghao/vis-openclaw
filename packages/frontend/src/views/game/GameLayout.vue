<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

// 子菜单项
const subMenuItems = [
  { path: '/game/map-editor', icon: '🗺️', label: '地图编辑器' },
  { path: '/game/preview', icon: '👁️', label: '预览' },
  { path: '/game/units', icon: '🏹', label: '单位演示' },
  { path: '/game/environment', icon: '🌍', label: '环境元素' }
]

const activeSubMenu = computed(() => route.path)

function handleSubMenuSelect(path: string) {
  router.push(path)
}
</script>

<template>
  <div class="game-layout">
    <!-- 子导航栏 -->
    <nav class="game-nav">
      <div class="nav-title">
        <span class="icon">🎮</span>
        <span>游戏界面编辑</span>
      </div>
      <div class="nav-items">
        <button
          v-for="item in subMenuItems"
          :key="item.path"
          :class="{ active: activeSubMenu === item.path }"
          @click="handleSubMenuSelect(item.path)"
        >
          <span class="icon">{{ item.icon }}</span>
          <span class="label">{{ item.label }}</span>
        </button>
      </div>
    </nav>

    <!-- 主内容区 -->
    <main class="game-content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.game-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg-primary);
}

.game-nav {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.nav-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--accent-blue-light);
  font-size: 16px;
  font-weight: 600;
  padding-right: 20px;
  border-right: 1px solid var(--border-color);
}

.nav-items {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.nav-items button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
  font-size: 13px;
}

.nav-items button:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
  border-color: var(--accent-blue);
}

.nav-items button.active {
  background: var(--accent-blue);
  color: var(--text-primary);
  border-color: var(--accent-blue);
  box-shadow: 0 0 8px rgba(64, 158, 255, 0.3);
}

.nav-items button .icon {
  font-size: 14px;
}

.game-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
</style>
