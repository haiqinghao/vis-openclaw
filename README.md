# VIS OpenClaw

> OpenClaw Multi-Agent Collaboration Monitoring & Management Platform
> OpenClaw 多 Agent 协作监控和管理平台

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Vue](https://img.shields.io/badge/Vue-3.x-4fc08d.svg)](https://vuejs.org/)

![VIS OpenClaw Dashboard](./usershouce/jiancemianban.png)

---

## English | [中文](#中文文档)

### Overview

VIS OpenClaw is a visualization platform for monitoring and managing OpenClaw multi-Agent systems. It provides an intuitive interface to view Agent status, manage sessions, distribute tasks, and support real-time message intervention.

### Core Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | Real-time view of Agent status, session count, task progress |
| **Agent Management** | Create, edit, delete Agents, configure communication permissions |
| **Session Management** | View all sessions, real-time message intervention |
| **Task Distribution** | Create tasks and assign to specific Agents |
| **Scheduled Tasks** | Support interval and fixed-time scheduling modes |
| **Task Lifecycle** | Track pending, dispatching, running, completed, failed, and stale tasks |
| **Gateway Control** | One-click start/restart OpenClaw Gateway |
| **Commands Reference** | OpenClaw CLI command manual |
| **Game Interface** | Visualize tasks, Agents, maps, and animated virtual avatars |
| **Map Editor** | Build, preview, import, export, and select maps for the game interface |

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3 + TypeScript + Vite + Pinia + Element Plus |
| Backend | Node.js + Express + TypeScript + Socket.io |
| Database | LowDB JSON file storage |
| Real-time | WebSocket (Socket.io) |

### Quick Start

```bash
# Clone repository
git clone https://github.com/haiqinghao/vis-openclaw.git
cd vis-openclaw

# Install dependencies
npm install

# Start services
npm run dev
```

Access: http://localhost:3000

### Screenshots

#### Dashboard
![Dashboard](./usershouce/jiancemianban.png)

#### Agent Management
![Agent Management](./usershouce/agentguanli.png)

#### Create Agent
![Create Agent](./usershouce/agentchuangjian.png)

#### Agent Communication Config
![Communication](./usershouce/agenttongxin.png)

#### Session Management
![Sessions](./usershouce/huihuaguanli.png)

#### Create Task
![Create Task](./usershouce/chuangjianrenwu.png)

#### Commands Reference
![Commands](./usershouce/mingling.png)

#### Game Interface
![Game Interface](./usershouce/game/youxijiemian.png)

#### Map Editor and Preview
![Map Preview](./usershouce/game/mapyulan.png)

### Documentation

- [Quick Start](./QUICKSTART.md)
- [User Guide](./USER_GUIDE_EN.md)
- [Development Guide](./DEVELOPMENT.md)
- [Changelog](./CHANGELOG.md)
- [Asset Credits](./ASSET_CREDITS.md)

### Asset Credits

The V1.1 game interface uses selected assets from the free portion of [Tiny Swords by Pixel Frog](https://pixelfrog-assets.itch.io/tiny-swords). These assets are used for unit animations, buildings, terrain, environment decorations, and selected game-style UI elements. See [ASSET_CREDITS.md](./ASSET_CREDITS.md) for usage boundaries.

---

## 中文文档

### 项目简介

VIS OpenClaw 是一个用于监控和管理 OpenClaw 多 Agent 系统的可视化平台。它提供了直观的界面来查看 Agent 状态、管理会话、分发任务，并支持实时消息干预。

### 核心功能

| 功能 | 描述 |
|------|------|
| **监测面板** | 实时查看 Agent 状态、会话数量、任务进度 |
| **Agent 管理** | 创建、编辑、删除 Agent，配置通信权限 |
| **会话管理** | 查看所有会话，实时发送消息干预 |
| **任务分发** | 创建任务并分发给指定 Agent |
| **定时任务** | 支持间隔启动和定点启动两种定时模式 |
| **任务状态生命周期** | 追踪待分发、分发中、处理中、完成、失败和状态待确认任务 |
| **网关控制** | 一键启动/重启 OpenClaw Gateway |
| **命令参考** | OpenClaw CLI 命令手册 |
| **游戏界面** | 以地图、任务虚拟形象和动态 Agent 形象展示协作现场 |
| **地图编辑器** | 创建、预览、导入、导出并选择游戏界面使用的地图 |

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + TypeScript + Vite + Pinia + Element Plus |
| 后端 | Node.js + Express + TypeScript + Socket.io |
| 数据库 | LowDB JSON 文件存储 |
| 实时通信 | WebSocket (Socket.io) |

### 快速开始

```bash
# 克隆仓库
git clone https://github.com/haiqinghao/vis-openclaw.git
cd vis-openclaw

# 安装依赖
npm install

# 启动服务
npm run dev
```

访问地址: http://localhost:3000

### 功能截图

#### 监测面板
![监测面板](./usershouce/jiancemianban.png)

#### Agent 管理
![Agent管理](./usershouce/agentguanli.png)

#### 创建 Agent
![创建Agent](./usershouce/agentchuangjian.png)

#### Agent 通信配置
![通信配置](./usershouce/agenttongxin.png)

#### 会话管理
![会话管理](./usershouce/huihuaguanli.png)

#### 创建任务
![创建任务](./usershouce/chuangjianrenwu.png)

#### 命令参考
![命令参考](./usershouce/mingling.png)

#### 游戏界面
![游戏界面](./usershouce/game/youxijiemian.png)

#### 地图编辑与预览
![地图预览](./usershouce/game/mapyulan.png)

### 文档

- [快速启动](./QUICKSTART.md)
- [用户手册](./USER_GUIDE.md)
- [开发指南](./DEVELOPMENT.md)
- [更新日志](./CHANGELOG.md)
- [素材来源说明](./ASSET_CREDITS.md)

---

### 素材来源说明

V1.1 游戏界面使用了 [Pixel Frog 的 Tiny Swords](https://pixelfrog-assets.itch.io/tiny-swords) 免费部分素材，用于单位动画、建筑、地形、环境装饰和部分游戏化 UI 元素。完整使用边界见 [ASSET_CREDITS.md](./ASSET_CREDITS.md)。

---

## Project Structure

```
VIS OpenClaw/
├── packages/
│   ├── frontend/          # Vue 3 frontend
│   │   ├── src/
│   │   │   ├── views/     # Page components
│   │   │   ├── stores/    # Pinia state
│   │   │   ├── router/    # Routes
│   │   │   └── styles/    # Styles
│   │   └── package.json
│   │
│   └── backend/           # Node.js backend
│       ├── src/
│       │   ├── routes/    # API routes
│       │   ├── services/  # Business services
│       │   └── index.ts   # Entry
│       └── package.json
│
├── usershouce/            # Screenshots
│   └── game/              # V1.1 game-interface screenshots
├── .github/               # GitHub templates
├── start.bat              # Windows start script
├── stop.bat               # Windows stop script
├── CHANGELOG.md
├── CONTRIBUTING.md
├── DEVELOPMENT.md
├── LICENSE
├── QUICKSTART.md
├── README.md
├── ASSET_CREDITS.md       # Third-party asset credits
├── USER_GUIDE.md          # Chinese user guide
├── USER_GUIDE_EN.md       # English user guide
└── package.json
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md)

## License

MIT License - see [LICENSE](LICENSE)

Third-party visual assets are subject to their own terms. VIS OpenClaw V1.1 uses selected assets from the free portion of [Tiny Swords by Pixel Frog](https://pixelfrog-assets.itch.io/tiny-swords). See [ASSET_CREDITS.md](./ASSET_CREDITS.md).

## Acknowledgments

- [OpenClaw](https://github.com/openclaw/openclaw) - OpenClaw core
- [Vue.js](https://vuejs.org/) - Progressive JavaScript framework
- [Element Plus](https://element-plus.org/) - Vue 3 component library
- [Socket.io](https://socket.io/) - Real-time communication engine
- [Tiny Swords by Pixel Frog](https://pixelfrog-assets.itch.io/tiny-swords) - Free game sprites and environment assets used in the V1.1 game interface
