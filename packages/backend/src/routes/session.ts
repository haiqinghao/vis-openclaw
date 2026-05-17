import { Router } from 'express'
import { getMessageCount, sessions_history, sessions_list, sessions_send, sessions_spawn } from '../services/openclaw-cli.js'
import { getSessionState, type AgentState } from '../services/agent-status.js'

export const sessionRouter = Router()

const ACTIVE_STATES = new Set<AgentState>([
  'running',
  'thinking',
  'generating',
  'tool_calling',
  'waiting_approval',
  'finalizing',
  'busy'
])

function safeIsoTime(value: unknown): string {
  const timestamp = typeof value === 'number' && Number.isFinite(value) ? value : Date.now()
  return new Date(timestamp).toISOString()
}

function resolveSessionState(session: any) {
  return getSessionState(session.key) || (session.sessionId ? getSessionState(session.sessionId) : null)
}

function getDisplayStatus(session: any, state: ReturnType<typeof resolveSessionState>): string {
  if (state && ACTIVE_STATES.has(state.state)) return 'active'
  if (session.status === 'running' || session.status === 'processing') return 'active'
  if (session.status === 'failed') return 'failed'
  return 'idle'
}

async function formatSession(session: any) {
  const state = resolveSessionState(session)
  const messageCount = await getMessageCount(session.key)
  const updatedAt = typeof session.updatedAt === 'number' ? session.updatedAt : Date.now()
  const createdAt = typeof session.sessionStartedAt === 'number'
    ? session.sessionStartedAt
    : Math.max(0, updatedAt - (session.ageMs || 0))

  return {
    id: session.sessionId || session.key,
    key: session.key,
    label: session.key,
    agentId: session.agentId,
    status: getDisplayStatus(session, state),
    state: state?.state || null,
    stateDetail: state?.detail || null,
    stateSource: state?.source || session.source || null,
    lastEventAt: state?.timestamp || null,
    lastActivity: safeIsoTime(updatedAt),
    messageCount,
    createdAt: safeIsoTime(createdAt),
    updatedAt: safeIsoTime(updatedAt),
    model: session.model,
    kind: session.kind,
    sessionFile: session.sessionFile
  }
}

sessionRouter.get('/', async (_req, res) => {
  try {
    const sessions = await sessions_list()
    res.json(await Promise.all(sessions.map(formatSession)))
  } catch (error: any) {
    console.error('[Session GET] Error:', error)
    res.json([])
  }
})

sessionRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const sessions = await sessions_list()
    const session = sessions.find((candidate: any) => candidate.key === id || candidate.sessionId === id)

    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    res.json({
      ...(await formatSession(session)),
      messages: []
    })
  } catch (error: any) {
    console.error('[Session GET :id] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

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

sessionRouter.post('/:id/send', async (req, res) => {
  try {
    const { id } = req.params
    const { message } = req.body

    if (!message) {
      return res.status(400).json({ error: 'Message is required' })
    }

    const result = await sessions_send(id, message)
    res.json(result)
  } catch (error: any) {
    console.error('[Session POST :id/send] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

sessionRouter.get('/:id/messages', async (req, res) => {
  try {
    const { id } = req.params
    const limit = parseInt(req.query.limit as string) || 50
    const sessions = await sessions_list()
    const session = sessions.find((candidate: any) => candidate.key === id || candidate.sessionId === id)
    const sessionKey = session?.key || id
    const messages = await sessions_history(sessionKey, limit)
    res.json(messages)
  } catch (error: any) {
    console.error('[Session GET :id/messages] Error:', error)
    res.status(500).json({ error: error.message })
  }
})
