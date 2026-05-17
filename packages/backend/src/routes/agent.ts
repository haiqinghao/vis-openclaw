import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { agentsDb } from '../db/agents-db.js'
import { getGateway } from '../services/gateway.js'
import { agents_add, agents_delete, get_available_models, sessions_spawn } from '../services/openclaw-cli.js'
import {
  agentHasActiveSession,
  getAllSessionStates,
  getAgentSessionState,
  getAgentStatus,
  getSessionState,
  reportAgentStatus,
  reportAgentStatusEvents,
  type AgentState,
  type AgentStatusEventPayload
} from '../services/agent-status.js'
import {
  getCachedDataDir,
  getPossibleAgentWorkspaces,
  safeJoinAgentPath,
  ALLOWED_MD_FILES
} from '../services/config.js'
import { readConfiguredAgents } from '../services/openclaw-state.js'

export const agentRouter = Router()

const VALID_AGENT_STATES: AgentState[] = [
  'idle',
  'running',
  'thinking',
  'generating',
  'tool_calling',
  'waiting_approval',
  'finalizing',
  'complete',
  'busy',
  'error',
  'stale'
]

const pendingAgentCreates = new Map<string, Promise<Awaited<ReturnType<typeof agents_add>>>>()

// ========== 静态路由（必须在 /:id 之前）==========

// 获取可用模型列表
agentRouter.get('/models', async (_req, res) => {
  try {
    const models = await get_available_models()
    res.json(models)
  } catch (error: any) {
    console.error('[Agent Models GET] Error:', error)
    res.json([])
  }
})

agentRouter.get('/session-states', async (_req, res) => {
  res.json(getAllSessionStates())
})

agentRouter.get('/session-states/:id', async (req, res) => {
  const state = getSessionState(req.params.id)
  if (!state) return res.status(404).json({ error: 'Session state not found' })
  res.json(state)
})

agentRouter.post('/status-events', async (req, res) => {
  try {
    const rawEvents = Array.isArray(req.body)
      ? req.body
      : Array.isArray(req.body?.events)
        ? req.body.events
        : [req.body]

    const events = rawEvents.filter((event: unknown): event is AgentStatusEventPayload =>
      Boolean(event) && typeof event === 'object' && !Array.isArray(event)
    )

    if (events.length === 0) {
      return res.status(400).json({ error: 'events must contain at least one status event' })
    }

    const entries = reportAgentStatusEvents(events)
    res.json({ success: true, count: entries.length, entries })
  } catch (error: any) {
    console.error('[Agent POST status-events] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 获取 Agent 列表（优先从 Gateway 获取实时数据）
agentRouter.get('/', async (_req, res) => {
  try {
    const gateway = getGateway()
    const gatewayAgents = await gateway.listAgents()

    // 如果 Gateway 有数据，合并本地 avatarUnit + 会话状态
    if (gatewayAgents.length > 0) {
      const agentsWithStatus = gatewayAgents.map((agent) => {
        const local = agentsDb.findById(agent.id)
        const statusEntry = getAgentStatus(agent.id)
        const agentState = getAgentSessionState(agent.id)
        const hasActiveSession = agentHasActiveSession(agent.id)
        return {
          ...agent,
          description: agent.description || local?.description || '',
          status: hasActiveSession ? 'busy' : agent.status,
          hasActiveSession,
          workspace: findAgentWorkspace(agent.id, local?.workspace || agent.workspace)
            || local?.workspace
            || agent.workspace,
          avatarUnit: local?.avatarUnit || null,
          agentState,
          stateDetail: statusEntry?.detail || null,
          stateSource: statusEntry?.source || (agent as any).source || 'openclaw-config',
          lastEventAt: statusEntry?.timestamp || null,
          stateAgeMs: statusEntry ? Date.now() - statusEntry.timestamp : null
        }
      })
      return res.json(agentsWithStatus)
    }

    // OpenClaw 未返回真实列表时不展示本地历史残留 agent
    res.json([])
  } catch (error: any) {
    console.error('[Agent GET] Error:', error)
    // 返回空数组而不是报错
    res.json([])
  }
})

// 创建 Agent（调用 OpenClaw CLI 创建持久 Agent）
agentRouter.post('/', async (req, res) => {
  try {
    const { id, name, description, model, systemPrompt, workspace } = req.body

    // 使用 id 或 name 作为 agent ID
    const agentId = id || name

    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID 或名称是必填项' })
    }

    // 清理 agentId，只保留有效字符
    const cleanId = agentId.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()

    // 默认模型
    const agentModel = model || 'bailian/glm-5'

    // 默认 workspace - 使用安全配置（不再硬编码路径）
    const dataDir = getCachedDataDir()
    const agentWorkspace = workspace || path.join(dataDir, `${cleanId}-workspace`)

    // 创建过程会触发 Gateway 重启；同一个 agentId 的并发请求复用同一个结果。
    let createPromise = pendingAgentCreates.get(cleanId)
    if (!createPromise) {
      createPromise = agents_add({
        id: cleanId,
        model: agentModel,
        workspace: agentWorkspace
      }).finally(() => {
        pendingAgentCreates.delete(cleanId)
      })
      pendingAgentCreates.set(cleanId, createPromise)
    }

    const result = await createPromise

    if (!result.success) {
      const status = result.error?.includes('已存在') ? 409 : 400
      return res.status(status).json({ error: result.error })
    }

    const createdAgent = result.agent || {}
    const localAgent = agentsDb.findById(cleanId)
      ? agentsDb.update(cleanId, {
        name: name || cleanId,
        description: description || createdAgent.description || '',
        model: agentModel,
        systemPrompt,
        workspace: createdAgent.workspace || agentWorkspace,
        status: createdAgent.status || 'offline'
      })
      : agentsDb.create({
        id: cleanId,
        name: name || cleanId,
        description: description || createdAgent.description || '',
        model: agentModel,
        systemPrompt,
        workspace: createdAgent.workspace || agentWorkspace,
        status: createdAgent.status || 'offline'
      })

    res.status(201).json({
      ...createdAgent,
      ...localAgent,
      workspace: createdAgent.workspace || localAgent?.workspace || agentWorkspace
    })
  } catch (error: any) {
    console.error('[Agent POST] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ========== 头像文件服务（必须在 /:id 之前）==========

// 获取 Agent 的头像文件
agentRouter.get('/:id/avatar', async (req, res) => {
  try {
    const { id } = req.params

    // 使用安全配置查找工作目录
    const workspacePath = findAgentWorkspace(id)

    if (!workspacePath) {
      return res.status(404).json({ error: 'Agent workspace not found' })
    }

    // 读取 IDENTITY.md 获取 avatar 路径
    const identityPath = path.join(workspacePath, 'IDENTITY.md')
    if (!fs.existsSync(identityPath)) {
      return res.status(404).json({ error: 'IDENTITY.md not found' })
    }

    const identityContent = fs.readFileSync(identityPath, 'utf-8')
    const avatarMatch = identityContent.match(/[-*]\s*\**Avatar:\**\s*(.+)/i)

    if (!avatarMatch) {
      return res.status(404).json({ error: 'No avatar configured' })
    }

    let avatarPath = avatarMatch[1].trim()

    // 如果是相对路径，转换为绝对路径
    if (!path.isAbsolute(avatarPath)) {
      avatarPath = path.join(workspacePath, avatarPath)
    }

    // 安全检查：确保路径在 workspace 内
    const resolvedAvatar = path.resolve(avatarPath)
    const resolvedWorkspace = path.resolve(workspacePath)

    if (!resolvedAvatar.startsWith(resolvedWorkspace)) {
      return res.status(403).json({ error: 'Access denied' })
    }

    if (!fs.existsSync(resolvedAvatar)) {
      return res.status(404).json({ error: 'Avatar file not found' })
    }

    // 读取文件内容
    const fileContent = fs.readFileSync(resolvedAvatar)

    // 根据扩展名设置 Content-Type
    const ext = path.extname(resolvedAvatar).toLowerCase()
    const contentTypes: Record<string, string> = {
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    }

    const contentType = contentTypes[ext] || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.send(fileContent)
  } catch (error: any) {
    console.error('[Agent Avatar GET] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ========== Agent 间通信配置（必须在 /:id 之前）==========

// 获取 Agent 间通信配置
agentRouter.get('/communication-config', async (_req, res) => {
  try {
    const dataDir = getCachedDataDir()
    const configPath = path.join(dataDir, 'openclaw.json')

    if (!fs.existsSync(configPath)) {
      return res.json({
        enabled: false,
        allowList: []
      })
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const agentToAgent = config.tools?.agentToAgent || {}

    res.json({
      enabled: agentToAgent.enabled ?? false,
      allowList: agentToAgent.allow || []
    })
  } catch (error: any) {
    console.error('[Communication Config GET] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 更新 Agent 间通信配置
agentRouter.put('/communication-config', async (req, res) => {
  try {
    const { enabled, allowList } = req.body

    if (!Array.isArray(allowList)) {
      return res.status(400).json({ error: 'allowList 必须是数组' })
    }

    const dataDir = getCachedDataDir()
    const configPath = path.join(dataDir, 'openclaw.json')

    if (!fs.existsSync(configPath)) {
      return res.status(404).json({ error: '配置文件不存在' })
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

    // 更新配置
    if (!config.tools) {
      config.tools = {}
    }

    config.tools.agentToAgent = {
      enabled: enabled ?? true,
      allow: allowList
    }

    // 写回配置
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

    console.log('[Communication Config PUT] Updated:', { enabled, allowList })

    res.json({
      success: true,
      enabled: config.tools.agentToAgent.enabled,
      allowList: config.tools.agentToAgent.allow
    })
  } catch (error: any) {
    console.error('[Communication Config PUT] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// ========== 动态路由（/:id）==========

// 更新 Agent
agentRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, model, systemPrompt, workspace, status, avatarUnit } = req.body

    const updates = Object.fromEntries(
      Object.entries({
        name,
        description,
        model,
        systemPrompt,
        workspace,
        status,
        avatarUnit
      }).filter(([, value]) => value !== undefined)
    )

    let agent = agentsDb.update(id, updates as any)

    if (!agent) {
      const configuredAgent = readConfiguredAgents().find((item) => item.id === id)

      if (!configuredAgent) {
        return res.status(404).json({ error: 'Agent not found' })
      }

      const resolvedWorkspace = typeof workspace === 'string' && workspace.trim()
        ? workspace
        : findAgentWorkspace(id, configuredAgent.workspace) || configuredAgent.workspace || ''

      agent = agentsDb.create({
        id,
        name: typeof name === 'string' && name.trim() ? name : configuredAgent.name || id,
        description: typeof description === 'string' ? description : configuredAgent.description || '',
        model: typeof model === 'string' && model.trim() ? model : configuredAgent.model || '',
        systemPrompt: typeof systemPrompt === 'string' ? systemPrompt : '',
        workspace: resolvedWorkspace,
        status: typeof status === 'string' && status.trim() ? status : configuredAgent.status || 'online',
        avatarUnit: typeof avatarUnit === 'string' ? avatarUnit : ''
      })
    }

    res.json(agent)
  } catch (error: any) {
    console.error('[Agent PUT] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Agent 状态上报接口（Agent 主动推送）
agentRouter.post('/:id/status', async (req, res) => {
  try {
    const { id } = req.params
    const { state, detail } = req.body

    if (!state) {
      return res.status(400).json({ error: 'state 是必填项' })
    }

    const validStates = VALID_AGENT_STATES
    if (!VALID_AGENT_STATES.includes(state)) {
      return res.status(400).json({ error: `state 必须是: ${validStates.join(', ')}` })
    }

    const entry = reportAgentStatus(id, state as AgentState, detail)
    res.json({ success: true, ...entry })
  } catch (error: any) {
    console.error('[Agent POST :id/status] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 删除 Agent
agentRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    // 先尝试调用 OpenClaw CLI 删除
    const result = await agents_delete(id)
    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    // 同时从本地数据库删除
    agentsDb.delete(id)
    res.status(204).send()
  } catch (error: any) {
    console.error('[Agent DELETE] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * 查找 Agent 的实际工作目录
 */
function hasAgentConfigFiles(workspacePath: string): boolean {
  return ALLOWED_MD_FILES.some((fileName) => fs.existsSync(path.join(workspacePath, fileName)))
}

function uniquePaths(paths: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const p of paths) {
    if (!p) continue
    const normalized = path.resolve(p)
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }

  return result
}

function findAgentWorkspace(agentId: string, preferredWorkspace?: string): string | null {
  const localWorkspace = agentsDb.findById(agentId)?.workspace
  const possiblePaths = uniquePaths([
    preferredWorkspace,
    localWorkspace,
    ...getPossibleAgentWorkspaces(agentId)
  ])
  const existingPaths = possiblePaths.filter((p) => fs.existsSync(p))
  const pathWithConfigFiles = existingPaths.find(hasAgentConfigFiles)

  if (pathWithConfigFiles) {
    return pathWithConfigFiles
  }

  return existingPaths[0] || null
}

// 获取 Agent 的 .md 文件列表（只显示指定的文件）
agentRouter.get('/:id/files', async (req, res) => {
  try {
    const { id } = req.params

    // 使用安全配置查找工作目录
    const workspacePath = findAgentWorkspace(id)

    if (!workspacePath) {
      return res.status(404).json({ error: 'Agent workspace not found' })
    }

    // 只返回允许列表中的文件
    const files: Array<{
      name: string
      size: number
      modified: Date
      exists: boolean
    }> = []

    for (const fileName of ALLOWED_MD_FILES) {
      const filePath = path.join(workspacePath, fileName)
      const exists = fs.existsSync(filePath)

      files.push({
        name: fileName,
        size: exists ? fs.statSync(filePath).size : 0,
        modified: exists ? fs.statSync(filePath).mtime : new Date(0),
        exists
      })
    }

    res.json({ files, workspace: workspacePath })
  } catch (error: any) {
    console.error('[Agent Files GET] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 获取 Agent 的单个 .md 文件内容
agentRouter.get('/:id/files/:name', async (req, res) => {
  try {
    const { id, name } = req.params

    // 使用安全配置查找工作目录
    const workspacePath = findAgentWorkspace(id)

    if (!workspacePath) {
      return res.status(404).json({ error: 'Agent workspace not found' })
    }

    // 🔒 安全修复：使用 safeJoinAgentPath 验证白名单 + 防止路径遍历
    const safeResult = safeJoinAgentPath(workspacePath, name)

    if (!safeResult.success) {
      return res.status(400).json({ error: safeResult.error })
    }

    const filePath = safeResult.path!

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    res.json({ name: path.basename(filePath), content })
  } catch (error: any) {
    console.error('[Agent File GET] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 保存 Agent 的 .md 文件内容
agentRouter.put('/:id/files/:name', async (req, res) => {
  try {
    const { id, name } = req.params
    const { content } = req.body

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content must be a string' })
    }

    // 使用安全配置查找工作目录
    const workspacePath = findAgentWorkspace(id)

    if (!workspacePath) {
      return res.status(404).json({ error: 'Agent workspace not found' })
    }

    // 🔒 安全修复：使用 safeJoinAgentPath 验证白名单 + 防止路径遍历
    const safeResult = safeJoinAgentPath(workspacePath, name)

    if (!safeResult.success) {
      return res.status(400).json({ error: safeResult.error })
    }

    const filePath = safeResult.path!

    // 确保目录存在
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true })
    }

    // 写入文件
    fs.writeFileSync(filePath, content, 'utf-8')

    res.json({ success: true, name: path.basename(filePath) })
  } catch (error: any) {
    console.error('[Agent File PUT] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 启动 Agent 会话
agentRouter.post('/:id/start-session', async (req, res) => {
  try {
    const { id } = req.params
    const { message, channel } = req.body

    // 默认问候消息
    const startMessage = message || '你好，请介绍一下你自己。'

    console.log(`[Agent Start Session] Starting session for agent: ${id}`)

    // 调用 sessions_spawn 启动会话
    const result = await sessions_spawn({
      agentId: id,
      message: startMessage
    })

    console.log(`[Agent Start Session] Session created: ${result.sessionKey}`)

    res.json({
      success: true,
      sessionKey: result.sessionKey,
      status: result.status,
      message: `会话已启动，sessionKey: ${result.sessionKey}`
    })
  } catch (error: any) {
    console.error('[Agent Start Session] Error:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})
