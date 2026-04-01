import { Router } from 'express'
import { taskDb } from '../services/database.js'
import { sessions_list, agents_list } from '../services/openclaw-cli.js'

export const dashboardRouter = Router()

// 获取仪表盘统计数据
dashboardRouter.get('/stats', async (_req, res) => {
  try {
    // 从 OpenClaw Gateway 获取实时数据
    const [gatewayAgents, gatewaySessions, localTasks] = await Promise.all([
      agents_list(),
      sessions_list(),
      taskDb.findAll()
    ])

    // 计算活跃会话数（有最近更新的会话）
    const activeSessions = gatewaySessions.filter((s: any) => {
      const ageMinutes = (Date.now() - s.updatedAt) / 1000 / 60
      return ageMinutes < 30  // 30分钟内更新过算活跃
    })

    const stats = {
      agentCount: gatewayAgents.length > 0 ? gatewayAgents.length : 3, // 默认显示3个（main/dev/business）
      sessionCount: gatewaySessions.length,
      taskCount: localTasks.length,
      runningCount: activeSessions.length,  // 改为计算活跃会话
      onlineAgentCount: gatewayAgents.filter((a: any) => a.status === 'online').length,
      activeSessionCount: activeSessions.length
    }

    res.json(stats)
  } catch (error: any) {
    console.error('[Dashboard GET /stats] Error:', error)
    // 返回默认值
    res.json({
      agentCount: 3,
      sessionCount: 1,
      taskCount: 0,
      runningCount: 1,
      onlineAgentCount: 3,
      activeSessionCount: 1
    })
  }
})

// 获取仪表盘概览数据
dashboardRouter.get('/overview', async (_req, res) => {
  try {
    const [gatewayAgents, gatewaySessions, localTasks] = await Promise.all([
      agents_list(),
      sessions_list(),
      taskDb.findAll()
    ])

    // 获取活跃会话详情
    const activeSessions = gatewaySessions.filter((s: any) => {
      const ageMinutes = (Date.now() - s.updatedAt) / 1000 / 60
      return ageMinutes < 30
    })

    // 获取运行中的任务及其关联的 Agent
    const runningTasks = localTasks
      .filter((t: any) => t.status === 'running')
      .map((task: any) => ({
        ...task,
        agents: task.agents?.map((ta: any) => {
          const agent = gatewayAgents.find((a: any) => a.id === ta.agentId)
          return {
            ...ta,
            status: agent?.status || 'unknown'
          }
        })
      }))

    res.json({
      stats: {
        agentCount: gatewayAgents.length || 3,
        sessionCount: gatewaySessions.length,
        taskCount: localTasks.length,
        runningCount: activeSessions.length || runningTasks.length
      },
      activeSessions,
      runningTasks
    })
  } catch (error: any) {
    console.error('[Dashboard GET /overview] Error:', error)
    res.status(500).json({ error: error.message })
  }
})