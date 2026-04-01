import { Router } from 'express'
import { getSessionInfo, getMessageCount } from '../services/openclaw-cli.js'
import { sessions_list, sessions_spawn, sessions_send, sessions_history } from '../services/openclaw-cli.js'
import { getGateway } from '../services/gateway.js'

export const sessionRouter = Router()

// 获取会话列表（从 OpenClaw Gateway 获取）
sessionRouter.get('/', async (_req, res) => {
  try {
    const sessions = await sessions_list()
    
    // 并行获取所有会话的消息数量（带缓存）
    const messageCounts = await Promise.all(
      sessions.map(s => getMessageCount(s.key))
    )
    
    // 转换格式以匹配前端期望
    const formattedSessions = sessions.map((s: any, index: number) => {
      // 安全处理时间字段，避免 Invalid Date 错误
      const safeTimestamp = s.updatedAt ? new Date(s.updatedAt).getTime() : Date.now()
      const createdTimestamp = s.updatedAt && s.ageMs ? safeTimestamp - s.ageMs : safeTimestamp

      return {
        id: s.sessionId || s.key,
        key: s.key,
        label: s.key,
        agentId: s.agentId,
        status: s.updatedAt ? 'active' : 'idle',
        lastActivity: new Date(safeTimestamp).toISOString(),
        messageCount: messageCounts[index] || 0,
        createdAt: new Date(createdTimestamp).toISOString(),
        updatedAt: new Date(safeTimestamp).toISOString(),
        model: s.model,
        kind: s.kind
      }
    })
    res.json(formattedSessions)
  } catch (error: any) {
    console.error('[Session GET] Error:', error)
    res.json([])
  }
})

// 获取单个会话详情
sessionRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    
    // 从会话列表中查找
    const sessions = await sessions_list()
    let session = sessions.find((s: any) => s.key === id || s.sessionId === id)
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }
    
    // 获取消息数量
    const messageCount = await getMessageCount(session.key)
    
    // 返回完整的会话信息，包含空的 messages 数组（消息通过 /:id/messages 获取）
    res.json({
      id: session.sessionId || session.key,
      key: session.key,
      agentId: session.agentId,
      status: 'active',
      label: session.key,
      lastActivity: new Date().toISOString(),
      messageCount: messageCount,
      messages: [], // 消息通过 /:id/messages API 获取
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      model: session.model,
      kind: session.kind
    })
  } catch (error: any) {
    console.error('[Session GET :id] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 创建会话
sessionRouter.post('/', async (req, res) => {
  try {
    const { agentId, taskId, label, message, model, thinking, runtime, cwd } = req.body

    const result = await sessions_spawn({
      agentId,
      task: taskId,
      message,
      model,
      thinking,
      runtime,
      cwd,
      label
    })

    res.status(201).json(result)
  } catch (error: any) {
    console.error('[Session POST] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 发送消息到会话
sessionRouter.post('/:id/send', async (req, res) => {
  try {
    const { id } = req.params
    const { message } = req.body

    if (!message) {
      return res.status(400).json({ error: 'Message is required' })
    }

    await sessions_send(id, message)
    res.json({ success: true })
  } catch (error: any) {
    console.error('[Session POST :id/send] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 获取会话消息历史
sessionRouter.get('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params
    const limit = parseInt(req.query.limit as string) || 50
    console.log('[messages API] Request for id:', id)

    // 如果 id 是 UUID，需要找到对应的 session key
    let sessionKey = id
    
    // 检查 id 是否是 UUID 格式
    if (id.includes('-') && id.length === 36) {
      console.log('[messages API] UUID detected, looking up session key')
      const sessions = await sessions_list()
      console.log('[messages API] Available sessions:', sessions.map((s: any) => ({ id: s.sessionId, key: s.key })))
      const session = sessions.find((s: any) => s.sessionId === id)
      if (session) {
        sessionKey = session.key
        console.log('[messages API] Found session key:', sessionKey)
      } else {
        console.log('[messages API] Session not found for UUID:', id)
      }
    }

    console.log('[messages API] Calling sessions_history with:', sessionKey)
    const messages = await sessions_history(sessionKey, limit)
    console.log('[messages API] Got messages count:', messages.length)
    res.json(messages)
  } catch (error: any) {
    console.error('[Session GET :id/messages] Error:', error)
    res.status(500).json({ error: error.message })
  }
})