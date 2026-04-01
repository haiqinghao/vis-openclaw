<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSessionStore } from '@/stores/session'
import { useAgentStore } from '@/stores/agent'
import { ElMessage } from 'element-plus'
import axios from 'axios'

const sessionStore = useSessionStore()
const agentStore = useAgentStore()

// 选中的会话
const selectedSessionKey = ref<string | null>(null)
const sessionMessages = ref<any[]>([])
const loadingMessages = ref(false)

// 发送消息
const messageInput = ref('')
const sendingMessage = ref(false)

// 获取会话列表（带完整信息）
const sessionsList = computed(() => {
  return sessionStore.sessions.map(session => {
    // 判断是否是 subagent：检查 kind 字段，或 key 格式
    const keyParts = (session.key || session.id).split(':')
    const isSubagent = session.kind === 'subagent' || 
                       keyParts.length >= 4 || 
                       (session.key && session.key.includes('subage'))
    const agent = agentStore.agents.find(a => a.id === session.agentId)
    return {
      id: session.key || session.id,
      shortId: (session.key || session.id).length > 20 ? (session.key || session.id).substring(0, 20) + '...' : (session.key || session.id),
      agentName: agent?.name || session.agentId || '未知',
      agentId: session.agentId,
      isSubagent,
      type: isSubagent ? 'Subagent' : '主会话',
      status: session.status,
      model: agent?.model,
      emoji: agent?.emoji,
      avatar: agent?.avatar,
      messageCount: session.messageCount,
      lastActivity: session.lastActivity
    }
  })
})

// 当前选中会话的完整信息
const selectedSessionInfo = computed(() => {
  if (!selectedSessionKey.value) return null
  return sessionsList.value.find(s => s.id === selectedSessionKey.value)
})

// 选择会话
async function selectSession(sessionId: string) {
  selectedSessionKey.value = sessionId
  loadingMessages.value = true
  messageInput.value = ''
  try {
    const response = await axios.get(`/api/sessions/${sessionId}/messages`, { params: { limit: 100 } })
    const messages = response.data || []
    sessionMessages.value = messages.sort((a: any, b: any) => {
      const timeA = new Date(a.timestamp || a.createdAt || 0).getTime()
      const timeB = new Date(b.timestamp || b.createdAt || 0).getTime()
      return timeA - timeB
    })
    scrollMessagesToBottom()
  } catch {
    sessionMessages.value = []
  } finally {
    loadingMessages.value = false
  }
}

// 发送消息
async function sendMessage() {
  if (!selectedSessionKey.value || !messageInput.value.trim() || sendingMessage.value) return
  
  sendingMessage.value = true
  try {
    await axios.post(`/api/sessions/${selectedSessionKey.value}/send`, {
      message: messageInput.value.trim()
    })
    messageInput.value = ''
    const response = await axios.get(`/api/sessions/${selectedSessionKey.value}/messages`, { params: { limit: 100 } })
    sessionMessages.value = response.data || []
    ElMessage.success('消息已发送')
    scrollMessagesToBottom()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  } finally {
    sendingMessage.value = false
  }
}

// 滚动到底部
function scrollMessagesToBottom() {
  setTimeout(() => {
    const container = document.querySelector('.messages-container')
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, 100)
}

// 格式化时间
function formatTime(dateStr: string) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 获取 Agent 颜色
function getAgentColor(agentId: string) {
  const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399']
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    hash = agentId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

onMounted(async () => {
  await Promise.all([
    sessionStore.fetchSessions(),
    agentStore.fetchAgents()
  ])
})
</script>

<template>
  <div class="sessions-view">
    <header class="content-header">
      <h2>会话管理</h2>
    </header>

    <div class="content-body">
      <!-- 左侧：会话列表 -->
      <div class="sessions-panel">
        <div class="panel-header">
          <h3>会话列表</h3>
          <span class="session-count">{{ sessionsList.length }}</span>
        </div>
        <div class="panel-body">
          <el-empty v-if="sessionsList.length === 0" description="暂无会话" :image-size="60" />
          <div v-else class="session-list">
            <div 
              v-for="session in sessionsList" 
              :key="session.id" 
              class="session-card"
              :class="{ active: selectedSessionKey === session.id, subagent: session.isSubagent }"
              @click="selectSession(session.id)"
            >
              <div class="session-header">
                <div class="avatar" :style="{ background: getAgentColor(session.agentId || 'unknown') }">
                  <span v-if="session.emoji" class="avatar-emoji">{{ session.emoji }}</span>
                  <img v-else-if="session.avatar" :src="session.avatar" :alt="session.agentName" class="avatar-img" />
                  <span v-else>{{ session.agentName.charAt(0).toUpperCase() }}</span>
                </div>
                <div class="session-info">
                  <span class="session-name">{{ session.agentName }}</span>
                  <el-tag :type="session.isSubagent ? 'warning' : 'primary'" size="small" effect="plain">
                    {{ session.type }}
                  </el-tag>
                </div>
              </div>
              <div class="session-meta">
                <span class="session-id">{{ session.shortId }}</span>
                <span class="message-count">{{ session.messageCount }} 条消息</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：消息区域 -->
      <div class="messages-panel">
        <div class="panel-header">
          <h3>消息区域</h3>
          <span v-if="selectedSessionInfo" class="session-title">
            {{ selectedSessionInfo.agentName }} - {{ selectedSessionInfo.type }}
          </span>
        </div>
        <div class="panel-body">
          <div v-if="!selectedSessionKey" class="empty-hint">
            <el-empty description="请选择会话查看消息" :image-size="80" />
          </div>
          <template v-else>
            <div v-if="loadingMessages" class="loading">
              加载中...
            </div>
            <div v-else class="messages-container">
              <div v-if="sessionMessages.length === 0" class="empty-hint">
                <el-empty description="暂无消息" :image-size="60" />
              </div>
              <div v-else class="messages">
                <div v-for="msg in sessionMessages" :key="msg.id" class="message" :class="msg.role">
                  <div class="message-header">
                    <span class="role">{{ msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : msg.role }}</span>
                    <span class="time">{{ formatTime(msg.timestamp || msg.createdAt) }}</span>
                  </div>
                  <div class="message-content">{{ msg.content }}</div>
                </div>
              </div>
            </div>
            
            <!-- 发送消息区域 -->
            <div class="message-input-area">
              <el-input 
                v-model="messageInput"
                type="textarea"
                :rows="2"
                placeholder="输入消息..."
                @keydown.enter.ctrl="sendMessage"
              />
              <div class="input-actions">
                <span class="hint">Ctrl+Enter 发送</span>
                <el-button 
                  type="primary" 
                  size="small" 
                  :loading="sendingMessage" 
                  :disabled="!messageInput.trim()"
                  @click="sendMessage"
                >
                  发送
                </el-button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sessions-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.content-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

.content-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.content-body {
  flex: 1;
  display: flex;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
}

/* 左侧会话列表面板 */
.sessions-panel {
  width: 320px;
  min-width: 280px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}

/* 右侧消息面板 */
.messages-panel {
  flex: 1;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 400px;
}

/* 消息面板的 panel-body 需要特殊处理 */
.messages-panel .panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}

/* 面板头部 */
.panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.panel-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.panel-header .session-count {
  background: var(--accent-blue);
  color: var(--text-primary);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
}

.panel-header .session-title {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 面板主体 */
.panel-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* 会话列表 */
.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.session-card:hover {
  background: var(--bg-card-hover);
  border-color: var(--border-color-light);
}

.session-card.active {
  background: var(--bg-card-hover);
  border-color: var(--accent-blue);
}

.session-card.subagent {
  background: rgba(245, 158, 11, 0.1);
  border-left: 3px solid var(--accent-yellow);
}

.session-card.subagent:hover {
  background: rgba(245, 158, 11, 0.15);
}

.session-card.subagent.active {
  background: rgba(245, 158, 11, 0.15);
  border-color: var(--accent-yellow);
}

.session-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.session-header .avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  flex-shrink: 0;
}

.session-header .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.session-header .avatar-emoji {
  font-size: 18px;
}

.session-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.session-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.session-id {
  font-size: 11px;
  color: var(--text-muted);
  font-family: monospace;
}

.message-count {
  font-size: 11px;
  color: var(--text-muted);
}

/* 消息区域 */
.messages-container {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}

.message {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.5;
}

/* 用户消息靠右 */
.message.user {
  background: rgba(59, 130, 246, 0.15);
  border-left: none;
  border-radius: var(--radius-md) var(--radius-md) 4px var(--radius-md);
  margin-left: 40px;
}

/* AI 消息靠左 */
.message.assistant {
  background: rgba(34, 197, 94, 0.15);
  border-left: none;
  border-radius: var(--radius-md) var(--radius-md) var(--radius-md) 4px;
  margin-right: 40px;
}

.message.system {
  background: rgba(100, 116, 139, 0.15);
  border-left: none;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.message-header .role {
  font-size: 12px;
  font-weight: 500;
}

.message.user .role { color: var(--accent-blue-light); }
.message.assistant .role { color: var(--accent-green); }
.message.system .role { color: var(--text-secondary); }

.message-header .time {
  font-size: 11px;
  color: var(--text-muted);
}

.message-content {
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-primary);
}

/* 发送消息区域 */
.message-input-area {
  border-top: 1px solid var(--border-color);
  padding: 16px;
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.message-input-area .el-textarea {
  margin-bottom: 0;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
}

.input-actions .hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* 空状态和加载 */
.empty-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-secondary);
}
</style>