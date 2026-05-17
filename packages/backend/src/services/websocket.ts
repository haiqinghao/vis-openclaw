import { Server, Socket } from 'socket.io'
import { getAllAgentStatuses } from './agent-status.js'
import { agents_list, sessions_list } from './openclaw-cli.js'
import { tasksDb } from '../db/tasks-db.js'
import { getRealtimeChannelRoom, isRealtimeChannel, type RealtimeChannel } from './realtime-channels.js'

type SubscribeChannel = Record<RealtimeChannel, Set<string>>

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

// 统计数据广播定时器（保存引用以便清理）
let statsInterval: NodeJS.Timeout | null = null
const STATS_INTERVAL_MS = 60000

function hasStatsSubscribers(): boolean {
  return subscriptions.agents.size > 0 ||
    subscriptions.sessions.size > 0 ||
    subscriptions.dashboard.size > 0
}

function getSubscriberCount(channel: RealtimeChannel): number {
  return subscriptions[channel].size
}

function emitToChannelOrFallback(io: Server, channel: RealtimeChannel, event: string, data: any): void {
  if (getSubscriberCount(channel) > 0) {
    io.to(getRealtimeChannelRoom(channel)).emit(event, data)
    return
  }

  io.emit(event, data)
}

function subscribeSocket(socket: Socket, channel: RealtimeChannel): void {
  subscriptions[channel].add(socket.id)
  socket.join(getRealtimeChannelRoom(channel))
}

function unsubscribeSocket(socket: Socket, channel: RealtimeChannel): void {
  subscriptions[channel].delete(socket.id)
  socket.leave(getRealtimeChannelRoom(channel))
}

function unsubscribeSocketFromAll(socket: Socket): void {
  for (const channel of Object.keys(subscriptions) as RealtimeChannel[]) {
    unsubscribeSocket(socket, channel)
  }
}

async function collectLocalStats() {
  const [agents, sessions, tasks] = await Promise.all([
    agents_list(),
    sessions_list(),
    tasksDb.findAll()
  ])
  const agentStatuses = getAllAgentStatuses()
  const activeStates = new Set([
    'running',
    'thinking',
    'generating',
    'tool_calling',
    'waiting_approval',
    'finalizing',
    'busy'
  ])
  const activeTaskStatuses = new Set(['dispatching', 'distributed', 'running'])
  const activeAgentCount = agentStatuses.filter(session => activeStates.has(session.state)).length
  const activeTaskCount = tasks.filter(task => activeTaskStatuses.has(task.status)).length

  return {
    agentCount: agents.length,
    sessionCount: sessions.length,
    taskCount: tasks.length,
    runningCount: Math.max(activeAgentCount, activeTaskCount)
  }
}

export function setupWebSocket(io: Server) {
  // 定期广播统计数据 - 30秒更新一次
  statsInterval = setInterval(async () => {
    if (!hasStatsSubscribers()) return

    try {
      lastStats = await collectLocalStats()

      emitToChannelOrFallback(io, 'dashboard', 'stats:update', lastStats)
    } catch (error) {
      // 静默失败，使用上一次数据
      emitToChannelOrFallback(io, 'dashboard', 'stats:update', lastStats)
    }
  }, STATS_INTERVAL_MS)
  statsInterval.unref?.()

  io.on('connection', (socket: Socket) => {
    // 客户端连接时立即发送当前统计
    collectLocalStats()
      .then((stats) => {
        lastStats = stats
        socket.emit('stats:update', stats)
      })
      .catch(() => socket.emit('stats:update', lastStats))

    // 处理订阅
    socket.on('subscribe', (channel: string) => {
      if (isRealtimeChannel(channel)) subscribeSocket(socket, channel)
    })

    // 处理取消订阅
    socket.on('unsubscribe', (channel: string) => {
      if (isRealtimeChannel(channel)) unsubscribeSocket(socket, channel)
    })

    // 处理断开
    socket.on('disconnect', () => {
      unsubscribeSocketFromAll(socket)
    })
  })

  return io
}

export function broadcast(event: string, data: any, channel?: string) {
  const io = (global as any).io as Server
  if (!io) return

  if (isRealtimeChannel(channel)) {
    emitToChannelOrFallback(io, channel, event, data)
    return
  }

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

/**
 * 清理统计数据广播定时器
 */
export function cleanupStatsInterval() {
  if (statsInterval) {
    clearInterval(statsInterval)
    statsInterval = null
  }
}
