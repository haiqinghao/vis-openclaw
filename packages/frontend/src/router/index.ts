import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { title: '监测面板' }
  },
  {
    path: '/agents',
    name: 'Agents',
    component: () => import('@/views/AgentsView.vue'),
    meta: { title: 'Agent 管理' }
  },
  {
    path: '/sessions',
    name: 'Sessions',
    component: () => import('@/views/SessionsView.vue'),
    meta: { title: '会话管理' }
  },
  {
    path: '/sessions/:id',
    name: 'SessionDetail',
    component: () => import('@/views/SessionDetailView.vue'),
    meta: { title: '会话详情' }
  },
  {
    path: '/commands',
    name: 'Commands',
    component: () => import('@/views/CommandsView.vue'),
    meta: { title: '命令配置' }
  },
  // 游戏界面展示
  {
    path: '/game-display',
    name: 'GameDisplay',
    component: () => import('@/views/GameView.vue'),
    meta: { title: '游戏界面' }
  },
  // 游戏编辑模块路由
  {
    path: '/game',
    name: 'Game',
    component: () => import('@/views/game/GameLayout.vue'),
    redirect: '/game/preview',
    meta: { title: '游戏界面编辑' },
    children: [
      {
        path: 'map-editor',
        name: 'GameMapEditor',
        component: () => import('@/views/game/MapEditorView.vue'),
        meta: { title: '地图编辑器' }
      },
      {
        path: 'preview',
        name: 'GamePreview',
        component: () => import('@/views/game/PreviewView.vue'),
        meta: { title: '预览' }
      },
      {
        path: 'units',
        name: 'GameUnits',
        component: () => import('@/views/game/SpriteDemoView.vue'),
        meta: { title: '单位演示' }
      },
      {
        path: 'environment',
        name: 'GameEnvironment',
        component: () => import('@/views/game/EnvironmentView.vue'),
        meta: { title: '环境元素' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const title = to.meta.title as string
  if (title) {
    document.title = `${title} - 可视化龙虾`
  }
  next()
})

export default router