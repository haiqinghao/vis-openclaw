<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()

// 侧边栏折叠状态
const isCollapsed = ref(true)  // 默认折叠

const menuItems = [
  { path: '/dashboard', icon: 'DataAnalysis', label: '监测面板' },
  { path: '/agents', icon: 'User', label: 'Agent 管理' },
  { path: '/sessions', icon: 'ChatLineRound', label: '会话管理' },
  { path: '/commands', icon: 'Document', label: '命令配置' },
  { path: '/game-display', icon: 'Monitor', label: '游戏界面' },
  { path: '/game', icon: 'Picture', label: '游戏界面编辑' }
]

const activeMenu = computed(() => route.path)

function handleMenuSelect(path: string) {
  router.push(path)
}

function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="app-layout">
    <!-- 侧边栏 -->
    <aside class="sidebar" :class="{ collapsed: isCollapsed }">
      <div class="sidebar-header">
        <div class="logo">
          <img src="/logo.png" class="logo-img" alt="VIS OpenClaw" />
          <span v-if="!isCollapsed" class="logo-text">VIS OpenClaw</span>
        </div>
        <div class="toggle-btn" @click="toggleSidebar">
          <el-icon :size="16">
            <component :is="isCollapsed ? 'ArrowRight' : 'ArrowLeft'" />
          </el-icon>
        </div>
      </div>

      <el-menu
        :default-active="activeMenu"
        class="sidebar-menu"
        :collapse="isCollapsed"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
        @select="handleMenuSelect"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <template #title>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>

      <div class="sidebar-footer">
        <div class="connection-status">
          <span :class="['status-dot', appStore.isConnected ? 'online' : 'offline']"></span>
          <span v-if="!isCollapsed">{{ appStore.isConnected ? '已连接' : '未连接' }}</span>
        </div>
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--bg-primary);
}

.sidebar {
  width: 200px;
  background-color: var(--bg-primary);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.3s ease;
  border-right: 1px solid var(--border-color);
}

.sidebar.collapsed {
  width: 64px;
}

.sidebar-header {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-color);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  overflow: hidden;
}

.logo .logo-img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  flex-shrink: 0;
}

.logo-text {
  white-space: nowrap;
  background: linear-gradient(135deg, var(--accent-blue-light), var(--accent-purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.toggle-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.2s;
  flex-shrink: 0;
}

.toggle-btn:hover {
  background-color: var(--bg-card-hover);
  color: var(--accent-blue-light);
}

.sidebar-menu {
  flex: 1;
  border-right: none !important;
}

.sidebar-menu:not(.el-menu--collapse) {
  width: 200px;
}

.sidebar-footer {
  padding: 12px;
  border-top: 1px solid var(--border-color);
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 12px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.online {
  background-color: var(--accent-green);
  box-shadow: 0 0 8px var(--accent-green);
}

.status-dot.offline {
  background-color: var(--status-idle);
}

.main-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: var(--bg-primary);
}
</style>