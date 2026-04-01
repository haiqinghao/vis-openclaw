# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-04-01

### Added
- **命令参考页面** - 新增 `CommandsView.vue`，提供 OpenClaw CLI 命令手册
- **定时任务服务** - `cron.ts` 支持间隔启动和定点启动两种模式
- **Gateway 服务** - `gateway.ts` 网关状态管理
- **CLI 封装层** - `openclaw-cli.ts` 统一 OpenClaw CLI 调用接口
- **配置服务** - `config.ts` 动态配置管理
- **启动脚本** - `start.bat` / `stop.bat` Windows 一键启动停止

### Changed
- 安全加固：使用 `os.homedir()` 替代硬编码用户路径
- 实现多层缓存机制（agents/sessions/health 60秒 TTL）
- 完善错误处理和参数校验

### Fixed
- 修复路径遍历安全漏洞
- 修复会话消息显示问题

### Documentation
- 新增 `README.md` 项目介绍
- 新增 `DEVELOPMENT.md` 开发指南
- 新增 `USER_GUIDE.md` 用户手册
- 更新 `QUICKSTART.md` 快速启动指南

## [0.6.0] - 2026-03-31

### Added
- **Palantir 深色主题** - 现代化 UI 风格
- **嵌套卡片布局** - 任务→Agent→会话三层结构
- **可收放侧边导航** - 默认折叠，点击展开
- **可拖动面板宽度** - 任务管理和消息区域之间

### Changed
- 会话管理页面左右分栏布局
- 消息排序改为正序（最新消息在最下）

### Fixed
- Subagent 会话消息无法显示
- 发送消息字段名前端 `content` 改为 `message`

## [0.5.0] - 2026-03-30

### Added
- 监测面板 - 实时查看 Agent 状态
- Agent 管理 - 创建、编辑、删除
- 会话管理 - 查看会话、发送消息
- 任务分发 - 创建任务分配 Agent
- 网关控制 - 启动/重启 Gateway
- WebSocket 实时通信

[0.9.0]: https://github.com/openclaw/vis-openclaw/compare/v0.6.0...v0.9.0
[0.6.0]: https://github.com/openclaw/vis-openclaw/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/openclaw/vis-openclaw/releases/tag/v0.5.0