import NodeCache from 'node-cache'

interface SessionInfo {
  key: string
  status: string
  lastActivity: string
  messageCount: number
  label?: string
}

interface AgentInfo {
  id: string
  name: string
  description: string
  status: string
  workspace?: string
  model?: string
  avatar?: string | null
  emoji?: string | null
}

interface SubagentInfo {
  id: string
  name: string
}

export class GatewayProxy {
  private cache: NodeCache

  constructor() {
    // 缓存 60 秒，最多 100 条
    this.cache = new NodeCache({ stdTTL: 60, maxKeys: 100 })
  }

  // 获取会话列表
  async listSessions(): Promise<SessionInfo[]> {
    const cacheKey = 'sessions:list'
    const cached = this.cache.get<SessionInfo[]>(cacheKey)
    if (cached) return cached

    try {
      const { sessions_list } = await import('./openclaw-cli.js')
      const sessions = await sessions_list()
      this.cache.set(cacheKey, sessions)
      return sessions
    } catch (error) {
      return []
    }
  }

  // 获取 Agent 列表
  async listAgents(): Promise<AgentInfo[]> {
    const cacheKey = 'agents:list'
    const cached = this.cache.get<AgentInfo[]>(cacheKey)
    if (cached) return cached

    try {
      const { agents_list } = await import('./openclaw-cli.js')
      const agents = await agents_list()
      this.cache.set(cacheKey, agents)
      return agents
    } catch (error) {
      return []
    }
  }

  // 获取子 Agent 列表
  async listSubagents(): Promise<SubagentInfo[]> {
    try {
      const { subagents } = await import('./openclaw-cli.js')
      return await subagents()
    } catch (error) {
      return []
    }
  }

  // 创建会话
  async spawnSession(config: any): Promise<{ sessionKey: string }> {
    this.cache.flushAll()
    const { sessions_spawn } = await import('./openclaw-cli.js')
    return await sessions_spawn(config)
  }

  // 发送消息到会话
  async sendMessage(sessionKey: string, message: string): Promise<void> {
    const { sessions_send } = await import('./openclaw-cli.js')
    await sessions_send(sessionKey, message)
  }

  // 获取会话历史
  async getSessionHistory(sessionKey: string): Promise<any[]> {
    const { sessions_history } = await import('./openclaw-cli.js')
    return await sessions_history(sessionKey)
  }

  // 获取会话状态
  async getSessionStatus(sessionKey: string): Promise<any> {
    const { session_status } = await import('./openclaw-cli.js')
    return await session_status(sessionKey)
  }

  // 清除缓存
  clearCache(): void {
    this.cache.flushAll()
  }
}

// 单例
let gatewayInstance: GatewayProxy | null = null

export function getGateway(): GatewayProxy {
  if (!gatewayInstance) {
    gatewayInstance = new GatewayProxy()
  }
  return gatewayInstance
}
