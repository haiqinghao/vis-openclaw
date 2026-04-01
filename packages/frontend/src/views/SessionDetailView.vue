<script setup lang="ts">
import { onMounted, ref, computed, nextTick, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSessionStore, type SessionMessage } from '@/stores/session'
import { useAgentStore } from '@/stores/agent'

const route = useRoute()
const router = useRouter()
const sessionStore = useSessionStore()
const agentStore = useAgentStore()

const messageInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const isSending = ref(false)

const sessionId = computed(() => route.params.id as string)

const currentSession = computed(() => sessionStore.currentSession)

const messages = computed(() => currentSession.value?.messages || [])

onMounted(async () => {
  await agentStore.fetchAgents()
  await sessionStore.fetchSession(sessionId.value)
  // 获取消息历史
  await sessionStore.fetchMessages(sessionId.value)
  scrollToBottom()
})

onUnmounted(() => {
  sessionStore.currentSession = null
})

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

async function sendMessage() {
  if (!messageInput.value.trim() || isSending.value) return

  isSending.value = true
  try {
    await sessionStore.sendMessage(sessionId.value, messageInput.value)
    messageInput.value = ''
    await sessionStore.fetchMessages(sessionId.value)
    scrollToBottom()
  } catch (e: any) {
    console.error('Send message failed:', e)
  } finally {
    isSending.value = false
  }
}

function goBack() {
  router.push('/sessions')
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('zh-CN')
}

function getAgentName(agentId?: string) {
  if (!agentId) return 'Unknown'
  return agentStore.getAgentById(agentId)?.name || agentId
}
</script>

<template>
  <div class="session-detail-view">
    <header class="content-header">
      <div class="header-left">
        <el-button link @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
        </el-button>
        <h2>会话详情</h2>
        <code class="session-id">{{ sessionId }}</code>
        <span v-if="currentSession?.agentId" class="agent-name">
          {{ getAgentName(currentSession.agentId) }}
        </span>
        <span v-if="currentSession?.status" :class="['status-tag', currentSession.status]">
          {{ currentSession.status }}
        </span>
      </div>
    </header>

    <div class="content-body session-content">
      <!-- 消息列表 -->
      <div ref="messagesContainer" class="messages-container">
        <el-empty v-if="messages.length === 0" description="暂无消息" />

        <div v-else class="messages-list">
          <div
            v-for="msg in messages"
            :key="msg.id"
            :class="['message-item', msg.role]"
          >
            <div class="message-avatar">
              <el-icon v-if="msg.role === 'user'"><User /></el-icon>
              <el-icon v-else><ChatLineRound /></el-icon>
            </div>
            <div class="message-content">
              <div class="message-header">
                <span class="message-role">
                  {{ msg.role === 'user' ? '用户' : 'Assistant' }}
                </span>
                <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
              </div>
              <div class="message-body">{{ msg.content }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="input-area">
        <el-input
          v-model="messageInput"
          type="textarea"
          :rows="3"
          placeholder="输入消息..."
          @keydown.enter.ctrl="sendMessage"
        />
        <el-button type="primary" :loading="isSending" @click="sendMessage">
          发送 (Ctrl+Enter)
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-detail-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.session-id {
  font-size: 12px;
  color: #606266;
  background-color: #f5f7fa;
  padding: 2px 8px;
  border-radius: 4px;
}

.agent-name {
  color: #909399;
}

.session-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin: 20px;
  padding: 0;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-item {
  display: flex;
  gap: 12px;
  max-width: 80%;
}

.message-item.user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background-color: #409eff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message-content {
  background-color: #f5f7fa;
  border-radius: 8px;
  padding: 12px;
}

.message-item.user .message-content {
  background-color: #ecf5ff;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 12px;
}

.message-role {
  font-weight: 600;
  color: #303133;
}

.message-time {
  color: #909399;
}

.message-body {
  color: #606266;
  white-space: pre-wrap;
  word-break: break-word;
}

.input-area {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid #e4e7ed;
  background-color: #fff;
}

.input-area .el-input {
  flex: 1;
}
</style>