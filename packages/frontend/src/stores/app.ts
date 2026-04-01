import { defineStore } from 'pinia'
import { ref } from 'vue'
import { io, Socket } from 'socket.io-client'
import { useAgentStore } from './agent'
import { useSessionStore } from './session'
import { useTaskStore } from './task'

export const useAppStore = defineStore('app', () => {
  const socket = ref<Socket | null>(null)
  const isConnected = ref(false)
  const stats = ref({
    agentCount: 0,
    sessionCount: 0,
    taskCount: 0,
    runningCount: 0
  })

  function connect() {
    if (socket.value?.connected) return

    socket.value = io('/', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    })

    socket.value.on('connect', () => {
      isConnected.value = true
      console.log('[WebSocket] Connected')
    })

    socket.value.on('disconnect', () => {
      isConnected.value = false
      console.log('[WebSocket] Disconnected')
    })

    socket.value.on('stats:update', (newStats: typeof stats.value) => {
      stats.value = newStats
    })

    socket.value.on('agent:updated', (agent: any) => {
      const agentStore = useAgentStore()
      agentStore.updateAgent(agent)
    })

    socket.value.on('session:created', (session: any) => {
      const sessionStore = useSessionStore()
      sessionStore.addSession(session)
    })

    socket.value.on('session:updated', (session: any) => {
      const sessionStore = useSessionStore()
      sessionStore.updateSession(session)
    })

    socket.value.on('session:message', (data: any) => {
      const sessionStore = useSessionStore()
      sessionStore.addMessage(data.sessionId, data.message)
    })

    socket.value.on('task:created', (task: any) => {
      const taskStore = useTaskStore()
      taskStore.addTask(task)
    })

    socket.value.on('task:updated', (task: any) => {
      const taskStore = useTaskStore()
      taskStore.updateTask(task)
    })
  }

  function disconnect() {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
    }
    isConnected.value = false
  }

  function subscribe(channel: string) {
    socket.value?.emit('subscribe', channel)
  }

  return {
    socket,
    isConnected,
    stats,
    connect,
    disconnect,
    subscribe
  }
})