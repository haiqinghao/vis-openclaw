# 贡献指南

感谢您考虑为 VIS OpenClaw 做出贡献！

## 开发环境设置

1. Fork 本仓库
2. 克隆你的 Fork：
```bash
git clone https://github.com/your-username/vis-openclaw.git
cd vis-openclaw
```

3. 安装依赖：
```bash
npm install
```

4. 创建特性分支：
```bash
git checkout -b feature/your-feature-name
```

5. 启动开发服务器：
```bash
npm run dev
```

## 代码规范

### TypeScript
- 使用 TypeScript 编写所有新代码
- 遵循现有的代码风格
- 为新功能添加类型定义

### Vue 组件
- 使用 `<script setup>` 语法
- 组件名使用 PascalCase
- Props 使用 TypeScript 类型定义

### CSS
- 使用 CSS 变量定义主题色
- 遵循 Palantir 深色主题风格

## 提交信息规范

使用约定式提交：

- `feat:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建/工具变更

示例：
```
feat: 添加会话搜索功能
fix: 修复 WebSocket 连接断开问题
docs: 更新 API 文档
```

## Pull Request 流程

1. 确保代码通过 lint 检查：
```bash
npm run lint
```

2. 确保所有测试通过：
```bash
npm test
```

3. 提交 Pull Request，描述：
   - 做了什么改动
   - 为什么需要这个改动
   - 如何测试

## 报告问题

提交 Issue 时请包含：

1. 问题描述
2. 复现步骤
3. 期望行为
4. 实际行为
5. 环境信息（Node.js 版本、操作系统等）
6. 截图（如有帮助）

## 许可证

通过贡献代码，您同意您的代码将在 MIT 许可证下发布。