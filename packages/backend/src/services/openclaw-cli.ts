import { exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import os from 'os'
import { getCachedDataDir } from './config.js'

const execAsync = promisify(exec)

// 缓存结果，60秒内不重复调用
let cachedAgents: any[] = []
let cachedSessions: any[] = []
let lastFetch = 0
const CACHE_TTL = 60000 // 60秒

// 🔒 安全修复：不再硬编码路径，使用配置模块动态获取
const getOpenClawDataDir = getCachedDataDir

// 消息数量缓存
const messageCountCache: Map<string, { count: number, timestamp: number }> = new Map()
const MESSAGE_COUNT_TTL = 30000 // 30秒缓存

/**
 * 调用 OpenClaw CLI 的封装
 */
async function callOpenClawCli(args: string, timeoutMs: number = 120000): Promise<any> {
  try {
    console.log(`[OpenClaw CLI] Running: openclaw ${args}`)
    const { stdout, stderr } = await execAsync(`openclaw ${args}`, { 
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    })
    
    // 优先返回 stdout，如果为空则返回 stderr
    if (stdout && stdout.trim()) {
      return stdout
    }
    if (stderr && stderr.trim()) {
      return stderr
    }
    return null
  } catch (error: any) {
    console.error('[OpenClaw CLI] Error:', error.message)
    // 如果有 stdout 或 stderr，尝试返回
    if (error.stdout && error.stdout.trim()) {
      return error.stdout
    }
    if (error.stderr && error.stderr.trim()) {
      return error.stderr
    }
    return null
  }
}

/**
 * 读取 JSONL 文件并解析消息
 */
function readSessionJsonl(sessionFilePath: string, limit: number = 50): any[] {
  const messages: any[] = []
  
  try {
    if (!fs.existsSync(sessionFilePath)) {
      console.warn('[sessions_history] Session file not found:', sessionFilePath)
      return messages
    }
    
    const content = fs.readFileSync(sessionFilePath, 'utf-8')
    const lines = content.trim().split('\n')
    
    for (const line of lines) {
      if (!line.trim()) continue
      
      try {
        const record = JSON.parse(line)
        
        // 只处理 message 类型的记录
        if (record.type === 'message' && record.message) {
          const msg = record.message
          let content = ''
          
          if (Array.isArray(msg.content)) {
            // 从数组中提取 text 字段
            content = msg.content
              .map((c: any) => {
                if (c.type === 'text') return c.text || ''
                if (c.type === 'toolCall') return '[tool call]'
                return ''
              })
              .join('')
          } else if (typeof msg.content === 'string') {
            content = msg.content
          }
          
          messages.push({
            id: record.id,
            role: msg.role || 'assistant',
            content: content,
            timestamp: record.timestamp || new Date().toISOString()
          })
        }
      } catch (e) {
        // 跳过解析错误的行
        continue
      }
    }
    
    // 返回最新的消息（倒序）
    return messages.slice(-limit).reverse()
  } catch (error: any) {
    console.error('[sessions_history] Read error:', error.message)
    return messages
  }
}

/**
 * 从 sessions.json 获取实际的 session ID (UUID)
 */
function getSessionIdFromKey(agentId: string, sessionKey: string): string | null {
  try {
    const OPENCLAW_DATA_DIR = getOpenClawDataDir()
    const sessionsJsonPath = path.join(
      OPENCLAW_DATA_DIR,
      'agents',
      agentId,
      'sessions',
      'sessions.json'
    )
    
    if (!fs.existsSync(sessionsJsonPath)) {
      return null
    }
    
    const sessionsJson = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf-8'))
    
    // 遍历 sessions.json 的键，查找匹配的 key
    for (const [key, value] of Object.entries(sessionsJson)) {
      if (key === sessionKey) {
        const sessionData = value as any
        return sessionData.sessionId || null
      }
    }
    
    // 如果完全匹配失败，尝试处理截断的 key（如 agent:dev:subage...0151b4）
    if (sessionKey.includes('...')) {
      // 提取截断 key 的前缀和后缀
      const prefixMatch = sessionKey.match(/^(.+)\.\.\.(.+)$/)
      if (prefixMatch) {
        const truncatedPrefix = prefixMatch[1]  // 如 "agent:dev:subage"
        const suffix = prefixMatch[2]  // 如 "0151b4"
        
        for (const [key, value] of Object.entries(sessionsJson)) {
          // 检查 key 是否以 suffix 结尾（session UUID 的最后几位）
          if (key.endsWith(suffix)) {
            const sessionData = value as any
            return sessionData.sessionId || key.split(':').pop() || null
          }
        }
      }
    }
    
    return null
  } catch (error: any) {
    console.error('[getSessionIdFromKey] Error:', error.message)
    return null
  }
}

/**
 * 获取会话列表
 */
export async function sessions_list(filters?: { activeMinutes?: number; kinds?: string[]; limit?: number }) {
  const now = Date.now()
  
  // 检查缓存
  if (cachedSessions.length > 0 && (now - lastFetch) < CACHE_TTL) {
    return cachedSessions
  }
  
  try {
    // 使用 --all-agents 获取所有 agent 的会话
    const output = await callOpenClawCli('sessions --all-agents')
    
    if (!output) {
      return cachedSessions
    }
    
    // 解析输出 (--all-agents 格式)
    const sessions: any[] = []
    const lines = output.split('\n')
    
    for (const line of lines) {
      // 跳过表头和空行
      if (!line.includes('direct') || line.startsWith('Agent') || line.startsWith('-')) {
        continue
      }
      
      // 解析格式: Agent Kind Key Age Model Tokens Flags
      const parts = line.trim().split(/\s+/)
      if (parts.length >= 5) {
        const agent = parts[0]
        const kind = parts[1]
        const displayKey = parts[2]  // CLI 显示的 key（可能被截断）
        const age = parts[3]
        const model = parts[4]
        
        // 从 sessions.json 获取真实的 session UUID 和完整 key
        const { sessionId, fullKey } = getFullSessionKey(agent, displayKey)
        
        sessions.push({
          key: fullKey || displayKey,
          kind,
          age,
          model,
          agentId: agent,
          sessionId
        })
      }
    }
    
    if (sessions.length > 0) {
      cachedSessions = sessions
      lastFetch = now
    }
    
    return cachedSessions
  } catch (error) {
    return cachedSessions
  }
}

/**
 * 从 sessions.json 获取完整的 session key
 */
function getFullSessionKey(agentId: string, displayKey: string): { sessionId: string | null; fullKey: string | null } {
  try {
    const OPENCLAW_DATA_DIR = getOpenClawDataDir()
    const sessionsJsonPath = path.join(
      OPENCLAW_DATA_DIR,
      'agents',
      agentId,
      'sessions',
      'sessions.json'
    )
    
    if (!fs.existsSync(sessionsJsonPath)) {
      return { sessionId: null, fullKey: null }
    }
    
    const sessionsJson = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf-8'))
    
    // 1. 尝试完全匹配
    if (sessionsJson[displayKey]) {
      const sessionData = sessionsJson[displayKey] as any
      return { 
        sessionId: sessionData.sessionId || displayKey.split(':').pop() || null, 
        fullKey: displayKey 
      }
    }
    
    // 2. 处理截断的 key（如 agent:test-agent...0b2bfd）
    if (displayKey.includes('...')) {
      // 提取截断后的后缀（UUID 的最后几位）
      const parts = displayKey.split('...')
      const suffix = parts.length > 1 ? parts[parts.length - 1] : null
      
      if (suffix) {
        // 遍历 sessions.json 中的所有 key，查找以 suffix 结尾的
        for (const [key, value] of Object.entries(sessionsJson)) {
          // 检查 key 是否以 suffix 结尾
          if (key.endsWith(suffix)) {
            const sessionData = value as any
            return { 
              sessionId: sessionData.sessionId || key.split(':').pop() || null, 
              fullKey: key  // 返回完整的 key
            }
          }
        }
      }
    }
    
    return { sessionId: null, fullKey: null }
  } catch (error: any) {
    console.error('[getFullSessionKey] Error:', error.message)
    return { sessionId: null, fullKey: null }
  }
}

/**
 * 获取单个会话的详细信息
 */
export async function getSessionInfo(sessionKey: string) {
  try {
    const OPENCLAW_DATA_DIR = getOpenClawDataDir()
    
    // 从 gateway health 获取 session 路径
    const output = await callOpenClawCli('gateway call health --json')
    const health = JSON.parse(output || '{}')
    
    if (!health.agents) return null
    
    // 解析 session key: agent:dev:main -> agentId: dev
    const parts = sessionKey.split(':')
    const agentId = parts[1]
    
    // 从 sessions.json 获取实际的 session UUID
    const actualSessionId = getSessionIdFromKey(agentId, sessionKey)
    
    console.log('[getSessionInfo] Looking for:', { sessionKey, agentId, actualSessionId })
    
    // 查找对应 agent 的 session
    for (const agent of health.agents) {
      if (agent.agentId === agentId && agent.sessions) {
        for (const recent of agent.sessions.recent || []) {
          if (recent.key === sessionKey) {
            const sessionFile = path.join(
              OPENCLAW_DATA_DIR,
              'agents',
              agentId,
              'sessions',
              `${actualSessionId}.jsonl`
            )
            console.log('[getSessionInfo] Found session file:', sessionFile)
            
            return {
              key: recent.key,
              sessionId: actualSessionId,
              agentId: agentId,
              sessionFile: sessionFile,
              updatedAt: recent.updatedAt,
              age: recent.age
            }
          }
        }
      }
    }
    
    console.log('[getSessionInfo] Session not found')
    return null
  } catch (error: any) {
    console.error('[getSessionInfo] Error:', error.message)
    return null
  }
}

// Gateway health 缓存
let cachedHealth: any = null
let healthCacheTime = 0
const HEALTH_CACHE_TTL = 60000 // 60秒

async function getCachedHealth() {
  const now = Date.now()
  if (cachedHealth && (now - healthCacheTime) < HEALTH_CACHE_TTL) {
    return cachedHealth
  }
  const output = await callOpenClawCli('gateway call health --json')
  cachedHealth = JSON.parse(output || '{}')
  healthCacheTime = now
  return cachedHealth
}

/**
 * 获取会话消息数量（带缓存）
 */
export async function getMessageCount(sessionKey: string): Promise<number> {
  const now = Date.now()
  
  // 检查缓存
  const cached = messageCountCache.get(sessionKey)
  if (cached && (now - cached.timestamp) < MESSAGE_COUNT_TTL) {
    return cached.count
  }
  
  try {
    const OPENCLAW_DATA_DIR = getOpenClawDataDir()
    
    // 从 sessions.json 直接获取 sessionFile
    const parts = sessionKey.split(':')
    const agentId = parts[1]
    const sessionId = getSessionIdFromKey(agentId, sessionKey)
    
    if (!sessionId) {
      return 0
    }
    
    const sessionFile = path.join(
      OPENCLAW_DATA_DIR,
      'agents',
      agentId,
      'sessions',
      `${sessionId}.jsonl`
    )
    
    if (!fs.existsSync(sessionFile)) {
      return 0
    }
    
    const content = fs.readFileSync(sessionFile, 'utf-8')
    const lines = content.trim().split('\n')
    
    let count = 0
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const record = JSON.parse(line)
        if (record.type === 'message') {
          count++
        }
      } catch (e) {
        continue
      }
    }
    
    // 更新缓存
    messageCountCache.set(sessionKey, { count, timestamp: now })
    
    return count
  } catch (error: any) {
    console.error('[getMessageCount] Error:', error.message)
    return 0
  }
}

/**
 * 从 IDENTITY.md 解析 avatar 字段
 */
function parseAvatarFromIdentity(identityPath: string): string | null {
  try {
    if (!fs.existsSync(identityPath)) {
      return null
    }
    
    const content = fs.readFileSync(identityPath, 'utf-8')
    
    // 匹配 avatar 字段: - **Avatar:** <value> 或 - Avatar: <value>
    const avatarMatch = content.match(/[-*]\s*\**Avatar:\**\s*(.+)/i)
    if (avatarMatch) {
      const avatar = avatarMatch[1].trim()
      // 返回非空的 avatar
      if (avatar && avatar.length > 0) {
        return avatar
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

/**
 * 从 IDENTITY.md 解析 emoji 字段
 */
function parseEmojiFromIdentity(identityPath: string): string | null {
  try {
    if (!fs.existsSync(identityPath)) {
      return null
    }
    
    const content = fs.readFileSync(identityPath, 'utf-8')
    
    // 匹配 emoji 字段: - **Emoji:** 🐯 或 - Emoji: 🐯
    const emojiMatch = content.match(/[-*]\s*\**Emoji:\**\s*(.+)/i)
    if (emojiMatch) {
      const emoji = emojiMatch[1].trim()
      // 返回非空的 emoji（通常是单个字符或 emoji 序列）
      if (emoji && emoji.length > 0) {
        return emoji
      }
    }
    
    return null
  } catch (error) {
    return null
  }
}

/**
 * 获取 Agent 列表
 */
export async function agents_list() {
  const now = Date.now()
  
  // 检查缓存
  if (cachedAgents.length > 0 && (now - lastFetch) < CACHE_TTL) {
    return cachedAgents
  }
  
  try {
    const output = await callOpenClawCli('agents')
    
    if (!output) {
      return cachedAgents
    }
    
    // 🔒 安全修复：使用 os.homedir() 替代硬编码用户路径
    const homeDir = os.homedir()
    const OPENCLAW_DATA_DIR = getOpenClawDataDir()
    
    // 解析文本输出
    const agents: any[] = []
    const lines = output.split('\n')
    let currentAgent = ''
    
    for (const line of lines) {
      // 匹配 Agent 名称行: - main (default) 或 - test-agent
      const nameMatch = line.match(/^- ([\w-]+)/)
      if (nameMatch) {
        currentAgent = nameMatch[1]
        agents.push({
          id: currentAgent,
          name: currentAgent,
          description: '',
          status: 'online',
          workspace: '',
          model: '',
          avatar: null
        })
      }
      
      // 匹配 Identity 行
      const identityMatch = line.match(/Identity:\s*(.+)/)
      if (identityMatch && currentAgent) {
        const idx = agents.findIndex(a => a.id === currentAgent)
        if (idx >= 0) {
          agents[idx].description = identityMatch[1].trim()
        }
      }
      
      // 匹配 Workspace 行 - 🔒 使用 os.homedir() 替代硬编码
      const workspaceMatch = line.match(/Workspace:\s*(.+)/)
      if (workspaceMatch && currentAgent) {
        const idx = agents.findIndex(a => a.id === currentAgent)
        if (idx >= 0) {
          // 使用 os.homedir() 替代硬编码路径
          let ws = workspaceMatch[1].trim()
          ws = ws.replace('~', homeDir)
          agents[idx].workspace = ws
          
          // 尝试从 IDENTITY.md 读取 avatar 和 emoji
          const identityPath = path.join(ws, 'IDENTITY.md')
          const avatar = parseAvatarFromIdentity(identityPath)
          if (avatar) {
            agents[idx].avatar = avatar
          }
          const emoji = parseEmojiFromIdentity(identityPath)
          if (emoji) {
            agents[idx].emoji = emoji
          }
        }
      }
      
      // 匹配 Model 行
      const modelMatch = line.match(/Model:\s*(.+)/)
      if (modelMatch && currentAgent) {
        const idx = agents.findIndex(a => a.id === currentAgent)
        if (idx >= 0) {
          agents[idx].model = modelMatch[1].trim()
        }
      }
    }
    
    if (agents.length > 0) {
      cachedAgents = agents
      lastFetch = now
    }
    
    return cachedAgents
  } catch (error) {
    return cachedAgents
  }
}

/**
 * 获取子 Agent 列表
 */
export async function subagents() {
  return []
}

/**
 * 创建新会话并启动 Agent
 */
export async function sessions_spawn(config: {
  agentId: string
  task?: string
  message: string
  model?: string
  thinking?: string
  runtime?: string
  cwd?: string
  label?: string
}): Promise<{ sessionKey: string; status: string }> {
  try {
    console.log(`[sessions_spawn] Creating session for agent: ${config.agentId}`)
    
    // 构建命令
    const escapedMessage = config.message.replace(/"/g, '\\"').replace(/`/g, '\\`')
    let cmd = `agent --agent ${config.agentId} --message "${escapedMessage}"`
    
    // 添加可选参数
    if (config.model) {
      cmd += ` --model ${config.model}`
    }
    if (config.thinking) {
      cmd += ` --thinking ${config.thinking}`
    }
    if (config.cwd) {
      cmd += ` --cwd "${config.cwd}"`
    }
    
    cmd += ' --json --timeout 300'
    
    console.log(`[sessions_spawn] Executing: openclaw ${cmd}`)
    
    const output = await callOpenClawCli(cmd, 330000)
    
    if (!output) {
      throw new Error('Failed to create session: no output from openclaw agent')
    }
    
    console.log('[sessions_spawn] Raw output:', output.substring(0, 500))
    
    // 解析 JSON 输出
    let result
    try {
      result = JSON.parse(output)
    } catch (e) {
      const keyMatch = output.match(/"sessionKey":\s*"([^"]+)"/)
      if (keyMatch) {
        result = { sessionKey: keyMatch[1], status: 'ok' }
      } else {
        throw new Error(`Failed to parse agent output: ${output}`)
      }
    }
    
    const sessionId = result.result?.meta?.agentMeta?.sessionId || result.sessionId
    
    if (!sessionId) {
      const sessionKey = result.sessionKey || result.session
      if (sessionKey) {
        console.log(`[sessions_spawn] Session created (direct key): ${sessionKey}`)
        return { sessionKey, status: result.status || 'ok' }
      }
      throw new Error('No sessionId or sessionKey in agent output')
    }
    
    const sessionKey = await findSessionKey(config.agentId, sessionId)
    
    cachedSessions = []
    lastFetch = 0
    
    console.log(`[sessions_spawn] Session created: ${sessionKey}`)
    
    return {
      sessionKey,
      status: result.status || 'ok'
    }
  } catch (error: any) {
    console.error('[sessions_spawn] Error:', error.message)
    throw error
  }
}

/**
 * 通过 sessionId 查找对应的 sessionKey
 */
async function findSessionKey(agentId: string, sessionId: string): Promise<string> {
  try {
    const OPENCLAW_DATA_DIR = getOpenClawDataDir()
    
    // 读取 sessions.json 查找 key
    const sessionsJsonPath = path.join(
      OPENCLAW_DATA_DIR,
      'agents',
      agentId,
      'sessions',
      'sessions.json'
    )
    
    if (fs.existsSync(sessionsJsonPath)) {
      const sessionsJson = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf-8'))
      
      for (const [key, value] of Object.entries(sessionsJson)) {
        const sessionData = value as any
        if (sessionData.sessionId === sessionId) {
          return key
        }
      }
    }
    
    console.log(`[findSessionKey] Session not found in sessions.json, waiting...`)
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    if (fs.existsSync(sessionsJsonPath)) {
      const sessionsJson = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf-8'))
      
      for (const [key, value] of Object.entries(sessionsJson)) {
        const sessionData = value as any
        if (sessionData.sessionId === sessionId) {
          return key
        }
      }
    }
    
    return `agent:${agentId}:main`
  } catch (error: any) {
    console.error('[findSessionKey] Error:', error.message)
    return `agent:${agentId}:main`
  }
}

/**
 * 发送消息到会话
 */
export async function sessions_send(sessionKey: string, message: string) {
  try {
    console.log('[sessions_send] Sending to:', sessionKey, 'message:', message)
    
    // 先从 session 列表中找到真实的 sessionId
    const sessions = await sessions_list()
    const session = sessions.find((s: any) => s.key === sessionKey || s.sessionId === sessionKey)
    
    if (!session) {
      console.error('[sessions_send] Session not found:', sessionKey)
      return { success: false, error: 'Session not found' }
    }
    
    const agentId = session.agentId
    const sessionId = session.sessionId
    
    console.log('[sessions_send] Using agentId:', agentId, 'sessionId:', sessionId)
    
    const cmd = `agent --agent ${agentId} --session-id ${sessionId} --message "${message.replace(/"/g, '\\"')}"`
    const output = await callOpenClawCli(cmd)
    
    console.log('[sessions_send] Response:', output)
    
    cachedSessions = []
    lastFetch = 0
    
    return { success: true, output }
  } catch (error: any) {
    console.error('[sessions_send] Error:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * 获取会话历史
 */
export async function sessions_history(sessionKey: string, limit: number = 50) {
  try {
    const sessionInfo = await getSessionInfo(sessionKey)
    
    if (!sessionInfo || !sessionInfo.sessionFile) {
      console.warn('[sessions_history] Session not found:', sessionKey)
      return []
    }
    
    return readSessionJsonl(sessionInfo.sessionFile, limit)
  } catch (error: any) {
    console.error('[sessions_history] Error:', error.message)
    return []
  }
}

/**
 * 获取会话状态
 */
export async function session_status(sessionKey: string) {
  const sessions = await sessions_list()
  return sessions.find((s: any) => s.key === sessionKey) || null
}

/**
 * 获取 Gateway 状态
 */
export async function gateway_status() {
  return { status: 'ok' }
}

/**
 * 获取可用模型列表
 */
export async function get_available_models(): Promise<string[]> {
  try {
    const OPENCLAW_DATA_DIR = getOpenClawDataDir()
    const configPath = path.join(OPENCLAW_DATA_DIR, 'openclaw.json')
    if (!fs.existsSync(configPath)) {
      return []
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const models: string[] = []
    
    if (config.agents?.defaults?.models) {
      models.push(...Object.keys(config.agents.defaults.models))
    }
    
    return models
  } catch (error: any) {
    console.error('[get_available_models] Error:', error.message)
    return []
  }
}

/**
 * 创建新的持久 Agent
 */
export async function agents_add(config: {
  id: string,           // agent ID
  model: string,        // 模型
  workspace: string     // workspace 目录
}): Promise<{ success: boolean; error?: string; agent?: any }> {
  try {
    const { id, model, workspace } = config
    const OPENCLAW_DATA_DIR = getOpenClawDataDir()
    
    // 验证参数
    if (!id || !id.match(/^[a-zA-Z0-9_-]+$/)) {
      return { success: false, error: 'Agent ID 必须只包含字母、数字、下划线或连字符' }
    }
    
    if (!model) {
      return { success: false, error: '模型不能为空' }
    }
    
    // 1. 检查 Agent 是否已存在
    const agentDir = path.join(OPENCLAW_DATA_DIR, 'agents', id)
    if (fs.existsSync(agentDir)) {
      return { success: false, error: `Agent "${id}" 已存在` }
    }
    
    // 2. 创建 workspace 目录 - 🔒 使用动态路径
    const workspacePath = workspace || path.join(OPENCLAW_DATA_DIR, `${id}-workspace`)
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true })
    }
    
    // 3. 创建 .md 文件模板
    const templates = {
      'IDENTITY.md': `# IDENTITY.md - 我是谁

- **Name:** ${id}
- **中文名:** ${id}
- **Creature:** AI Assistant
- **Vibe:** 专业、高效、友好
- **Emoji:** 🤖

---

我是 ${id}，一个 AI 助手。
`,
      'SOUL.md': `# SOUL.md - 我的灵魂

## 核心信念

**用户至上。** 始终以用户需求为中心，提供专业、准确的服务。

**持续学习。** 不断提升能力，为用户提供更好的帮助。

## 工作风格

- **专业严谨** — 提供准确、可靠的信息和建议
- **高效响应** — 快速理解需求，给出解决方案
- **友好耐心** — 保持积极的态度，耐心解答问题

---

_这个文件定义了我的本质。随着经验积累，我会更新它。_
`,
      'USER.md': `# USER.md - 关于我的团队

- **团队名称:** ${id} 团队
- **项目:** 待定义
- **Timezone:** Asia/Shanghai

## 我的职责

作为 AI 助手，我需要：
1. 响应用户请求
2. 提供专业建议
3. 执行任务指令
`,
      'MEMORY.md': `# MEMORY.md - 长期记忆

这个文件用于记录长期项目记忆、关键决策和技术债务。

## 记录格式

\`\`\`
[日期] [类型] - [描述]
\`\`\`

类型：决策/技术债务/架构/里程碑

---

_定期回顾并更新此文件。_
`,
      'AGENTS.md': `# AGENTS.md - 我的工作空间

${workspacePath}

## 启动流程

每次会话启动时：
1. 读取 \`IDENTITY.md\` — 确认身份
2. 读取 \`SOUL.md\` — 理解核心价值观
3. 读取 \`USER.md\` — 了解团队和项目
4. 读取 \`memory/YYYY-MM-DD.md\` — 回顾近期工作
5. 读取 \`MEMORY.md\` — 长期项目记忆

## 文件结构

\`\`\`
${workspacePath}
├── IDENTITY.md      # 我是谁
├── SOUL.md          # 我的灵魂/价值观
├── USER.md          # 关于我的团队
├── AGENTS.md        # 本文件
├── MEMORY.md        # 长期记忆
├── TOOLS.md         # 工具配置
└── memory/          # 每日记忆文件
    └── YYYY-MM-DD.md
\`\`\`
`
    }
    
    // 写入 .md 文件
    for (const [filename, content] of Object.entries(templates)) {
      const filePath = path.join(workspacePath, filename)
      fs.writeFileSync(filePath, content, 'utf-8')
    }
    
    // 创建 memory 目录
    const memoryDir = path.join(workspacePath, 'memory')
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true })
    }
    
    // 4. 更新 openclaw.json 配置
    const configPath = path.join(OPENCLAW_DATA_DIR, 'openclaw.json')
    const openclawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    
    // 添加到 agents.list
    if (!openclawConfig.agents) {
      openclawConfig.agents = { list: [] }
    }
    if (!openclawConfig.agents.list) {
      openclawConfig.agents.list = []
    }
    
    const existingIndex = openclawConfig.agents.list.findIndex((a: any) => a.id === id)
    if (existingIndex === -1) {
      openclawConfig.agents.list.push({
        id,
        model
      })
    }
    
    // 添加到 acp.allowedAgents
    if (!openclawConfig.acp) {
      openclawConfig.acp = { backend: 'acpx', allowedAgents: ['main'] }
    }
    if (!openclawConfig.acp.allowedAgents) {
      openclawConfig.acp.allowedAgents = ['main']
    }
    if (!openclawConfig.acp.allowedAgents.includes(id)) {
      openclawConfig.acp.allowedAgents.push(id)
    }
    
    fs.writeFileSync(configPath, JSON.stringify(openclawConfig, null, 2), 'utf-8')
    
    // 5. 创建 agent 目录结构
    fs.mkdirSync(path.join(agentDir, 'agent'), { recursive: true })
    fs.mkdirSync(path.join(agentDir, 'sessions'), { recursive: true })
    
    // 创建 models.json
    const defaultModelsPath = path.join(OPENCLAW_DATA_DIR, 'agents', 'main', 'agent', 'models.json')
    if (fs.existsSync(defaultModelsPath)) {
      const modelsConfig = JSON.parse(fs.readFileSync(defaultModelsPath, 'utf-8'))
      fs.writeFileSync(
        path.join(agentDir, 'agent', 'models.json'),
        JSON.stringify(modelsConfig, null, 2),
        'utf-8'
      )
    }
    
    // 创建 sessions.json
    fs.writeFileSync(
      path.join(agentDir, 'sessions', 'sessions.json'),
      '{}',
      'utf-8'
    )
    
    // 6. 清除缓存
    cachedAgents = []
    cachedSessions = []
    lastFetch = 0
    
    // 7. 重启 Gateway
    console.log('[agents_add] Restarting Gateway...')
    await callOpenClawCli('gateway restart')
    
    console.log(`[agents_add] Agent "${id}" created successfully`)
    
    return {
      success: true,
      agent: {
        id,
        name: id,
        description: `Agent ${id}`,
        status: 'offline',
        model,
        workspace: workspacePath
      }
    }
  } catch (error: any) {
    console.error('[agents_add] Error:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * 删除 Agent
 */
export async function agents_delete(agentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const OPENCLAW_DATA_DIR = getOpenClawDataDir()
    
    // 不允许删除 main agent
    if (agentId === 'main') {
      return { success: false, error: '不能删除 main agent' }
    }
    
    // 1. 更新 openclaw.json 配置
    const configPath = path.join(OPENCLAW_DATA_DIR, 'openclaw.json')
    const openclawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    
    // 从 agents.list 移除
    if (openclawConfig.agents?.list) {
      openclawConfig.agents.list = openclawConfig.agents.list.filter((a: any) => a.id !== agentId)
    }
    
    // 从 acp.allowedAgents 移除
    if (openclawConfig.acp?.allowedAgents) {
      openclawConfig.acp.allowedAgents = openclawConfig.acp.allowedAgents.filter((id: string) => id !== agentId)
    }
    
    fs.writeFileSync(configPath, JSON.stringify(openclawConfig, null, 2), 'utf-8')
    
    // 清除缓存
    cachedAgents = []
    cachedSessions = []
    lastFetch = 0
    
    // 重启 Gateway
    console.log('[agents_delete] Restarting Gateway...')
    await callOpenClawCli('gateway restart')
    
    return { success: true }
  } catch (error: any) {
    console.error('[agents_delete] Error:', error.message)
    return { success: false, error: error.message }
  }
}

/**
 * 检查 Agent 是否有活跃会话
 * 通过检查 sessions.json 文件判断
 */
export function agent_has_sessions(agentId: string): boolean {
  try {
    const OPENCLAW_DATA_DIR = getOpenClawDataDir()
    const sessionsJsonPath = path.join(
      OPENCLAW_DATA_DIR,
      'agents',
      agentId,
      'sessions',
      'sessions.json'
    )
    
    if (!fs.existsSync(sessionsJsonPath)) {
      return false
    }
    
    const sessionsJson = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf-8'))
    const keys = Object.keys(sessionsJson)
    
    // 如果有任意会话记录，返回 true
    return keys.length > 0
  } catch (error: any) {
    console.error('[agent_has_sessions] Error:', error.message)
    return false
  }
}

/**
 * 批量获取多个 Agent 的会话状态
 */
export function agents_get_session_status(agentIds: string[]): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  
  for (const agentId of agentIds) {
    result[agentId] = agent_has_sessions(agentId)
  }
  
  return result
}