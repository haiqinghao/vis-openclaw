import { Server, Socket } from 'socket.io'

interface SubscribeChannel {
  agents: Set<string>
  sessions: Set<string>
  tasks: Set<string>
  dashboard: Set<string>
}

const subscriptions: SubscribeChannel = {
  agents: new Set(),
  sessions: new Set(),
  tasks: new Set(),
  dashboard: new Set()
}

// 统计数据缓存
let lastStats = {
  agentCount: 0,
  sessionCount: 0,
  taskCount: 0,
  runningCount: 0
}

export function setupWebSocket(io: Server) {
  // 定期广播统计数据 - 改为30秒，减少 CLI 调用
  setInterval(async () => {
    try {
      // 动态导入避免循环依赖
      const { agents_list, sessions_list } = await import('./openclaw-cli.js')
      
      const [agents, sessions] = await Promise.all([
        agents_list(),
        sessions_list()
      ])

      lastStats = {
        agentCount: agents.length,
        sessionCount: sessions.length,
        taskCount: 0,
        runningCount: sessions.filter(s => s.status === 'active').length
      }

      // 广播统计数据
      io.emit('stats:update', lastStats)
    } catch (error) {
      // 静默失败，不打印错误
      // 使用上一次的统计数据
      io.emit('stats:update', lastStats)
    }
  }, 30000)  // 30秒更新一次

  io.on('connection', (socket: Socket) => {
    // 客户端连接时立即发送当前统计
    socket.emit('stats:update', lastStats)

    // 处理订阅
    socket.on('subscribe', (channel: string) => {
      switch (channel) {
        case 'agents':
          subscriptions.agents.add(socket.id)
          break
        case 'sessions':
          subscriptions.sessions.add(socket.id)
          break
        case 'tasks':
          subscriptions.tasks.add(socket.id)
          break
        case 'dashboard':
          subscriptions.dashboard.add(socket.id)
          break
      }
    })

    // 处理取消订阅
    socket.on('unsubscribe', (channel: string) => {
      switch (channel) {
        case 'agents':
          subscriptions.agents.delete(socket.id)
          break
        case 'sessions':
          subscriptions.sessions.delete(socket.id)
          break
        case 'tasks':
          subscriptions.tasks.delete(socket.id)
          break
        case 'dashboard':
          subscriptions.dashboard.delete(socket.id)
          break
      }
    })

    // 处理断开
    socket.on('disconnect', () => {
      subscriptions.agents.delete(socket.id)
      subscriptions.sessions.delete(socket.id)
      subscriptions.tasks.delete(socket.id)
      subscriptions.dashboard.delete(socket.id)
    })
  })

  return io
}

export function broadcast(event: string, data: any, channel?: string) {
  const io = (global as any).io as Server
  if (!io) return
  io.emit(event, data)
}

export function emitToClient(socketId: string, event: string, data: any) {
  const io = (global as any).io as Server
  if (!io) return
  const socket = io.sockets.sockets.get(socketId)
  if (socket) {
    socket.emit(event, data)
  }
}