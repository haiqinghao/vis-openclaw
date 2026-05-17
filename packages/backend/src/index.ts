import express from 'express'
import cors from 'cors'
import type { CorsOptions } from 'cors'
import type { NextFunction, Request, Response } from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import dotenv from 'dotenv'

import { agentRouter } from './routes/agent.js'
import { sessionRouter } from './routes/session.js'
import { taskRouter } from './routes/task.js'
import { dashboardRouter } from './routes/dashboard.js'
import { gatewayRouter } from './routes/gateway.js'
import { mapsRouter } from './routes/maps.js'
import { setupWebSocket } from './services/websocket.js'
import { initAgentStatus } from './services/agent-status.js'

dotenv.config()

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    normalized.startsWith('127.')
}

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true

  const explicitOrigins = (process.env.VIS_CORS_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
  if (explicitOrigins.includes(origin)) return true

  try {
    return isLoopbackHost(new URL(origin).hostname)
  } catch {
    return false
  }
}

function isLocalRequest(req: Request): boolean {
  const address = req.socket.remoteAddress || ''
  return address === '::1' ||
    address === '0:0:0:0:0:0:0:1' ||
    address.startsWith('127.') ||
    address.startsWith('::ffff:127.')
}

function hasValidApiToken(req: Request): boolean {
  const expected = process.env.VIS_API_TOKEN
  if (!expected) return false

  const headerToken = req.get('x-vis-token')
  const bearer = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
  return headerToken === expected || bearer === expected
}

function localMutationGuard(req: Request, res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next()
  }

  if (isLocalRequest(req) || hasValidApiToken(req)) {
    return next()
  }

  return res.status(403).json({ error: 'Local access or VIS_API_TOKEN required' })
}

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-vis-token']
}

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: corsOptions,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});
(global as any).io = io

app.use(cors(corsOptions))
app.use(express.json({ limit: process.env.VIS_JSON_LIMIT || '2mb' }))
app.use(localMutationGuard)

app.use('/api/agents', agentRouter)
app.use('/api/sessions', sessionRouter)
app.use('/api/tasks', taskRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/gateway', gatewayRouter)
app.use('/api/maps', mapsRouter)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

setupWebSocket(io)
initAgentStatus(io)

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason)
})

const PORT = Number(process.env.PORT || 4000)
const HOST = process.env.HOST || process.env.VIS_HOST || '127.0.0.1'

httpServer.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`)
  console.log(`WebSocket available at ws://${HOST}:${PORT}`)
  console.log('[Info] OpenClaw event bridge ready')
})

export { io }
