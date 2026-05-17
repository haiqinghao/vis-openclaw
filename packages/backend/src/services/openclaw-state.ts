import * as fs from 'fs'
import * as path from 'path'
import os from 'os'
import { getCachedDataDir } from './config.js'

export interface OpenClawAgentInfo {
  id: string
  name: string
  description: string
  status: 'online' | 'offline' | 'busy'
  workspace: string
  model: string
  avatar: string | null
  emoji: string | null
  source: 'openclaw-config'
}

export interface OpenClawSessionInfo {
  key: string
  kind: string
  age: string
  ageMs: number
  model: string
  agentId: string
  sessionId: string | null
  sessionFile: string | null
  updatedAt: number
  sessionStartedAt?: number
  startedAt?: number
  endedAt?: number
  runtimeMs?: number
  status?: string
  hasActiveRun?: boolean
  abortedLastRun?: boolean
  source: 'openclaw-sessions-json'
}

interface SessionListFilters {
  activeMinutes?: number
  kinds?: string[]
  limit?: number
}

function getOpenClawDataDir(): string {
  return getCachedDataDir()
}

function resolveHomePath(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  const trimmed = value.trim()
  if (trimmed === '~') return os.homedir()
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2))
  }
  return trimmed
}

function getConfiguredAgentModel(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof (value as any).primary === 'string') {
    return (value as any).primary
  }
  return ''
}

function parseIdentityField(identityPath: string, field: string): string | null {
  try {
    if (!fs.existsSync(identityPath)) return null
    const content = fs.readFileSync(identityPath, 'utf-8')
    const match = content.match(new RegExp(`[-*]\\s*\\**${field}:\\**\\s*(.+)`, 'i'))
    const value = match?.[1]?.trim()
    return value || null
  } catch {
    return null
  }
}

function parseIdentityDescription(identityPath: string): string {
  try {
    if (!fs.existsSync(identityPath)) return ''
    const content = fs.readFileSync(identityPath, 'utf-8')
    const nameMatch = content.match(/[-*]\s*\**Name:\**\s*(.+)/i)
    const emojiMatch = content.match(/[-*]\s*\**Emoji:\**\s*(.+)/i)
    const name = nameMatch?.[1]?.trim()
    const emoji = emojiMatch?.[1]?.trim()
    if (name) return `${emoji ? `${emoji} ` : ''}${name} (IDENTITY.md)`

    const identityMatch = content.match(/Identity:\s*(.+)/i)
    if (identityMatch) return identityMatch[1].trim()
    const headingMatch = content.match(/^#\s+(.+)$/m)
    return headingMatch ? headingMatch[1].trim() : ''
  } catch {
    return ''
  }
}

function readOpenClawConfig(): any {
  const configPath = path.join(getOpenClawDataDir(), 'openclaw.json')
  if (!fs.existsSync(configPath)) return {}
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
}

export function readConfiguredAgents(): OpenClawAgentInfo[] {
  try {
    const dataDir = getOpenClawDataDir()
    const config = readOpenClawConfig()
    const defaults = config?.agents?.defaults || {}
    const configuredAgents = Array.isArray(config?.agents?.list) && config.agents.list.length > 0
      ? config.agents.list
      : [{ id: 'main' }]
    const defaultModel = getConfiguredAgentModel(defaults.model)

    return configuredAgents
      .map((agent: any): OpenClawAgentInfo | null => {
        const id = String(agent?.id || '').trim()
        if (!id) return null

        const defaultWorkspace = id === 'main'
          ? resolveHomePath(defaults.workspace) || path.join(dataDir, 'workspace')
          : path.join(dataDir, 'agents', id, 'workspace')
        const workspace = resolveHomePath(agent.workspace) || defaultWorkspace
        const identityPath = path.join(workspace, 'IDENTITY.md')

        return {
          id,
          name: agent.name || id,
          description: parseIdentityDescription(identityPath),
          status: 'online',
          workspace,
          model: getConfiguredAgentModel(agent.model) || defaultModel,
          avatar: parseIdentityField(identityPath, 'Avatar'),
          emoji: parseIdentityField(identityPath, 'Emoji'),
          source: 'openclaw-config'
        }
      })
      .filter((agent: OpenClawAgentInfo | null): agent is OpenClawAgentInfo => Boolean(agent))
  } catch (error: any) {
    console.error('[openclaw-state] Failed to read configured agents:', error.message)
    return []
  }
}

function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return 'unknown'
  const seconds = Math.floor(ageMs / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function readAgentSessions(agentId: string): OpenClawSessionInfo[] {
  const sessionsJsonPath = path.join(getOpenClawDataDir(), 'agents', agentId, 'sessions', 'sessions.json')
  if (!fs.existsSync(sessionsJsonPath)) return []

  try {
    const sessionsJson = JSON.parse(fs.readFileSync(sessionsJsonPath, 'utf-8'))
    const now = Date.now()

    return Object.entries(sessionsJson).map(([key, value]) => {
      const sessionData = value as any
      const sessionId = typeof sessionData.sessionId === 'string' ? sessionData.sessionId : null
      const updatedAt = typeof sessionData.updatedAt === 'number'
        ? sessionData.updatedAt
        : fs.statSync(sessionsJsonPath).mtimeMs
      const ageMs = Math.max(0, now - updatedAt)
      const model = [sessionData.modelProvider, sessionData.model].filter(Boolean).join('/')

      return {
        key,
        kind: sessionData.chatType || 'direct',
        age: formatAge(ageMs),
        ageMs,
        model,
        agentId,
        sessionId,
        sessionFile: typeof sessionData.sessionFile === 'string' ? sessionData.sessionFile : null,
        updatedAt,
        ...(typeof sessionData.sessionStartedAt === 'number'
          ? { sessionStartedAt: sessionData.sessionStartedAt }
          : {}),
        ...(typeof sessionData.startedAt === 'number'
          ? { startedAt: sessionData.startedAt }
          : {}),
        ...(typeof sessionData.endedAt === 'number'
          ? { endedAt: sessionData.endedAt }
          : {}),
        ...(typeof sessionData.runtimeMs === 'number'
          ? { runtimeMs: sessionData.runtimeMs }
          : {}),
        ...(typeof sessionData.status === 'string' ? { status: sessionData.status } : {}),
        ...(typeof sessionData.hasActiveRun === 'boolean'
          ? { hasActiveRun: sessionData.hasActiveRun }
          : {}),
        ...(typeof sessionData.abortedLastRun === 'boolean'
          ? { abortedLastRun: sessionData.abortedLastRun }
          : {}),
        source: 'openclaw-sessions-json'
      } satisfies OpenClawSessionInfo
    })
  } catch (error: any) {
    console.error(`[openclaw-state] Failed to read sessions for ${agentId}:`, error.message)
    return []
  }
}

export function readLocalSessions(filters?: SessionListFilters): OpenClawSessionInfo[] {
  const agentIds = readConfiguredAgents().map((agent) => agent.id)
  const now = Date.now()
  let sessions = agentIds.flatMap((agentId) => readAgentSessions(agentId))

  if (filters?.activeMinutes !== undefined) {
    const maxAgeMs = filters.activeMinutes * 60 * 1000
    sessions = sessions.filter((session) => now - session.updatedAt <= maxAgeMs)
  }

  if (filters?.kinds?.length) {
    const allowedKinds = new Set(filters.kinds)
    sessions = sessions.filter((session) => allowedKinds.has(session.kind))
  }

  sessions.sort((a, b) => b.updatedAt - a.updatedAt)

  if (filters?.limit && filters.limit > 0) {
    sessions = sessions.slice(0, filters.limit)
  }

  return sessions
}

export function findLocalSession(sessionIdOrKey: string): OpenClawSessionInfo | null {
  if (!sessionIdOrKey) return null
  return readLocalSessions().find((session) =>
    session.key === sessionIdOrKey || session.sessionId === sessionIdOrKey
  ) ?? null
}
