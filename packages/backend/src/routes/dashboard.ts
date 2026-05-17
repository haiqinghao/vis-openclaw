import { Router } from 'express'
import { tasksDb } from '../db/tasks-db.js'
import { sessions_list, agents_list } from '../services/openclaw-cli.js'
import { getAllAgentStatuses, type AgentState } from '../services/agent-status.js'

export const dashboardRouter = Router()

const ACTIVE_AGENT_STATES = new Set<AgentState>([
  'running',
  'thinking',
  'generating',
  'tool_calling',
  'waiting_approval',
  'finalizing',
  'busy'
])
const ACTIVE_TASK_STATUSES = new Set(['dispatching', 'distributed', 'running'])

function getActiveAgentStatuses() {
  const now = Date.now()
  return getAllAgentStatuses().filter((entry) =>
    ACTIVE_AGENT_STATES.has(entry.state) && now - entry.timestamp < 5 * 60 * 1000
  )
}

dashboardRouter.get('/stats', async (_req, res) => {
  try {
    const [agents, sessions, tasks] = await Promise.all([
      agents_list(),
      sessions_list(),
      tasksDb.findAll()
    ])
    const activeStatuses = getActiveAgentStatuses()

    res.json({
      agentCount: agents.length,
      sessionCount: sessions.length,
      taskCount: tasks.length,
      runningCount: activeStatuses.length,
      onlineAgentCount: agents.filter((agent: any) => agent.status === 'online').length,
      activeSessionCount: activeStatuses.length
    })
  } catch (error: any) {
    console.error('[Dashboard GET /stats] Error:', error)
    res.json({
      agentCount: 0,
      sessionCount: 0,
      taskCount: 0,
      runningCount: 0,
      onlineAgentCount: 0,
      activeSessionCount: 0
    })
  }
})

dashboardRouter.get('/overview', async (_req, res) => {
  try {
    const [agents, sessions, tasks] = await Promise.all([
      agents_list(),
      sessions_list(),
      tasksDb.findAll()
    ])
    const activeStatuses = getActiveAgentStatuses()
    const activeSessionKeys = new Set(
      activeStatuses.flatMap((entry) => [entry.sessionKey, entry.sessionId].filter(Boolean))
    )

    const activeSessions = sessions
      .filter((session: any) => activeSessionKeys.has(session.key) || activeSessionKeys.has(session.sessionId))
      .map((session: any) => {
        const state = activeStatuses.find((entry) =>
          entry.sessionKey === session.key || entry.sessionId === session.sessionId
        )
        return {
          ...session,
          state: state?.state,
          detail: state?.detail,
          lastEventAt: state?.timestamp
        }
      })

    const runningTasks = tasks
      .filter((task: any) => ACTIVE_TASK_STATUSES.has(task.status))
      .map((task: any) => ({
        ...task,
        agents: task.agents?.map((taskAgent: any) => {
          const agent = agents.find((candidate: any) => candidate.id === taskAgent.agentId)
          const active = activeStatuses.some((entry) => entry.agentId === taskAgent.agentId)
          return {
            ...taskAgent,
            status: active ? 'running' : agent?.status || 'unknown'
          }
        })
      }))

    res.json({
      stats: {
        agentCount: agents.length,
        sessionCount: sessions.length,
        taskCount: tasks.length,
        runningCount: activeStatuses.length || runningTasks.length
      },
      activeSessions,
      runningTasks
    })
  } catch (error: any) {
    console.error('[Dashboard GET /overview] Error:', error)
    res.status(500).json({ error: error.message })
  }
})
