# VIS OpenClaw - 快速启动

## 环境要求

- Node.js >= 18.0.0
- npm >= 9.0.0
- OpenClaw CLI (已安装并配置)

## 方式一：双击运行脚本 (Windows)

在文件资源管理器中双击运行：

```
start.bat
```

## 方式二：命令行启动

### 一键启动（推荐）

```bash
npm run dev
```

### 分别启动

```bash
# 终端 1 - 后端
cd packages/backend
npm run dev

# 终端 2 - 前端
cd packages/frontend
npm run dev
```

## 访问地址

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3000 |
| 后端 API | http://localhost:4000 |

## 停止服务

**Windows:**
```bash
stop.bat
```

**手动:**
按 `Ctrl+C` 停止终端中的服务

## 首次运行

1. 安装依赖：
```bash
npm install
```

2. 配置环境变量：
```bash
cd packages/backend
cp .env.example .env
# 编辑 .env 填入实际配置
```

3. 启动服务

## 常见问题

### 端口被占用

修改 `packages/backend/.env` 中的 `PORT` 和 `packages/frontend/vite.config.ts` 中的端口配置。

### OpenClaw CLI 未找到

确保已全局安装 OpenClaw：
```bash
npm install -g openclaw
```

---

更多信息请参考 [USER_GUIDE.md](./USER_GUIDE.md)