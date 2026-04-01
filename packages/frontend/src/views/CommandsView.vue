<script setup lang="ts">
import { ref } from 'vue'
import { User, ChatLineRound, Connection, Setting, More, DocumentCopy } from '@element-plus/icons-vue'

const activeTab = ref('agent')

const commandCategories = [
  {
    key: 'agent',
    title: 'Agent 管理命令',
    icon: 'User',
    commands: [
      {
        command: 'openclaw agents',
        description: '获取所有 Agent 列表',
        example: 'openclaw agents'
      },
      {
        command: 'openclaw agent --agent <id> --session-id <sessionId> --message "<msg>"',
        description: '向指定会话发送消息',
        example: 'openclaw agent --agent dev --session-id abc123 --message "你好"'
      },
      {
        command: 'openclaw agent --agent <id> --session-id <sessionId> --timeout <sec>',
        description: '向指定会话发送消息（带超时）',
        example: 'openclaw agent --agent dev --session-id abc123 --timeout 60'
      }
    ]
  },
  {
    key: 'session',
    title: 'Session 管理命令',
    icon: 'ChatLineRound',
    commands: [
      {
        command: 'openclaw sessions --all-agents',
        description: '获取所有 Agent 的会话列表',
        example: 'openclaw sessions --all-agents'
      },
      {
        command: 'openclaw sessions --active-minutes <min>',
        description: '获取最近 N 分钟内活跃的会话',
        example: 'openclaw sessions --active-minutes 30'
      },
      {
        command: 'openclaw sessions --kinds direct,subagent',
        description: '按类型筛选会话',
        example: 'openclaw sessions --kinds direct,subagent'
      }
    ]
  },
  {
    key: 'gateway',
    title: 'Gateway 管理命令',
    icon: 'Connection',
    commands: [
      {
        command: 'openclaw gateway status',
        description: '获取 Gateway 运行状态',
        example: 'openclaw gateway status'
      },
      {
        command: 'openclaw gateway start',
        description: '启动 Gateway 服务',
        example: 'openclaw gateway start'
      },
      {
        command: 'openclaw gateway restart',
        description: '重启 Gateway 服务',
        example: 'openclaw gateway restart'
      },
      {
        command: 'openclaw gateway stop',
        description: '停止 Gateway 服务',
        example: 'openclaw gateway stop'
      }
    ]
  },
  {
    key: 'config',
    title: '配置命令',
    icon: 'Setting',
    commands: [
      {
        command: 'openclaw config show --json',
        description: '获取 Gateway 配置（JSON 格式）',
        example: 'openclaw config show --json'
      },
      {
        command: 'openclaw config get <path>',
        description: '获取指定配置路径的值',
        example: 'openclaw config get agents.defaults.model'
      },
      {
        command: 'openclaw config set <path> <value>',
        description: '设置指定配置路径的值',
        example: 'openclaw config set agents.defaults.model bailian/qwen3-max'
      }
    ]
  },
  {
    key: 'other',
    title: '其他命令',
    icon: 'More',
    commands: [
      {
        command: 'openclaw status',
        description: '获取 OpenClaw 整体状态',
        example: 'openclaw status'
      },
      {
        command: 'openclaw doctor',
        description: '诊断 OpenClaw 环境',
        example: 'openclaw doctor'
      },
      {
        command: 'openclaw --help',
        description: '显示帮助信息',
        example: 'openclaw --help'
      },
      {
        command: 'openclaw --version',
        description: '显示版本信息',
        example: 'openclaw --version'
      }
    ]
  }
]

function copyCommand(command: string) {
  navigator.clipboard.writeText(command)
}
</script>

<template>
  <div class="commands-view">
    <header class="page-header">
      <h2>命令配置</h2>
      <p class="subtitle">OpenClaw CLI 命令参考手册</p>
    </header>

    <div class="content-body">
      <!-- 分类标签 -->
      <div class="category-tabs">
        <div 
          v-for="category in commandCategories" 
          :key="category.key"
          :class="['category-tab', { active: activeTab === category.key }]"
          @click="activeTab = category.key"
        >
          <el-icon><component :is="category.icon" /></el-icon>
          <span>{{ category.title }}</span>
        </div>
      </div>

      <!-- 命令列表 -->
      <div class="commands-list">
        <div 
          v-for="cmd in commandCategories.find(c => c.key === activeTab)?.commands" 
          :key="cmd.command"
          class="command-card"
        >
          <div class="command-header">
            <div class="command-text">
              <code>{{ cmd.command }}</code>
            </div>
            <el-button 
              size="small" 
              type="primary" 
              link
              @click="copyCommand(cmd.command)"
            >
              <el-icon><DocumentCopy /></el-icon>
              复制
            </el-button>
          </div>
          <div class="command-desc">{{ cmd.description }}</div>
          <div class="command-example">
            <span class="label">示例：</span>
            <code>{{ cmd.example }}</code>
          </div>
        </div>
      </div>

      <!-- 快速参考 -->
      <div class="quick-reference">
        <h3>快速参考</h3>
        <div class="reference-table">
          <table>
            <thead>
              <tr>
                <th>分类</th>
                <th>常用命令</th>
                <th>用途</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Agent</td>
                <td><code>openclaw agents</code></td>
                <td>查看所有 Agent</td>
              </tr>
              <tr>
                <td>Session</td>
                <td><code>openclaw sessions --all-agents</code></td>
                <td>查看所有会话</td>
              </tr>
              <tr>
                <td>Gateway</td>
                <td><code>openclaw gateway status</code></td>
                <td>查看网关状态</td>
              </tr>
              <tr>
                <td>Config</td>
                <td><code>openclaw config show --json</code></td>
                <td>查看配置</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.commands-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.page-header {
  padding: 20px 24px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

.page-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.page-header .subtitle {
  margin: 8px 0 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.content-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

/* 分类标签 */
.category-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  color: var(--text-secondary);
}

.category-tab:hover {
  border-color: var(--accent-blue);
  color: var(--text-primary);
}

.category-tab.active {
  background: rgba(59, 130, 246, 0.15);
  border-color: var(--accent-blue);
  color: var(--accent-blue-light);
}

/* 命令列表 */
.commands-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 32px;
}

.command-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
}

.command-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.command-text code {
  display: inline-block;
  padding: 8px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  color: var(--accent-blue-light);
  word-break: break-all;
}

.command-desc {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.command-example {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: rgba(34, 197, 94, 0.1);
  border-radius: var(--radius-sm);
  font-size: 12px;
}

.command-example .label {
  color: var(--accent-green);
  font-weight: 500;
}

.command-example code {
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--text-primary);
}

/* 快速参考 */
.quick-reference {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 20px;
}

.quick-reference h3 {
  margin: 0 0 16px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.reference-table {
  overflow-x: auto;
}

.reference-table table {
  width: 100%;
  border-collapse: collapse;
}

.reference-table th,
.reference-table td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.reference-table th {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.reference-table td {
  font-size: 13px;
  color: var(--text-primary);
}

.reference-table td:first-child {
  font-weight: 500;
  color: var(--accent-blue-light);
}

.reference-table code {
  padding: 4px 8px;
  background: var(--bg-primary);
  border-radius: 4px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  color: var(--accent-green);
}

.reference-table tr:last-child td {
  border-bottom: none;
}
</style>