<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { useSessionStore } from '@/stores/session'
import { useTaskStore } from '@/stores/task'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'

const agentStore = useAgentStore()
const sessionStore = useSessionStore()
const taskStore = useTaskStore()

// 网关状态
const gatewayStatus = ref<'connected' | 'disconnected' | 'unknown'>('unknown')
const gatewayLoading = ref(false)

// 左侧面板宽度（可拖动调整）
const panelWidth = ref(600)
const isResizing = ref(false)

// 选中的会话
const selectedSessionKey = ref<string | null>(null)
const sessionMessages = ref<any[]>([])
const loadingMessages = ref(false)

// 发送消息相关
const messageInput = ref('')
const sendingMessage = ref(false)

// 创建任务对话框
const dialogVisible = ref(false)
const taskForm = ref({ name: '', description: '' })
const dialogLoading = ref(false)
const descriptionInputRef = ref<any>(null)

// 定时任务配置对话框
const scheduleDialogVisible = ref(false)
const scheduleForm = ref<ScheduledConfig>({
  enabled: true,
  mode: 'interval',
  interval: { value: 30, unit: 'minutes' },
  fixedTime: '09:00'
})
const scheduleDialogLoading = ref(false)
const currentScheduleTask = ref<any>(null)

// 定时任务配置类型
interface ScheduledConfig {
  enabled: boolean
  mode: 'interval' | 'fixed'
  interval?: { value: number; unit: 'minutes' | 'hours' }
  fixedTime?: string
}

// 解析描述中已选中的 Agent
const selectedAgents = computed(() => {
  const mentions = taskForm.value.description.match(/@(\w+)/g) || []
  const uniqueNames = [...new Set(mentions.map(m => m.slice(1)))]
  return uniqueNames.map(name => {
    const agent = agentStore.agents.find(a => a.name === name || a.id === name)
    return agent ? { ...agent, mentioned: true } : { id: name, name, mentioned: true, notFound: true }
  })
})

// 统计数据
const stats = computed(() => ({
  agentCount: agentStore.agents.length,
  sessionCount: sessionStore.sessions.length,
  taskCount: taskStore.tasks.length,
  distributedCount: taskStore.tasks.filter(t => t.status === 'distributed').length
}))

// 按创建时间倒序排列的任务列表
const sortedTasks = computed(() => {
  return [...taskStore.tasks].sort((a, b) => {
    const timeA = new Date(a.createdAt || 0).getTime()
    const timeB = new Date(b.createdAt || 0).getTime()
    return timeB - timeA  // 倒序：最新的在前
  })
})

// 公共会话列表 - 获取所有会话
const allSessions = computed(() => {
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
      createdAt: session.createdAt
    }
  }).sort((a, b) => {
    // 按创建时间倒序
    const timeA = new Date(a.createdAt || 0).getTime()
    const timeB = new Date(b.createdAt || 0).getTime()
    return timeB - timeA
  })
})

// 当前选中会话的完整信息
const selectedSessionInfo = computed(() => {
  if (!selectedSessionKey.value) return null
  return allSessions.value.find(s => s.id === selectedSessionKey.value)
})

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

// 格式化消息时间
function formatMessageTime(dateStr: string) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 检查网关状态
async function checkGatewayStatus() {
  try {
    const response = await axios.get('/api/gateway/status', { timeout: 3000 })
    gatewayStatus.value = response.data.status === 'ok' ? 'connected' : 'disconnected'
  } catch {
    gatewayStatus.value = 'disconnected'
  }
}

// 启动网关
async function handleStartGateway() {
  gatewayLoading.value = true
  try {
    await axios.post('/api/gateway/start')
    ElMessage.success('网关启动中...')
    setTimeout(() => checkGatewayStatus(), 3000)
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '启动失败')
  } finally {
    gatewayLoading.value = false
  }
}

// 重启网关
async function handleRestartGateway() {
  try {
    await ElMessageBox.confirm('确定要重启网关吗？', '重启确认', {
      confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
    })
    gatewayLoading.value = true
    gatewayStatus.value = 'unknown'
    await axios.post('/api/gateway/restart')
    ElMessage.success('网关重启中...')
    setTimeout(() => checkGatewayStatus(), 5000)
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.error || '重启失败')
  } finally {
    gatewayLoading.value = false
  }
}

// 获取任务的 Agent 列表
function getTaskAgents(task: any) {
  if (!task.agents || task.agents.length === 0) return []
  return task.agents.map((ta: any) => {
    const agent = agentStore.agents.find(a => a.id === ta.agentId)
    return { 
      ...ta, 
      name: agent?.name || ta.agentId, 
      status: agent?.status || 'offline',
      model: agent?.model,
      avatar: agent?.avatar,
      emoji: agent?.emoji
    }
  })
}

// Agent 颜色
function getAgentColor(agentId: string) {
  const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399', '#9c27b0']
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    hash = agentId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

// 选择会话
async function selectSession(sessionId: string) {
  selectedSessionKey.value = sessionId
  loadingMessages.value = true
  messageInput.value = '' // 切换会话时清空输入框
  try {
    const response = await axios.get(`/api/sessions/${sessionId}/messages`, { params: { limit: 100 } })
    // 按时间正序排列：最新消息在最下面
    const messages = response.data || []
    sessionMessages.value = messages.sort((a: any, b: any) => {
      const timeA = new Date(a.timestamp || a.createdAt || 0).getTime()
      const timeB = new Date(b.timestamp || b.createdAt || 0).getTime()
      return timeA - timeB  // 正序：最早的在上面，最新的在下面
    })
    // 滚动到底部显示最新消息
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
    // 重新获取消息列表
    const response = await axios.get(`/api/sessions/${selectedSessionKey.value}/messages`, { params: { limit: 100 } })
    // 按时间正序排列：最新消息在最下面
    const messages = response.data || []
    sessionMessages.value = messages.sort((a: any, b: any) => {
      const timeA = new Date(a.timestamp || a.createdAt || 0).getTime()
      const timeB = new Date(b.timestamp || b.createdAt || 0).getTime()
      return timeA - timeB  // 正序：最早的在上面，最新的在下面
    })
    // 滚动到底部显示最新消息
    scrollMessagesToBottom()
    ElMessage.success('消息已发送')
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  } finally {
    sendingMessage.value = false
  }
}

// 滚动消息列表到底部
function scrollMessagesToBottom() {
  setTimeout(() => {
    const container = document.querySelector('.messages-container')
    if (container) {
      container.scrollTop = container.scrollHeight
    }
  }, 100)
}

// 启动任务
async function handleStartTask(task: any) {
  try {
    await taskStore.startTask(task.id)
    ElMessage.success('任务已启动')
  } catch (e: any) {
    ElMessage.error(e.message || '启动失败')
  }
}

// 删除任务
async function handleDeleteTask(task: any) {
  try {
    await ElMessageBox.confirm(`确定删除任务 "${task.name}"？`, '警告', {
      confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
    })
    await taskStore.deleteTask(task.id)
    ElMessage.success('任务已删除')
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.message || '删除失败')
  }
}

// 打开定时配置对话框
function openScheduleDialog(task: any) {
  currentScheduleTask.value = task
  
  // 如果已有配置，使用现有配置
  if (task.scheduledConfig) {
    scheduleForm.value = {
      enabled: task.scheduledConfig.enabled,
      mode: task.scheduledConfig.mode,
      interval: task.scheduledConfig.interval || { value: 30, unit: 'minutes' },
      fixedTime: task.scheduledConfig.fixedTime || '09:00'
    }
  } else {
    // 默认配置
    scheduleForm.value = {
      enabled: true,
      mode: 'interval',
      interval: { value: 30, unit: 'minutes' },
      fixedTime: '09:00'
    }
  }
  
  scheduleDialogVisible.value = true
}

// 保存定时配置
async function handleSaveSchedule() {
  if (!currentScheduleTask.value) return
  
  scheduleDialogLoading.value = true
  try {
    const config = {
      enabled: scheduleForm.value.enabled,
      mode: scheduleForm.value.mode,
      interval: scheduleForm.value.mode === 'interval' ? scheduleForm.value.interval : undefined,
      fixedTime: scheduleForm.value.mode === 'fixed' ? scheduleForm.value.fixedTime : undefined
    }
    
    await axios.put(`/api/tasks/${currentScheduleTask.value.id}/schedule`, config)
    
    // 刷新任务列表
    await taskStore.fetchTasks()
    
    ElMessage.success('定时配置已保存')
    scheduleDialogVisible.value = false
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || '保存失败')
  } finally {
    scheduleDialogLoading.value = false
  }
}

// 取消定时配置
async function handleClearSchedule(task: any) {
  try {
    await ElMessageBox.confirm(`确定取消任务 "${task.name}" 的定时配置？`, '确认', {
      confirmButtonText: '确定', cancelButtonText: '取消', type: 'warning'
    })
    
    await axios.delete(`/api/tasks/${task.id}/schedule`)
    
    // 刷新任务列表
    await taskStore.fetchTasks()
    
    ElMessage.success('定时配置已取消')
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.error || '取消失败')
  }
}

// 格式化定时信息显示
function formatScheduleInfo(task: any): string {
  if (!task.scheduledConfig) return ''
  
  const config = task.scheduledConfig
  if (!config.enabled) return '定时已关闭'
  
  if (config.mode === 'interval') {
    return `每隔 ${config.interval?.value} ${config.interval?.unit === 'minutes' ? '分钟' : '小时'} 启动`
  } else if (config.mode === 'fixed') {
    return `每天 ${config.fixedTime} 启动`
  }
  
  return ''
}

// 打开创建对话框
function openCreateDialog() {
  taskForm.value = { name: '', description: '' }
  dialogVisible.value = true
}

// 点击 agent 名称，插入到描述框光标位置
function insertAgentMention(agent: any) {
  const mention = `@${agent.name} `
  
  // 尝试从 el-input 组件获取内部 textarea
  let textarea: HTMLTextAreaElement | null = null
  if (descriptionInputRef.value?.$el) {
    textarea = descriptionInputRef.value.$el.querySelector('textarea')
  }
  
  if (textarea) {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = taskForm.value.description
    taskForm.value.description = text.substring(0, start) + mention + text.substring(end)
    
    // 更新光标位置
    setTimeout(() => {
      textarea?.focus()
      textarea?.setSelectionRange(start + mention.length, start + mention.length)
    }, 0)
  } else {
    // 如果没有获取到 textarea，直接追加到末尾
    taskForm.value.description += mention
  }
}

// 从描述中移除已选中的 Agent
function removeAgentMention(agent: any) {
  const regex = new RegExp(`@${agent.name}\\s*`, 'g')
  taskForm.value.description = taskForm.value.description.replace(regex, '')
}

// 获取 Agent 的关联会话列表（带完整信息）
function getAgentSessions(agentId: string) {
  return sessionStore.sessions
    .filter(s => s.agentId === agentId)
    .map(session => {
      // 判断是否是 subagent：检查 kind 字段，或 key 格式是否为四段（agent:xxx:subagent:xxx）
      const keyParts = (session.key || session.id).split(':')
      const isSubagent = session.kind === 'subagent' || 
                         keyParts.length >= 4 || 
                         (session.key && session.key.includes('subage'))  // CLI 截断了 'subagent' 为 'subage'
      const agent = agentStore.agents.find(a => a.id === session.agentId)
      return {
        id: session.key || session.id,  // 使用 key 作为主标识，用于消息 API
        sessionId: session.id,          // 原始 sessionId
        shortId: (session.key || session.id).length > 20 ? (session.key || session.id).substring(0, 20) + '...' : (session.key || session.id),
        agentName: agent?.name || session.agentId || '未知',
        agentId: session.agentId,
        isSubagent,
        type: isSubagent ? 'Subagent' : '主会话',
        status: session.status,
        model: agent?.model,
        emoji: agent?.emoji,
        avatar: agent?.avatar,
        createdAt: session.createdAt
      }
    })
    .sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime()
      const timeB = new Date(b.createdAt || 0).getTime()
      return timeB - timeA
    })
}

// 拖动调整面板宽度
function startResize(e: MouseEvent) {
  isResizing.value = true
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function handleResize(e: MouseEvent) {
  if (!isResizing.value) return
  const newWidth = e.clientX - 64  // 减去左侧导航栏宽度
  if (newWidth >= 300 && newWidth <= 800) {
    panelWidth.value = newWidth
  }
}

function stopResize() {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// 创建任务
async function handleCreateTask() {
  if (!taskForm.value.name.trim()) {
    ElMessage.warning('请输入任务名称')
    return
  }
  dialogLoading.value = true
  try {
    // 解析描述中的 @mentions
    const agentIds: string[] = []
    const mentions = taskForm.value.description.match(/@(\w+)/g) || []
    for (const m of mentions) {
      const name = m.slice(1)
      const agent = agentStore.agents.find(a => a.name === name || a.id === name)
      if (agent) agentIds.push(agent.id)
    }
    
    await taskStore.createTask({
      name: taskForm.value.name,
      description: taskForm.value.description,
      agents: agentIds.map(id => ({ agentId: id, role: 'primary' as const })),
      status: 'pending',
      sessionIds: [],
      collaborationMode: 'sequential'
    })
    ElMessage.success('任务创建成功')
    dialogVisible.value = false
  } catch (e: any) {
    ElMessage.error(e.message || '创建失败')
  } finally {
    dialogLoading.value = false
  }
}

let statusInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  setTimeout(() => checkGatewayStatus(), 1000)
  statusInterval = setInterval(checkGatewayStatus, 60000)
  await Promise.all([agentStore.fetchAgents(), sessionStore.fetchSessions(), taskStore.fetchTasks()])
})

onUnmounted(() => {
  if (statusInterval) clearInterval(statusInterval)
})
</script>

<template>
  <div class="dashboard">
    <!-- 头部 -->
    <header class="header">
      <h2>监测面板</h2>
      <div class="header-actions">
        <el-button type="success" size="small" :loading="gatewayLoading" :disabled="gatewayStatus === 'connected'" @click="handleStartGateway">启动网关</el-button>
        <el-button type="warning" size="small" :loading="gatewayLoading" :disabled="gatewayStatus === 'disconnected'" @click="handleRestartGateway">重启网关</el-button>
        <div class="status" :class="gatewayStatus">
          <span class="dot"></span>
          <span>{{ gatewayStatus === 'connected' ? '已连接' : gatewayStatus === 'disconnected' ? '未连接' : '检测中' }}</span>
        </div>
      </div>
    </header>

    <!-- 统计卡片 -->
    <div class="stats">
      <div class="stat-card">
        <div class="value">{{ stats.agentCount }}</div>
        <div class="label">Agent 数量</div>
      </div>
      <div class="stat-card">
        <div class="value">{{ stats.sessionCount }}</div>
        <div class="label">会话数量</div>
      </div>
      <div class="stat-card">
        <div class="value">{{ stats.taskCount }}</div>
        <div class="label">任务数量</div>
      </div>
      <div class="stat-card">
        <div class="value">{{ stats.distributedCount }}</div>
        <div class="label">已分发任务</div>
      </div>
    </div>

    <!-- 主内容区域：左右两列布局 -->
    <div class="main-content">
      <!-- 左侧：嵌套卡片区域（任务 → Agent → 会话） -->
      <div class="nested-cards-panel" :style="{ width: panelWidth + 'px' }">
        <div class="panel-header">
          <h3>任务管理</h3>
          <el-button type="primary" size="small" @click="openCreateDialog">创建任务</el-button>
        </div>
        <div class="panel-body">
          <el-empty v-if="taskStore.tasks.length === 0" description="暂无任务" :image-size="80" />
          <div v-else class="task-cards-container">
            <!-- 任务卡片（外层）- 左右两栏布局 -->
            <div 
              v-for="task in sortedTasks" 
              :key="task.id" 
              class="task-card-outer"
              :class="task.status"
            >
              <!-- 左侧：任务信息 -->
              <div class="task-card-left">
                <div class="task-info">
                  <span class="task-name">{{ task.name }}</span>
                  <el-tag 
                    :type="task.status === 'distributed' ? 'success' : task.status === 'failed' ? 'danger' : task.status === 'scheduled' ? 'warning' : 'info'" 
                    size="small"
                  >
                    {{ task.status === 'pending' ? '待分发' : task.status === 'distributed' ? '已分发' : task.status === 'failed' ? '失败' : task.status }}
                    <el-icon v-if="task.scheduledConfig?.enabled" style="margin-left: 4px;"><svg viewBox="0 0 1024 1024" width="12" height="12"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z" fill="currentColor"/><path d="M686.7 638.6L544.1 535.5V288c0-4.4-3.6-8-8-8H488c-4.4 0-8 3.6-8 8v275.4c0 2.6 1.2 5 3.3 6.5l165.4 120.6c3.6 2.6 8.6 1.8 11.2-1.7l28.6-39c2.6-4.1 1.8-9.1-1.8-11.6z" fill="currentColor"/></svg></el-icon>
                  </el-tag>
                </div>
                <div class="task-meta">
                  <span class="task-desc">{{ task.description || '无描述' }}</span>
                  <span v-if="task.scheduledConfig?.enabled" class="task-schedule">{{ formatScheduleInfo(task) }}</span>
                  <span class="task-time">{{ formatTime(task.createdAt) }}</span>
                </div>
                <div class="task-actions">
                  <el-button v-if="task.status === 'pending'" type="success" size="small" @click="handleStartTask(task)">分发</el-button>
                  <el-button 
                    type="warning" 
                    size="small" 
                    link 
                    @click="openScheduleDialog(task)"
                    :disabled="task.status === 'distributed'"
                  >
                    <el-icon><svg viewBox="0 0 1024 1024"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z" fill="currentColor"/><path d="M686.7 638.6L544.1 535.5V288c0-4.4-3.6-8-8-8H488c-4.4 0-8 3.6-8 8v275.4c0 2.6 1.2 5 3.3 6.5l165.4 120.6c3.6 2.6 8.6 1.8 11.2-1.7l28.6-39c2.6-4.1 1.8-9.1-1.8-11.6z" fill="currentColor"/></svg></el-icon>
                    定时
                  </el-button>
                  <el-button type="danger" size="small" link @click="handleDeleteTask(task)">删除</el-button>
                </div>
              </div>
              
              <!-- 右侧：Agent 卡片列表 -->
              <div class="task-card-right">
                <div class="agent-cards-container" v-if="getTaskAgents(task).length > 0">
                  <div 
                    v-for="taskAgent in getTaskAgents(task)" 
                    :key="taskAgent.agentId" 
                    class="agent-card-nested"
                  >
                    <div class="agent-card-header">
                      <div class="avatar" :style="(taskAgent.emoji || taskAgent.avatar) ? {} : { background: getAgentColor(taskAgent.agentId) }">
                        <span v-if="taskAgent.emoji" class="avatar-emoji">{{ taskAgent.emoji }}</span>
                        <img v-else-if="taskAgent.avatar" :src="taskAgent.avatar" :alt="taskAgent.name" class="avatar-img" />
                        <span v-else>{{ taskAgent.name.charAt(0).toUpperCase() }}</span>
                      </div>
                      <div class="agent-info">
                        <span class="agent-name">{{ taskAgent.name }}</span>
                        <span v-if="taskAgent.model" class="agent-model">{{ taskAgent.model }}</span>
                        <span class="agent-status" :class="taskAgent.status">{{ taskAgent.status }}</span>
                      </div>
                    </div>
                    
                    <!-- 会话卡片（内层）- 嵌套在 Agent 卡片内 -->
                    <div class="session-cards-container" v-if="getAgentSessions(taskAgent.agentId).length > 0">
                      <div 
                        v-for="session in getAgentSessions(taskAgent.agentId)" 
                        :key="session.id" 
                        class="session-card-nested"
                        :class="{ active: selectedSessionKey === session.id, subagent: session.isSubagent }"
                        @click="selectSession(session.id)"
                      >
                        <div class="session-card-content">
                          <span class="session-name">{{ session.agentName }}</span>
                          <el-tag :type="session.isSubagent ? 'warning' : 'primary'" size="small" effect="plain">
                            {{ session.type }}
                          </el-tag>
                          <span class="session-id">{{ session.shortId }}</span>
                        </div>
                      </div>
                    </div>
                    <div v-else class="no-sessions">暂无会话</div>
                  </div>
                </div>
                <div v-else class="no-agents">暂无参与的 Agent</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 拖动调整条 -->
      <div 
        class="resize-handle" 
        :class="{ active: isResizing }"
        @mousedown="startResize"
      ></div>

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
            <!-- 消息列表 -->
            <div v-if="loadingMessages" class="loading">
              <el-icon class="is-loading"><svg viewBox="0 0 1024 1024"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z" fill="currentColor"/><path d="M464 336a48 48 0 1 0 96 0 48 48 0 1 0-96 0z" fill="currentColor"/><path d="M512 576c-17.7 0-32 14.3-32 32v192c0 17.7 14.3 32 32 32s32-14.3 32-32V608c0-17.7-14.3-32-32-32z" fill="currentColor"/></svg></el-icon>
              加载中...
            </div>
            <div v-else class="messages-container" :key="selectedSessionKey">
              <div v-if="sessionMessages.length === 0" class="empty-hint">
                <el-empty description="暂无消息" :image-size="60" />
              </div>
              <div v-else class="messages">
                <div v-for="msg in sessionMessages" :key="msg.id" class="message" :class="msg.role">
                  <div class="message-header">
                    <span class="role">{{ msg.role === 'user' ? '用户' : msg.role === 'assistant' ? 'AI' : msg.role }}</span>
                    <span class="time">{{ formatMessageTime(msg.timestamp || msg.createdAt) }}</span>
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
                :disabled="sendingMessage"
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

    <!-- 创建对话框 -->
    <el-dialog v-model="dialogVisible" title="创建任务" width="500px">
      <el-form label-width="80px">
        <el-form-item label="任务名称" required>
          <el-input v-model="taskForm.name" placeholder="请输入任务名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input 
            ref="descriptionInputRef"
            v-model="taskForm.description" 
            type="textarea" 
            :rows="3" 
            placeholder="使用 @agent名 提及 Agent"
          />
          <div class="agent-mentions">
            <div class="mention-row">
              <span class="hint">可用 Agent：</span>
              <el-tag 
                v-for="agent in agentStore.agents" 
                :key="agent.id"
                size="small"
                class="agent-tag"
                @click="insertAgentMention(agent)"
              >
                @{{ agent.name }}
              </el-tag>
              <span v-if="agentStore.agents.length === 0" class="no-agent">暂无可用 Agent</span>
            </div>
            <div class="mention-row" v-if="selectedAgents.length > 0">
              <span class="hint selected-hint">已选中：</span>
              <el-tag 
                v-for="agent in selectedAgents" 
                :key="agent.id"
                size="small"
                :type="agent.notFound ? 'danger' : 'success'"
                class="selected-tag"
                closable
                @click="insertAgentMention(agent)"
                @close="removeAgentMention(agent)"
              >
                @{{ agent.name }}
              </el-tag>
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible.value = false">取消</el-button>
        <el-button type="primary" :loading="dialogLoading" @click="handleCreateTask">创建</el-button>
      </template>
    </el-dialog>

    <!-- 定时任务配置对话框 -->
    <el-dialog v-model="scheduleDialogVisible" title="定时任务配置" width="450px">
      <el-form label-width="100px">
        <el-form-item label="启用定时">
          <el-switch v-model="scheduleForm.enabled" />
        </el-form-item>
        
        <el-form-item label="定时模式">
          <el-radio-group v-model="scheduleForm.mode" :disabled="!scheduleForm.enabled">
            <el-radio value="interval">间隔启动</el-radio>
            <el-radio value="fixed">定点启动</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item v-if="scheduleForm.mode === 'interval'" label="时间间隔">
          <el-input-number 
            v-model="scheduleForm.interval.value" 
            :min="1" 
            :max="999"
            :disabled="!scheduleForm.enabled"
            style="width: 120px"
          />
          <el-select v-model="scheduleForm.interval.unit" :disabled="!scheduleForm.enabled" style="width: 100px; margin-left: 8px">
            <el-option value="minutes" label="分钟" />
            <el-option value="hours" label="小时" />
          </el-select>
        </el-form-item>
        
        <el-form-item v-if="scheduleForm.mode === 'fixed'" label="启动时间">
          <el-time-select
            v-model="scheduleForm.fixedTime"
            :disabled="!scheduleForm.enabled"
            start="00:00"
            step="00:30"
            end="23:30"
            placeholder="选择时间"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <el-button @click="scheduleDialogVisible = false">取消</el-button>
        <el-button 
          v-if="currentScheduleTask?.scheduledConfig?.enabled" 
          type="danger" 
          @click="handleClearSchedule(currentScheduleTask)"
        >
          取消定时
        </el-button>
        <el-button type="primary" :loading="scheduleDialogLoading" @click="handleSaveSchedule">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 20px;
  height: 100%;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-primary);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.header h2 {
  margin: 0;
  color: var(--text-primary);
  font-weight: 600;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 13px;
}

.status .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status.connected { 
  background: rgba(34, 197, 94, 0.15); 
  color: var(--accent-green); 
}
.status.connected .dot { 
  background: var(--accent-green); 
  box-shadow: 0 0 8px var(--accent-green);
}
.status.disconnected { 
  background: rgba(239, 68, 68, 0.15); 
  color: var(--accent-red); 
}
.status.disconnected .dot { background: var(--accent-red); }
.status.unknown { 
  background: rgba(100, 116, 139, 0.15); 
  color: var(--text-secondary); 
}
.status.unknown .dot { background: var(--text-muted); animation: blink 1s infinite; }

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* 统计卡片 */
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 20px;
  flex-shrink: 0;
}

.stat-card {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  padding: 16px;
  text-align: center;
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.stat-card:hover {
  border-color: var(--border-color-light);
  transform: translateY(-2px);
}

.stat-card .value {
  font-size: 28px;
  font-weight: 600;
  color: var(--accent-blue-light);
}

.stat-card .label {
  margin-top: 4px;
  color: var(--text-secondary);
  font-size: 13px;
}

/* 主内容区域：左右两列布局 */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: row;
  gap: 16px;
  min-height: 500px;
  height: 0;
  overflow: hidden;
  width: 100%;
}

/* 左侧嵌套卡片面板 */
.nested-cards-panel {
  width: 50px;
  min-width: 50px;
  max-width: 800px;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
}

/* 拖动调整条 */
.resize-handle {
  width: 6px;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  transition: background 0.2s;
  position: relative;
}

.resize-handle:hover,
.resize-handle.active {
  background: var(--accent-blue);
}

.resize-handle::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 2px;
  height: 30px;
  background: var(--border-color-light);
  border-radius: 1px;
}

.resize-handle:hover::before,
.resize-handle.active::before {
  background: var(--text-primary);
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

.panel-header .session-title {
  font-size: 12px;
  color: var(--text-secondary);
}

/* 面板主体 */
.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* ============ 任务卡片（外层）样式 ============ */
.task-cards-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-card-outer {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  border-left: 4px solid var(--text-muted);
  overflow: hidden;
  display: flex;
  flex-direction: row;
  gap: 0;
}

.task-card-outer.distributed { border-left-color: var(--accent-green); }
.task-card-outer.failed { border-left-color: var(--accent-red); }

/* 左侧：任务信息 */
.task-card-left {
  width: 45%;
  min-width: 180px;
  padding: 12px 14px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-card-left .task-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-card-left .task-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.task-card-left .task-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.task-card-left .task-desc {
  font-size: 12px;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.task-card-left .task-time {
  font-size: 11px;
  color: var(--text-muted);
}

.task-card-left .task-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

/* 右侧：Agent 卡片列表 */
.task-card-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ============ Agent 卡片（中层）样式 ============ */
.agent-cards-container {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.agent-card-nested {
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition: all 0.2s;
}

.agent-card-nested:hover {
  border-color: var(--border-color-light);
}

.agent-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.agent-card-header .avatar {
  width: 28px;
  height: 28px;
  min-width: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  overflow: hidden;
}

.agent-card-header .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agent-card-header .avatar-emoji {
  font-size: 16px;
  line-height: 1;
}

.agent-card-header .agent-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.agent-card-header .agent-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.agent-card-header .agent-model {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.agent-card-header .agent-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.agent-card-header .agent-status.online { 
  background: rgba(34, 197, 94, 0.2); 
  color: var(--accent-green); 
}
.agent-card-header .agent-status.offline { 
  background: rgba(100, 116, 139, 0.2); 
  color: var(--text-muted); 
}

/* ============ 会话卡片（内层）样式 ============ */
.session-cards-container {
  padding: 8px 12px 8px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: var(--bg-primary);
}

.session-card-nested {
  background: var(--bg-card);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.2s;
}

.session-card-nested:hover { 
  background: var(--bg-card-hover); 
  border-color: var(--accent-blue);
}

.session-card-nested.active { 
  background: var(--bg-card-hover); 
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
}

.session-card-nested.subagent { 
  background: rgba(245, 158, 11, 0.1); 
  border-left: 3px solid var(--accent-yellow);
}

.session-card-nested.subagent:hover { 
  background: rgba(245, 158, 11, 0.15); 
}

.session-card-nested.subagent.active { 
  background: rgba(245, 158, 11, 0.15); 
  border-color: var(--accent-yellow);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.3);
}

.session-card-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-size: 12px;
}

.session-card-content .session-name {
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.session-card-content .session-id {
  font-family: monospace;
  color: var(--text-muted);
  font-size: 11px;
  margin-left: auto;
}

/* 空状态提示 */
.no-agents, .no-sessions {
  padding: 10px 14px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
  font-style: italic;
}

.no-sessions {
  padding: 8px 12px;
  background: var(--bg-primary);
}

/* 消息面板样式 */
.messages-panel .panel-body {
  display: flex;
  flex-direction: column;
  padding: 0;
}

.empty-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  font-size: 13px;
}

.loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
}

.loading .is-loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
}

.messages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.5;
}

.message.user {
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid var(--accent-blue);
}

.message.assistant {
  background: rgba(34, 197, 94, 0.1);
  border-left: 3px solid var(--accent-green);
}

.message.system {
  background: rgba(100, 116, 139, 0.1);
  border-left: 3px solid var(--text-muted);
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.message-header .role {
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 12px;
}

.message-header .time {
  font-size: 11px;
  color: var(--text-muted);
}

.message-content {
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
}

/* 发送消息区域 */
.message-input-area {
  padding: 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-shrink: 0;
}

.message-input-area .el-textarea {
  margin-bottom: 8px;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-actions .hint {
  font-size: 11px;
  color: var(--text-muted);
}

/* 响应式 */
@media (max-width: 1200px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
  .main-content { 
    flex-direction: column;
  }
  .nested-cards-panel {
    width: 100%;
    max-width: none;
    min-height: 300px;
  }
  .messages-panel {
    min-width: 0;
    min-height: 400px;
  }
}

/* Agent 名称提示 */
.agent-mentions {
  margin-top: 8px;
}

.agent-mentions .mention-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.agent-mentions .mention-row:last-child {
  margin-bottom: 0;
}

.agent-mentions .hint {
  font-size: 12px;
  color: #909399;
}

.agent-mentions .selected-hint {
  color: #67c23a;
}

.agent-mentions .agent-tag {
  cursor: pointer;
  transition: all 0.2s;
}

.agent-mentions .agent-tag:hover {
  background: #409eff;
  color: #fff;
}

.agent-mentions .selected-tag {
  cursor: pointer;
}

.agent-mentions .selected-tag:hover {
  opacity: 0.8;
}

.agent-mentions .no-agent {
  font-size: 12px;
  color: #c0c4cc;
}
</style>