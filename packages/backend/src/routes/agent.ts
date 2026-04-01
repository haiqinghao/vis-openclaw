import { Router } from 'express'
import path from 'path'
import fs from 'fs'
import { agentDb } from '../services/database.js'
import { getGateway } from '../services/gateway.js'
import { agents_add, agents_delete, get_available_models, sessions_spawn, agent_has_sessions } from '../services/openclaw-cli.js'
import {
  getCachedDataDir,
  getPossibleAgentWorkspaces,
  safeJoinAgentPath,
  ALLOWED_MD_FILES
} from '../services/config.js'

export const agentRouter = Router()

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

// 获取 Agent 列表（优先从 Gateway 获取实时数据）
agentRouter.get('/', async (_req, res) => {
  try {
    const gateway = getGateway()
    const gatewayAgents = await gateway.listAgents()

    // 如果 Gateway 有数据，直接返回（添加会话状态）
    if (gatewayAgents.length > 0) {
      // 为每个 agent 添加会话状态
      const agentsWithStatus = gatewayAgents.map((agent: any) => ({
        ...agent,
        hasActiveSession: agent_has_sessions(agent.id)
      }))
      return res.json(agentsWithStatus)
    }

    // 否则从本地数据库获取
    const localAgents = agentDb.findAll()
    const agentsWithStatus = localAgents.map((agent: any) => ({
      ...agent,
      hasActiveSession: agent_has_sessions(agent.id)
    }))
    res.json(agentsWithStatus)
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

    // 调用 OpenClaw CLI 创建 Agent
    const result = await agents_add({
      id: cleanId,
      model: agentModel,
      workspace: agentWorkspace
    })

    if (!result.success) {
      return res.status(400).json({ error: result.error })
    }

    res.status(201).json(result.agent)
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
    const { name, description, model, systemPrompt, workspace, status } = req.body

    const agent = agentDb.update(id, {
      name,
      description,
      model,
      systemPrompt,
      workspace,
      status
    })

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' })
    }

    res.json(agent)
  } catch (error: any) {
    console.error('[Agent PUT] Error:', error)
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
    agentDb.delete(id)
    res.status(204).send()
  } catch (error: any) {
    console.error('[Agent DELETE] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

/**
 * 查找 Agent 的实际工作目录
 */
function findAgentWorkspace(agentId: string): string | null {
  const possiblePaths = getPossibleAgentWorkspaces(agentId)
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p
    }
  }
  
  return null
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