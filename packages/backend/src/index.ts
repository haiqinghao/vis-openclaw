import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'

import { agentRouter } from './routes/agent.js'
import { sessionRouter } from './routes/session.js'
import { taskRouter } from './routes/task.js'
import { dashboardRouter } from './routes/dashboard.js'
import { gatewayRouter } from './routes/gateway.js'
import { setupWebSocket } from './services/websocket.js'

dotenv.config()

const app = express()
const httpServer = createServer(app)

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// Middleware
app.use(cors())
app.use(express.json())

// API Routes
app.use('/api/agents', agentRouter)
app.use('/api/sessions', sessionRouter)
app.use('/api/tasks', taskRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/gateway', gatewayRouter)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// WebSocket setup
setupWebSocket(io)

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason)
})

// Start server
const PORT = process.env.PORT || 4000

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
  console.log(`📡 WebSocket available at ws://localhost:${PORT}`)
  console.log('[Info] OpenClaw 数据集成已就绪')
})

export { io }