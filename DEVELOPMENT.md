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
│   └── SessionDetailView.vue
├── stores/            # Pinia 状态管理
│   ├── agent.ts       # Agent 状态
│   ├── session.ts     # Session 状态
│   ├── task.ts        # Task 状态
│   └── app.ts         # 应用状态
├── router/            # 路由配置
└── styles/            # 全局样式
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
│   ├── gateway.ts     # Gateway API
│   └── dashboard.ts   # Dashboard API
├── services/          # 业务服务
│   ├── database.ts    # 数据库服务
│   ├── websocket.ts   # WebSocket 服务
│   ├── openclaw-cli.ts # OpenClaw CLI 封装
│   ├── config.ts      # 配置服务
│   └── cron.ts        # 定时任务服务
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
| `/api/tasks/:id` | DELETE | 删除任务 |
| `/api/tasks/:id/start` | POST | 分发任务 |
| `/api/tasks/:id/schedule` | PUT | 设置定时配置 |
| `/api/tasks/:id/schedule` | DELETE | 取消定时配置 |

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
  status: 'pending' | 'distributed' | 'failed'
  agents: { agentId: string }[]
  sessionIds: string[]
  createdAt: string
  scheduledConfig?: ScheduledConfig
}

interface Agent {
  id: string
  name: string
  model: string
  status: 'online' | 'offline'
  emoji?: string
  avatar?: string
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
3. 构建生产版本
4. 测试完整功能
5. 发布到 GitHub