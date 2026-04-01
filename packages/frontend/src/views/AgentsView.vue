<script setup lang="ts">
import { onMounted, ref, computed, watch } from 'vue'
import { useAgentStore, type Agent } from '@/stores/agent'
import { ElMessage, ElMessageBox } from 'element-plus'
import axios from 'axios'

const agentStore = useAgentStore()

// 选中的 Agent
const selectedAgent = ref<Agent | null>(null)

// 创建弹窗
const createDialogVisible = ref(false)

// 文件列表（包含 exists 字段）
const mdFiles = ref<{ name: string; size: number; modified: string; exists: boolean }[]>([])
const currentFile = ref<string | null>(null)
const fileContent = ref<string>('')
const originalContent = ref<string>('')
const workspacePath = ref<string>('')

// 编辑相关
const editingAgent = ref<Partial<Agent> | null>(null)
const availableModels = ref<string[]>([])
const loadingModels = ref(false)
const loadingFiles = ref(false)
const savingFile = ref(false)
const startingSession = ref(false)
const hasChanges = computed(() => fileContent.value !== originalContent.value)

// Agent 间通信配置
const commConfigVisible = ref(false)
const commConfigLoading = ref(false)
const commConfigSaving = ref(false)
const commEnabled = ref(true)
const commAllowList = ref<string[]>([])

// 表单
const form = ref({
  id: '',
  name: '',
  description: '',
  model: '',
  systemPrompt: '',
  workspace: ''
})

// 计算 workspace 默认值
const defaultWorkspace = computed(() => {
  if (form.value.id) {
    const cleanId = form.value.id.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
    return `C:\\Users\\49541\\.openclaw-${cleanId}\\workspace`
  }
  return ''
})

// 获取 Agent 颜色
function getAgentColor(agentId: string) {
  const colors = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4']
  let hash = 0
  for (let i = 0; i < agentId.length; i++) {
    hash = agentId.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

onMounted(async () => {
  agentStore.fetchAgents()
  await fetchAvailableModels()
})

// 获取可用模型列表
async function fetchAvailableModels() {
  loadingModels.value = true
  try {
    const response = await axios.get('/api/agents/models')
    availableModels.value = response.data
    if (availableModels.value.length > 0 && !form.value.model) {
      form.value.model = availableModels.value[0]
    }
  } catch (e: any) {
    console.error('[fetchAvailableModels] Error:', e)
    availableModels.value = [
      'bailian/qwen3.5-plus',
      'bailian/qwen3-max-2026-01-23',
      'bailian/qwen3-coder-next',
      'bailian/qwen3-coder-plus',
      'bailian/MiniMax-M2.5',
      'bailian/glm-5',
      'bailian/glm-4.7',
      'bailian/kimi-k2.5'
    ]
  } finally {
    loadingModels.value = false
  }
}

// 选择 Agent
async function selectAgent(agent: Agent) {
  selectedAgent.value = agent
  editingAgent.value = { ...agent }
  form.value = {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    model: agent.model || availableModels.value[0] || '',
    systemPrompt: agent.systemPrompt || '',
    workspace: agent.workspace || ''
  }
  await fetchMdFiles()
}

// 获取 .md 文件列表
async function fetchMdFiles() {
  if (!selectedAgent.value) return
  
  loadingFiles.value = true
  try {
    const response = await axios.get(`/api/agents/${selectedAgent.value.id}/files`)
    mdFiles.value = response.data.files || []
    workspacePath.value = response.data.workspace || ''
    
    // 默认选中第一个文件
    if (mdFiles.value.length > 0 && !currentFile.value) {
      await loadFile(mdFiles.value[0].name)
    }
  } catch (e: any) {
    console.error('[fetchMdFiles] Error:', e)
    ElMessage.error('获取文件列表失败')
  } finally {
    loadingFiles.value = false
  }
}

// 加载文件内容
async function loadFile(fileName: string) {
  if (!selectedAgent.value) return
  
  // 检查文件是否存在
  const fileInfo = mdFiles.value.find(f => f.name === fileName)
  if (!fileInfo?.exists) {
    ElMessage.warning('该文件不存在')
    return
  }
  
  // 如果有未保存的修改，提示用户
  if (hasChanges.value && currentFile.value) {
    try {
      await ElMessageBox.confirm(
        '当前文件有未保存的修改，是否放弃修改？',
        '提示',
        {
          confirmButtonText: '放弃修改',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
    } catch {
      return
    }
  }
  
  loadingFiles.value = true
  try {
    const response = await axios.get(`/api/agents/${selectedAgent.value.id}/files/${fileName}`)
    currentFile.value = fileName
    fileContent.value = response.data.content
    originalContent.value = response.data.content
  } catch (e: any) {
    console.error('[loadFile] Error:', e)
    ElMessage.error('加载文件失败')
  } finally {
    loadingFiles.value = false
  }
}

// 保存文件
async function saveFile() {
  if (!selectedAgent.value || !currentFile.value) return
  
  savingFile.value = true
  try {
    await axios.put(`/api/agents/${selectedAgent.value.id}/files/${currentFile.value}`, {
      content: fileContent.value
    })
    originalContent.value = fileContent.value
    ElMessage.success('文件保存成功')
  } catch (e: any) {
    console.error('[saveFile] Error:', e)
    ElMessage.error('保存文件失败')
  } finally {
    savingFile.value = false
  }
}

// 重置文件
function resetFile() {
  fileContent.value = originalContent.value
}

// 创建 Agent
function openCreateDialog() {
  selectedAgent.value = null
  editingAgent.value = null
  form.value = {
    id: '',
    name: '',
    description: '',
    model: availableModels.value[0] || 'bailian/glm-5',
    systemPrompt: '',
    workspace: ''
  }
  createDialogVisible.value = true
}

// 当 ID 改变时自动更新 workspace
function onIdChange() {
  if (!editingAgent.value && !form.value.workspace) {
    form.value.workspace = defaultWorkspace.value
  }
}

// 提交创建 Agent
async function handleCreateAgent() {
  try {
    // 创建时，如果没有填写 workspace，使用默认值
    if (!form.value.workspace) {
      form.value.workspace = defaultWorkspace.value
    }
    await agentStore.createAgent(form.value)
    ElMessage.success('Agent 创建成功')
    createDialogVisible.value = false
    // 刷新列表
    await agentStore.fetchAgents()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || e.message || '创建失败')
  }
}

// 更新 Agent
async function handleUpdateAgent() {
  if (!selectedAgent.value) return
  
  try {
    await agentStore.updateAgent(selectedAgent.value.id, {
      name: form.value.name,
      description: form.value.description,
      model: form.value.model,
      systemPrompt: form.value.systemPrompt,
      workspace: form.value.workspace
    })
    ElMessage.success('Agent 更新成功')
    // 更新选中的 agent
    if (editingAgent.value) {
      editingAgent.value = { ...editingAgent.value, ...form.value }
    }
  } catch (e: any) {
    ElMessage.error(e.response?.data?.error || e.message || '更新失败')
  }
}

// 删除 Agent
async function handleDelete(agent: Agent) {
  try {
    await ElMessageBox.confirm(
      `确定要删除 Agent "${agent.name}" 吗？删除后需要重启 Gateway 才能生效。`,
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    await agentStore.deleteAgent(agent.id)
    ElMessage.success('Agent 删除成功，请重启 Gateway')
    if (selectedAgent.value?.id === agent.id) {
      selectedAgent.value = null
      currentFile.value = null
      fileContent.value = ''
    }
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.response?.data?.error || e.message || '删除失败')
    }
  }
}

// 启动 Agent 会话
async function handleStartSession() {
  if (!selectedAgent.value) return
  
  try {
    const { value: message } = await ElMessageBox.prompt(
      '输入首次对话消息（可选，默认为问候语）',
      '启动 Agent 会话',
      {
        confirmButtonText: '启动',
        cancelButtonText: '取消',
        inputPlaceholder: '你好，请介绍一下你自己。',
        inputType: 'textarea'
      }
    ).catch(() => ({ value: null }))
    
    if (message === null) return // 用户取消
    
    startingSession.value = true
    
    const response = await axios.post(`/api/agents/${selectedAgent.value.id}/start-session`, {
      message: message || '你好，请介绍一下你自己。'
    })
    
    if (response.data.success) {
      ElMessage.success(`会话已启动: ${response.data.sessionKey}`)
      // 刷新会话列表
      await agentStore.fetchAgents()
    }
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(e.response?.data?.error || e.message || '启动会话失败')
    }
  } finally {
    startingSession.value = false
  }
}

// 打开 Agent 间通信配置弹窗
async function openCommConfigDialog() {
  commConfigVisible.value = true
  commConfigLoading.value = true
  
  try {
    const response = await axios.get('/api/agents/communication-config')
    commEnabled.value = response.data.enabled ?? true
    commAllowList.value = response.data.allowList || []
  } catch (e: any) {
    console.error('[Comm Config GET] Error:', e)
    ElMessage.error('获取配置失败')
  } finally {
    commConfigLoading.value = false
  }
}

// 保存 Agent 间通信配置
async function saveCommConfig() {
  commConfigSaving.value = true
  
  try {
    const response = await axios.put('/api/agents/communication-config', {
      enabled: commEnabled.value,
      allowList: commAllowList.value
    })
    
    if (response.data.success) {
      ElMessage.success('配置已保存，需要重启 Gateway 生效')
      commConfigVisible.value = false
    }
  } catch (e: any) {
    console.error('[Comm Config PUT] Error:', e)
    ElMessage.error(e.response?.data?.error || '保存失败')
  } finally {
    commConfigSaving.value = false
  }
}

// 全选/取消全选所有 Agent
function toggleAllAgents() {
  if (commAllowList.value.length === agentStore.agents.length) {
    commAllowList.value = []
  } else {
    commAllowList.value = agentStore.agents.map(a => a.id)
  }
}
</script>

<template>
  <div class="agents-view">
    <header class="content-header">
      <h2>Agent 管理</h2>
    </header>

    <div class="content-body">
      <el-row :gutter="20" class="full-height">
        <!-- 左栏：Agent 列表 -->
        <el-col :span="6" class="left-panel">
          <div class="panel-header">
            <span class="panel-title">Agent 列表</span>
            <div class="panel-actions">
              <el-button size="small" @click="openCommConfigDialog">
                <el-icon><Connection /></el-icon>
                通信配置
              </el-button>
              <el-button type="primary" size="small" @click="openCreateDialog">
                <el-icon><Plus /></el-icon>
                创建
              </el-button>
            </div>
          </div>
          
          <div class="agent-list">
            <div
              v-for="agent in agentStore.agents"
              :key="agent.id"
              :class="['agent-item', { active: selectedAgent?.id === agent.id }]"
              @click="selectAgent(agent)"
            >
              <div class="agent-avatar" :style="(agent.emoji || agent.avatar) ? {} : { background: getAgentColor(agent.id) }">
                <span v-if="agent.emoji" class="avatar-emoji">{{ agent.emoji }}</span>
                <img v-else-if="agent.avatar" :src="agent.avatar" :alt="agent.name" class="avatar-img" />
                <span v-else>{{ agent.name.charAt(0).toUpperCase() }}</span>
              </div>
              <div class="agent-info">
                <div class="agent-name">
                  {{ agent.name }}
                  <span v-if="agent.id === 'main'" class="default-tag">默认</span>
                </div>
                <div class="agent-status">
                  <span :class="['status-dot', agent.status]"></span>
                  <span class="status-text">{{ agent.status }}</span>
                  <el-icon v-if="agent.hasActiveSession" class="session-icon" title="有活跃会话">
                    <ChatDotRound />
                  </el-icon>
                </div>
              </div>
            </div>
            
            <div v-if="agentStore.agents.length === 0" class="empty-list">
              暂无 Agent
            </div>
          </div>
        </el-col>

        <!-- 右栏：Agent 详情 / 编辑 -->
        <el-col :span="18" class="right-panel">
          <!-- 未选中 Agent 时显示创建表单或空状态 -->
          <template v-if="!selectedAgent">
            <div v-if="!form.id" class="empty-state">
              <el-icon :size="48"><User /></el-icon>
              <p>选择左侧的 Agent 查看详情</p>
              <p>或点击"创建"按钮创建新 Agent</p>
            </div>
            
            <!-- 创建新 Agent 表单 -->
            <div v-else class="create-form">
              <h3>创建新 Agent</h3>
              
              <el-form :model="form" label-width="100px" class="detail-form">
                <el-form-item label="Agent ID">
                  <el-input 
                    v-model="form.id" 
                    placeholder="输入 Agent ID（字母、数字、下划线、连字符）"
                    @input="onIdChange"
                  >
                    <template #append>
                      <el-tooltip content="Agent ID 用于标识 Agent，创建后不可修改" placement="top">
                        <el-icon><QuestionFilled /></el-icon>
                      </el-tooltip>
                    </template>
                  </el-input>
                </el-form-item>
                
                <el-form-item label="描述">
                  <el-input v-model="form.description" type="textarea" :rows="2" placeholder="Agent 描述" />
                </el-form-item>
                
                <el-form-item label="模型">
                  <el-select 
                    v-model="form.model" 
                    placeholder="选择模型" 
                    :loading="loadingModels"
                    style="width: 100%"
                  >
                    <el-option
                      v-for="model in availableModels"
                      :key="model"
                      :label="model"
                      :value="model"
                    />
                  </el-select>
                </el-form-item>
                
                <el-form-item label="工作目录">
                  <el-input v-model="form.workspace" :placeholder="defaultWorkspace || 'Agent 工作目录'" />
                </el-form-item>
                
                <el-form-item>
                  <el-button type="primary" @click="handleCreateAgent" :loading="agentStore.loading">
                    创建 Agent
                  </el-button>
                  <el-button @click="form.id = ''">取消</el-button>
                </el-form-item>
              </el-form>
            </div>
          </template>
          
          <!-- 选中 Agent 时显示详情 -->
          <template v-else>
            <div class="detail-header">
              <div class="detail-title">
                <h3>{{ editingAgent?.name || selectedAgent.name }}</h3>
                <div class="detail-actions">
                  <el-button 
                    v-if="!selectedAgent.hasActiveSession"
                    type="success" 
                    size="small" 
                    @click="handleStartSession"
                    :loading="startingSession"
                  >
                    <el-icon><ChatDotRound /></el-icon>
                    启动对话
                  </el-button>
                  <el-button 
                    v-else
                    type="info" 
                    size="small" 
                    plain
                    @click="handleStartSession"
                    :loading="startingSession"
                  >
                    <el-icon><ChatDotRound /></el-icon>
                    已启动
                  </el-button>
                  <el-button type="danger" size="small" @click="handleDelete(selectedAgent)">
                    <el-icon><Delete /></el-icon>
                    删除
                  </el-button>
                </div>
              </div>
            </div>
            
            <div class="detail-body">
              <!-- Agent 基本信息 -->
              <el-form :model="form" label-width="100px" class="detail-form">
                <el-row :gutter="20">
                  <el-col :span="12">
                    <el-form-item label="Agent ID">
                      <el-input v-model="selectedAgent.id" disabled />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="名称">
                      <el-input v-model="form.name" placeholder="Agent 名称" />
                    </el-form-item>
                  </el-col>
                </el-row>
                
                <el-row :gutter="20">
                  <el-col :span="12">
                    <el-form-item label="模型">
                      <el-select 
                        v-model="form.model" 
                        placeholder="选择模型" 
                        :loading="loadingModels"
                        style="width: 100%"
                      >
                        <el-option
                          v-for="model in availableModels"
                          :key="model"
                          :label="model"
                          :value="model"
                        />
                      </el-select>
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="状态">
                      <div class="status-display">
                        <span :class="['status-dot', selectedAgent.status]"></span>
                        <span>{{ selectedAgent.status }}</span>
                      </div>
                    </el-form-item>
                  </el-col>
                </el-row>
                
                <el-form-item label="描述">
                  <el-input v-model="form.description" type="textarea" :rows="2" placeholder="Agent 描述" />
                </el-form-item>
                
                <el-form-item label="工作目录">
                  <el-input v-model="form.workspace" disabled placeholder="Agent 工作目录" />
                </el-form-item>
                
                <el-form-item>
                  <el-button type="primary" @click="handleUpdateAgent" :loading="agentStore.loading">
                    保存修改
                  </el-button>
                </el-form-item>
              </el-form>
              
              <!-- .md 文件编辑区域 -->
              <div class="md-editor-section">
                <div class="section-header">
                  <h4>.md 文件编辑</h4>
                  <div class="file-tabs">
                    <el-tooltip 
                      v-for="file in mdFiles" 
                      :key="file.name"
                      :content="file.exists ? file.name : '文件不存在'"
                      placement="top"
                    >
                      <el-button
                        :type="currentFile === file.name ? 'primary' : 'default'"
                        :class="{ 'file-missing': !file.exists }"
                        :disabled="!file.exists"
                        size="small"
                        @click="loadFile(file.name)"
                      >
                        {{ file.name }}
                        <el-icon v-if="!file.exists" style="margin-left: 4px"><Warning /></el-icon>
                      </el-button>
                    </el-tooltip>
                  </div>
                </div>
                
                <div v-if="workspacePath" class="workspace-path">
                  工作目录: {{ workspacePath }}
                </div>
                
                <div v-if="loadingFiles" class="loading-area">
                  <el-icon class="is-loading"><Loading /></el-icon>
                  <span>加载中...</span>
                </div>
                
                <template v-else-if="currentFile">
                  <div class="editor-container">
                    <textarea
                      v-model="fileContent"
                      class="md-editor"
                      placeholder="Markdown 内容"
                    ></textarea>
                  </div>
                  
                  <div class="editor-actions">
                    <el-button 
                      type="primary" 
                      @click="saveFile" 
                      :loading="savingFile"
                      :disabled="!hasChanges"
                    >
                      <el-icon><DocumentChecked /></el-icon>
                      保存
                    </el-button>
                    <el-button 
                      @click="resetFile"
                      :disabled="!hasChanges"
                    >
                      <el-icon><RefreshRight /></el-icon>
                      重置
                    </el-button>
                    <span v-if="hasChanges" class="unsaved-tip">有未保存的修改</span>
                  </div>
                </template>
                
                <div v-else-if="mdFiles.length === 0" class="no-files">
                  <p>该 Agent 暂无 .md 文件</p>
                </div>
              </div>
            </div>
          </template>
        </el-col>
      </el-row>
    </div>
    
    <!-- 创建 Agent 弹窗 -->
    <el-dialog
      v-model="createDialogVisible"
      title="创建新 Agent"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="100px">
        <el-form-item label="Agent ID" required>
          <el-input 
            v-model="form.id" 
            placeholder="只能包含字母、数字、下划线或连字符"
            @input="onIdChange"
          />
          <div class="form-tip">唯一标识符，创建后不可修改</div>
        </el-form-item>
        
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="Agent 显示名称（可选）" />
        </el-form-item>
        
        <el-form-item label="模型" required>
          <el-select v-model="form.model" style="width: 100%">
            <el-option 
              v-for="model in availableModels" 
              :key="model" 
              :value="model" 
              :label="model"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="描述">
          <el-input 
            v-model="form.description" 
            type="textarea" 
            :rows="2" 
            placeholder="Agent 功能描述（可选）" 
          />
        </el-form-item>
        
        <el-form-item label="工作目录">
          <el-input v-model="form.workspace" placeholder="留空使用默认目录">
            <template #append>
              <el-button @click="form.workspace = defaultWorkspace">默认</el-button>
            </template>
          </el-input>
          <div class="form-tip" v-if="defaultWorkspace">默认: {{ defaultWorkspace }}</div>
        </el-form-item>
        
        <el-alert 
          type="info" 
          :closable="false"
          style="margin-top: 10px"
        >
          <template #title>
            创建后将自动生成 IDENTITY.md、SOUL.md、USER.md 等模板文件
          </template>
        </el-alert>
      </el-form>
      
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button 
          type="primary" 
          :disabled="!form.id || !form.model"
          @click="handleCreateAgent"
        >
          创建
        </el-button>
      </template>
    </el-dialog>
    
    <!-- Agent 间通信配置弹窗 -->
    <el-dialog
      v-model="commConfigVisible"
      title="Agent 间通信配置"
      width="500px"
      :close-on-click-modal="false"
    >
      <div v-if="commConfigLoading" class="loading-area">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span>加载中...</span>
      </div>
      
      <template v-else>
        <el-form label-width="100px">
          <el-form-item label="启用通信">
            <el-switch v-model="commEnabled" />
            <div class="form-tip">允许 Agent 之间直接发送消息</div>
          </el-form-item>
          
          <el-form-item label="允许列表">
            <div class="allow-list-header">
              <el-button size="small" link @click="toggleAllAgents">
                {{ commAllowList.length === agentStore.agents.length ? '取消全选' : '全选' }}
              </el-button>
              <span class="selected-count">已选 {{ commAllowList.length }} 个</span>
            </div>
            <el-checkbox-group v-model="commAllowList" class="allow-list">
              <el-checkbox 
                v-for="agent in agentStore.agents" 
                :key="agent.id" 
                :label="agent.id"
                :value="agent.id"
              >
                {{ agent.name }}
                <el-tag v-if="agent.id === 'main'" size="small" type="success">默认</el-tag>
              </el-checkbox>
            </el-checkbox-group>
          </el-form-item>
        </el-form>
        
        <el-alert type="warning" :closable="false" style="margin-top: 10px">
          <template #title>
            配置保存后需要重启 Gateway 才能生效
          </template>
        </el-alert>
      </template>
      
      <template #footer>
        <el-button @click="commConfigVisible = false">取消</el-button>
        <el-button 
          type="primary" 
          :loading="commConfigSaving"
          @click="saveCommConfig"
        >
          保存配置
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.agents-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.content-body {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  margin: 20px;
  border: 1px solid var(--border-color);
  flex: 1;
  overflow: hidden;
}

.full-height {
  height: 100%;
}

.left-panel {
  height: 100%;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.panel-actions {
  display: flex;
  gap: 8px;
}

.agent-list {
  flex: 1;
  overflow-y: auto;
}

.agent-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  gap: 12px;
}

.agent-item:hover {
  background-color: var(--bg-card-hover);
}

.agent-item.active {
  background-color: var(--bg-card-hover);
  border-left: 3px solid var(--accent-blue);
}

.agent-avatar {
  width: 36px;
  height: 36px;
  min-width: 36px;
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

.agent-avatar .avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.agent-avatar .avatar-emoji {
  font-size: 20px;
  line-height: 1;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-weight: 500;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
}

.default-tag {
  font-size: 12px;
  padding: 1px 6px;
  background: rgba(34, 197, 94, 0.2);
  color: var(--accent-green);
  border-radius: var(--radius-sm);
}

.agent-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.session-icon {
  color: var(--accent-green);
  margin-left: 4px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.online {
  background-color: var(--accent-green);
  box-shadow: 0 0 8px var(--accent-green);
}

.status-dot.offline {
  background-color: var(--text-muted);
}

.status-dot.busy {
  background-color: var(--accent-yellow);
}

.empty-list {
  padding: 40px 16px;
  text-align: center;
  color: var(--text-secondary);
}

.right-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.empty-state p {
  margin: 8px 0;
}

.create-form {
  padding: 24px;
  max-width: 600px;
}

.create-form h3 {
  margin-bottom: 24px;
  color: var(--text-primary);
}

.detail-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
}

.detail-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-title h3 {
  margin: 0;
  color: var(--text-primary);
}

.detail-actions {
  display: flex;
  gap: 8px;
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.detail-form {
  margin-bottom: 24px;
}

.status-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.md-editor-section {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.section-header {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-header h4 {
  margin: 0;
  font-size: 14px;
  color: var(--text-primary);
}

.file-tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.file-tabs .el-button.file-missing {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: var(--bg-secondary);
  color: var(--text-muted);
  border-color: var(--border-color);
}

.file-tabs .el-button.file-missing:hover {
  background-color: var(--bg-secondary);
  color: var(--text-muted);
  border-color: var(--border-color);
}

.workspace-path {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--text-muted);
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}

.loading-area {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.editor-container {
  padding: 16px;
}

.md-editor {
  width: 100%;
  min-height: 400px;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  background: var(--bg-input);
  color: var(--text-primary);
}

.md-editor:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.editor-actions {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 12px;
}

.unsaved-tip {
  color: var(--accent-yellow);
  font-size: 12px;
}

.no-files {
  padding: 40px;
  text-align: center;
  color: var(--text-secondary);
}

.form-tip {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}

/* Agent 间通信配置 */
.allow-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.selected-count {
  font-size: 12px;
  color: var(--text-muted);
}

.allow-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.allow-list .el-checkbox {
  display: flex;
  align-items: center;
  height: auto;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-radius: var(--radius-sm);
  margin: 0;
}

.allow-list .el-checkbox:hover {
  background: var(--bg-card-hover);
}
</style>