# 开发指南

本文档面向希望基于 VIS OpenClaw 进行二次开发的开发者。

## 开发环境搭建

### 前置要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- VS Code (推荐)
- OpenClaw CLI

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 或分别启动前后端
cd packages/backend && npm run dev
cd packages/frontend && npm run dev
```

### 生产构建

```bash
npm run build
```

## 架构设计

### 整体架构

```
┌─────────────┐     HTTP/WS      ┌─────────────┐
│   Frontend  │ ◄──────────────► │   Backend   │
│   (Vue 3)   │                  │  (Express)  │
└─────────────┘                  └──────┬──────┘
                                        │
                                        │ CLI
                                        ▼
                                 ┌─────────────┐
                                 │  OpenClaw   │
                                 │    CLI      │
                                 └─────────────┘
```

### 数据流

1. 前端通过 HTTP API 与后端通信
2. 后端通过 CLI 与 OpenClaw Gateway 交互
3. WebSocket 用于实时状态推送

## 前端开发

### 目录结构

```
packages/frontend/src/
├── components/        # 可复用组件
│   └── layout/
│       └── AppLayout.vue   # 主布局
├── views/             # 页面视图
│   ├── DashboardView.vue   # 监测面板
│   ├── AgentsView.vue      # Agent 管理
│   ├── SessionsView.vue    # 会话管理
│   ├── CommandsView.vue    # 命令配置
│   ├── GameView.vue        # 游戏界面
│   └── game/               # 游戏界面编辑、地图预览、素材演示
│       ├── GameLayout.vue
│       ├── MapEditorView.vue
│       ├── PreviewView.vue
│       ├── SpriteDemoView.vue
│       └── EnvironmentView.vue
├── stores/            # Pinia 状态管理
│   ├── agent.ts       # Agent 状态
│   ├── session.ts     # Session 状态
│   ├── task.ts        # Task 状态
│   ├── game.ts        # 游戏界面地图状态
│   └── app.ts         # 应用状态
├── router/            # 路由配置
├── config/            # Agent 形象和动画配置
├── types/             # 共享类型定义
└── styles/            # 全局样式
    ├── game/
    ├── main.css
    └── palantir-theme.css
```

### 状态管理

使用 Pinia 进行状态管理：

```typescript
// stores/agent.ts
export const useAgentStore = defineStore('agent', {
  state: () => ({
    agents: [],
    loading: false
  }),
  actions: {
    async fetchAgents() {
      this.loading = true
      const response = await axios.get('/api/agents')
      this.agents = response.data
      this.loading = false
    }
  }
})
```

### API 调用

使用 Axios 进行 HTTP 请求：

```typescript
import axios from 'axios'

// 获取 Agent 列表
const response = await axios.get('/api/agents')

// 创建任务
await axios.post('/api/tasks', { name, description, agents })
```

### WebSocket

实时状态更新通过 Socket.io：

```typescript
import { io } from 'socket.io-client'

const socket = io('http://localhost:4000')

socket.on('stats:update', (data) => {
  // 处理统计更新
})
```

## 后端开发

### 目录结构

```
packages/backend/src/
├── routes/            # API 路由
│   ├── agent.ts       # Agent API
│   ├── session.ts     # Session API
│   ├── task.ts        # Task API
│   ├── maps.ts        # 地图 API
│   ├── gateway.ts     # Gateway API
│   └── dashboard.ts   # Dashboard API
├── services/          # 业务服务
│   ├── database.ts    # 数据库服务
│   ├── websocket.ts   # WebSocket 服务
│   ├── openclaw-cli.ts # OpenClaw CLI 封装
│   ├── config.ts      # 配置服务
│   ├── cron.ts        # 定时任务服务
│   ├── agent-status.ts  # Agent 状态事件桥与本地缓存
│   ├── realtime-channels.ts  # 实时通道聚合
│   ├── openclaw-gateway-rpc.ts  # OpenClaw Gateway RPC 客户端
│   ├── task-dispatch.ts  # 任务分发服务
│   └── task-state.ts  # 任务状态机
└── index.ts           # 入口
```

### 添加新 API

```typescript
// routes/custom.ts
import { Router } from 'express'

export const customRouter = Router()

customRouter.get('/', async (req, res) => {
  try {
    // 业务逻辑
    res.json({ data: 'success' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

### OpenClaw CLI 封装

```typescript
// services/openclaw-cli.ts
import { exec } from 'child_process'

async function callOpenClawCli(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`openclaw ${command}`, (error, stdout, stderr) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

export async function agents_list() {
  const output = await callOpenClawCli('agents')
  // 解析输出...
}
```

## API 文档

### REST API

#### Agent API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/agents` | GET | 获取 Agent 列表 |
| `/api/agents` | POST | 创建 Agent |
| `/api/agents/:id` | PUT | 更新 Agent |
| `/api/agents/:id` | DELETE | 删除 Agent |
| `/api/agents/:id/files` | GET | 获取 Agent 文件 |
| `/api/agents/:id/files/:name` | GET/PUT | 读取/保存文件 |
| `/api/agents/:id/start-session` | POST | 启动会话 |
| `/api/agents/models` | GET | 获取可用模型 |

#### Session API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/sessions` | GET | 获取会话列表 |
| `/api/sessions/:id` | GET | 获取会话详情 |
| `/api/sessions/:id/messages` | GET | 获取消息列表 |
| `/api/sessions/:id/send` | POST | 发送消息 |

#### Task API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/tasks` | GET | 获取任务列表 |
| `/api/tasks` | POST | 创建任务 |
| `/api/tasks/:id` | PUT | 更新任务可编辑字段 |
| `/api/tasks/:id` | DELETE | 删除任务 |
| `/api/tasks/:id/start` | POST | 分发任务 |
| `/api/tasks/:id/pause` | POST | 暂停未分发任务 |
| `/api/tasks/:id/schedule` | PUT | 设置定时配置 |
| `/api/tasks/:id/schedule` | DELETE | 取消定时配置 |
| `/api/tasks/:id/trigger` | POST | 手动触发定时任务 |

#### 任务状态机

任务状态由 `packages/backend/src/services/task-state.ts` 统一定义，分发后的运行态由任务分发服务和 OpenClaw 会话状态桥推进。

| 状态 | 含义 | 可执行操作 |
|------|------|------------|
| `pending` | 新建任务，等待分发 | 编辑、定时、暂停、分发 |
| `paused` | 尚未分发的暂停任务 | 编辑、定时、分发 |
| `scheduled` | 已设置定时配置 | 编辑、取消定时、分发 |
| `dispatching` | 已接受分发，正在写入 Agent 会话 | 等待会话桥更新 |
| `distributed` | 已发送到 Agent 会话 | 等待会话桥更新 |
| `running` | Agent 会话处理中 | 等待会话桥更新 |
| `completed` | 关联会话完成本轮处理 | 查看结果 |
| `failed` | 分发或会话处理失败 | 编辑、定时、重新分发 |
| `stale` | 会话状态暂时不可确认 | 等待恢复、重新分发 |

`status`、`sessionIds`、`dispatchMode`、`dispatchErrors`、`dispatchedAt`、`scheduledConfig` 属于运行态受控字段，普通更新接口不能直接覆盖。任务进入 `dispatching`、`distributed` 或 `running` 后不再支持暂停，避免前端状态和 OpenClaw 会话真实状态分叉。

#### Maps API

地图数据由后端 LowDB 保存，同时前端保留 localStorage 兜底。前端地图编辑器、预览页和游戏界面共享同一套 `MapData` 结构。

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/maps` | GET | 获取地图摘要列表 |
| `/api/maps` | POST | 创建或保存地图 |
| `/api/maps/:id` | GET | 获取单个地图完整数据 |
| `/api/maps/:id` | DELETE | 删除地图 |

#### Gateway API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/gateway/status` | GET | 获取 Gateway 状态 |
| `/api/gateway/start` | POST | 启动 Gateway |
| `/api/gateway/restart` | POST | 重启 Gateway |

### WebSocket 事件

| 事件 | 方向 | 描述 |
|------|------|------|
| `stats:update` | Server → Client | 统计更新 |
| `agent:updated` | Server → Client | Agent 状态更新 |
| `session:message` | Server → Client | 新消息推送 |
| `session:state` | Server → Client | 会话实时状态变化（thinking/generating/tool_calling/complete/idle） |
| `agent:thinking` | Server → Client | Agent 进入思考状态 |
| `agent:generating` | Server → Client | Agent 进入生成状态 |
| `agent:tool_calling` | Server → Client | Agent 进入工具调用状态 |
| `agent:complete` | Server → Client | Agent 本轮生成完成 |
| `agent:idle` | Server → Client | Agent 进入空闲状态 |
| `task:created` | Server → Client | 任务创建，推送到 `tasks` 实时频道 |
| `task:updated` | Server → Client | 任务状态或可编辑字段变更，推送到 `tasks` 实时频道 |
| `task:deleted` | Server → Client | 任务删除，推送到 `tasks` 实时频道 |
| `process:cleanup` | Server → Client | 失控进程已清理 |

## 定时任务

使用 OpenClaw 的 cron 功能：

```typescript
// 创建定时任务
await createScheduledTask(taskId, {
  mode: 'interval',  // 或 'fixed'
  interval: { value: 30, unit: 'minutes' }
})

// 删除定时任务
await deleteScheduledTask(cronId)
```

## 数据库

使用 JSON 文件存储，位于 `packages/backend/data/visualizing-openclaw.json`

### 数据结构

```typescript
interface Task {
  id: string
  name: string
  description: string
  collaborationMode: string
  status:
    | 'pending'
    | 'paused'
    | 'scheduled'
    | 'dispatching'
    | 'distributed'
    | 'running'
    | 'completed'
    | 'failed'
    | 'stale'
  agents: { agentId: string; role: string; instructions?: string }[]
  sessionIds: string[]
  dispatchMode?: 'bind-existing-session' | 'gateway-session-send' | 'agent-run'
  dispatchErrors?: { agentId: string; error: string; code?: string; requestId?: string }[]
  dispatchedAt?: string
  avatarType?: 'sheep' | 'gold'
  createdAt: string
  updatedAt: string
  scheduledConfig?: ScheduledConfig
}

interface Agent {
  id: string
  name: string
  description: string
  model: string
  systemPrompt: string
  workspace: string
  status: string
  avatarUnit?: string
  createdAt: string
  updatedAt: string
}

interface MapData {
  id: string
  name: string
  width: number
  height: number
  layers: {
    terrain: string[][]
    environment: { x: number; y: number; type: string }[]
    units: { x: number; y: number; type: string }[]
  }
  createdAt: number
  updatedAt: number
}
```

## 样式规范

使用 Palantir 深色主题：

```css
/* 主题变量 */
:root {
  --bg-primary: #0f172a;
  --bg-card: #1e293b;
  --text-primary: #f8fafc;
  --accent-blue: #3b82f6;
  --accent-green: #22c55e;
}
```

## 第三方素材与授权

V1.1 游戏界面使用了 [Pixel Frog 的 Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) 免费部分素材，主要位于 `packages/frontend/public/assets/sprites/`，用于单位动画、建筑、地形、环境装饰和部分游戏化 UI 元素。

当前项目约定：

- 仅使用 Tiny Swords Free Pack；不要在未确认授权的情况下加入付费 Enemy Pack 素材。
- 不将 Tiny Swords 素材文件作为独立素材包出售、重新打包或分发。
- 新增第三方素材时，需要同时更新 `ASSET_CREDITS.md`、`README.md`、用户手册和相关开发说明。
- 如需替换或新增素材，优先保持路径命名清晰，并同步更新 `packages/frontend/src/config/agentAnimations.ts`、`agentAvatars.ts` 或地图素材配置。

完整素材来源说明见 [ASSET_CREDITS.md](./ASSET_CREDITS.md)。

## 测试

```bash
# 运行测试
npm test

# 安全测试
cd packages/backend && npm test
```

## 发布流程

1. 更新版本号
2. 更新 CHANGELOG.md
3. 检查第三方素材来源与授权说明是否完整
4. 构建生产版本
5. 测试完整功能
6. 发布到 GitHub
