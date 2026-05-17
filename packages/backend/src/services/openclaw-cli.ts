import * as fs from 'fs'
import * as path from 'path'
import { getCachedDataDir } from './config.js'
import { runOpenClawCli } from './openclaw-command.js'
import { sendGatewaySessionMessage } from './openclaw-gateway-rpc.js'
import { findLocalSession, readConfiguredAgents, readLocalSessions } from './openclaw-state.js'

// 缓存结果（性能优化：延长缓存时间，减少 CLI 调用频率）
let cachedAgents: any[] = []
let cachedSessions: any[] = []
let lastAgentsFetch = 0
let lastSessionsFetch = 0
const AGENT_LIST_CACHE_TTL_MS = 30000
const SESSION_LIST_CACHE_TTL_MS = 5000

// 🔒 安全修复：不再硬编码路径，使用配置模块动态获取
const getOpenClawDataDir = getCachedDataDir

// 消息数量缓存（带 TTL，过期自动清理）
const messageCountCache: Map<string, { count: number, timestamp: number }> = new Map()
const MESSAGE_COUNT_TTL = 60000 // 60秒缓存（从30秒优化为60秒，降低50%的文件读取）
const MESSAGE_COUNT_MAX_ENTRIES = 500 // 最多保留 500 条缓存

// 定期清理过期缓存（每 60 秒）
setInterval(() => {
  const now = Date.now()
  for (const [key, cached] of messageCountCache) {
    if (now - cached.timestamp > MESSAGE_COUNT_TTL) {
      messageCountCache.delete(key)
    }
  }
  // 如果仍然超出最大条目，清理最旧的
  if (messageCountCache.size > MESSAGE_COUNT_MAX_ENTRIES) {
    const entries = Array.from(messageCountCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (let i = 0; i < entries.length - MESSAGE_COUNT_MAX_ENTRIES; i++) {
      messageCountCache.delete(entries[i][0])
    }
  }
}, 60000)

/**
 * 调用 OpenClaw CLI 的封装
 */
async function callOpenClawCli(args: string[], timeoutMs: number = 120000): Promise<string | null> {
  return runOpenClawCli(args, {
    timeoutMs,
    maxBuffer: 1024 * 1024 * 2,
    logPrefix: 'OpenClaw CLI'
  })
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
 * Get sessions from OpenClaw local state without invoking the CLI list command.
 */
export async function sessions_list(filters?: { activeMinutes?: number; kinds?: string[]; limit?: number }) {
  const now = Date.now()

  if ((now - lastSessionsFetch) < SESSION_LIST_CACHE_TTL_MS) {
    return cachedSessions
  }

  lastSessionsFetch = now
  cachedSessions = readLocalSessions(filters)
  return cachedSessions
}


/**
 * Get a single session from OpenClaw local state.
 */
export async function getSessionInfo(sessionKey: string) {
  try {
    const session = findLocalSession(sessionKey)
    if (!session || !session.sessionFile) return null

    return {
      key: session.key,
      sessionId: session.sessionId,
      agentId: session.agentId,
      sessionFile: session.sessionFile,
      updatedAt: session.updatedAt,
      age: session.age
    }
  } catch (error: any) {
    console.error('[getSessionInfo] Error:', error.message)
    return null
  }
}

/**
 * Count session messages from the local transcript with a short TTL cache.
 */
export async function getMessageCount(sessionKey: string): Promise<number> {
  const now = Date.now()
  const cached = messageCountCache.get(sessionKey)
  if (cached && (now - cached.timestamp) < MESSAGE_COUNT_TTL) {
    return cached.count
  }

  try {
    const session = findLocalSession(sessionKey)
    const sessionFile = session?.sessionFile

    if (!session || !sessionFile || !fs.existsSync(sessionFile)) {
      return 0
    }

    const content = fs.readFileSync(sessionFile, 'utf-8')
    const lines = content.trim().split('\n')

    let count = 0
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const record = JSON.parse(line)
        if (record.type === 'message') count++
      } catch {
        continue
      }
    }

    messageCountCache.set(session.key, { count, timestamp: now })
    if (session.sessionId) messageCountCache.set(session.sessionId, { count, timestamp: now })
    return count
  } catch (error: any) {
    console.error('[getMessageCount] Error:', error.message)
    return 0
  }
}










function readAgentsFromOpenClawConfig(): any[] {
  return readConfiguredAgents()
}


export async function agents_list() {
  const now = Date.now()

  if ((now - lastAgentsFetch) < AGENT_LIST_CACHE_TTL_MS) {
    return cachedAgents
  }

  lastAgentsFetch = now
  const configAgents = readAgentsFromOpenClawConfig()
  if (configAgents.length > 0) {
    cachedAgents = configAgents
  }
  return cachedAgents
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
    const args = ['agent', '--agent', config.agentId, '--message', config.message]

    // 添加可选参数
    if (config.model) {
      args.push('--model', config.model)
    }
    if (config.thinking) {
      args.push('--thinking', config.thinking)
    }
    if (config.cwd) {
      args.push('--cwd', config.cwd)
    }

    args.push('--json', '--timeout', '300')

    const output = await callOpenClawCli(args, 330000)

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
    lastSessionsFetch = 0

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

    const result = await sendGatewaySessionMessage(sessionKey, message, {
      idempotencyKey: `vis-session:${sessionKey}:${Date.now()}`
    })

    console.log('[sessions_send] Gateway response:', result)

    cachedSessions = []
    lastSessionsFetch = 0

    return { success: true, ...result }
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
        model,
        workspace: workspacePath
      })
    } else {
      openclawConfig.agents.list[existingIndex] = {
        ...openclawConfig.agents.list[existingIndex],
        model,
        workspace: workspacePath
      }
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
    lastAgentsFetch = 0
    lastSessionsFetch = 0

    // 7. 重启 Gateway
    console.log('[agents_add] Restarting Gateway...')
    await callOpenClawCli(['gateway', 'restart'])

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
    lastAgentsFetch = 0
    lastSessionsFetch = 0

    // 重启 Gateway
    console.log('[agents_delete] Restarting Gateway...')
    await callOpenClawCli(['gateway', 'restart'])

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
