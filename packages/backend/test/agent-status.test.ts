import { beforeEach, describe, expect, it, vi } from 'vitest'

function localSession(overrides: Record<string, unknown>) {
  return {
    key: 'agent:dev:main',
    kind: 'direct',
    age: '0s',
    ageMs: 0,
    model: 'test/model',
    agentId: 'dev',
    sessionId: 'session-dev',
    sessionFile: null,
    updatedAt: 0,
    source: 'openclaw-sessions-json' as const,
    ...overrides
  }
}

describe('agent status local session reconciliation', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../src/services/openclaw-state.js', () => ({
      readLocalSessions: () => []
    }))
  })

  it('marks an active status as error when OpenClaw reports the session timed out', async () => {
    const {
      reportAgentStatusEvent,
      reconcileAgentStatusesFromSessions
    } = await import('../src/services/agent-status.js')

    const eventAt = 100_000
    reportAgentStatusEvent({
      agentId: 'dev',
      state: 'running',
      sessionKey: 'agent:dev:main',
      sessionId: 'session-dev',
      timestamp: eventAt
    })

    const reconciled = reconcileAgentStatusesFromSessions([
      localSession({
        updatedAt: eventAt + 1000,
        endedAt: eventAt + 500,
        hasActiveRun: false,
        status: 'timeout'
      })
    ], eventAt + 20_000)

    expect(reconciled).toHaveLength(1)
    expect(reconciled[0].state).toBe('error')
    expect(reconciled[0].detail).toContain('timeout')
  })

  it('does not trust an older terminal session over a fresh active event', async () => {
    const {
      reportAgentStatusEvent,
      reconcileAgentStatusesFromSessions
    } = await import('../src/services/agent-status.js')

    const eventAt = 100_000
    reportAgentStatusEvent({
      agentId: 'dev',
      state: 'running',
      sessionKey: 'agent:dev:main',
      sessionId: 'session-dev',
      timestamp: eventAt
    })

    const reconciled = reconcileAgentStatusesFromSessions([
      localSession({
        updatedAt: eventAt - 5000,
        endedAt: eventAt - 4000,
        hasActiveRun: false,
        status: 'done'
      })
    ], eventAt + 20_000)

    expect(reconciled).toHaveLength(0)
  })

  it('restores a stale status to idle when OpenClaw reports a newer completed session', async () => {
    const {
      reportAgentStatusEvent,
      reconcileAgentStatusesFromSessions
    } = await import('../src/services/agent-status.js')

    const eventAt = 100_000
    reportAgentStatusEvent({
      agentId: 'main',
      state: 'stale',
      sessionKey: 'agent:main:main',
      sessionId: 'session-main',
      timestamp: eventAt,
      detail: 'No OpenClaw status event received before timeout'
    })

    const reconciled = reconcileAgentStatusesFromSessions([
      localSession({
        key: 'agent:main:main',
        agentId: 'main',
        sessionId: 'session-main',
        updatedAt: eventAt + 1000,
        endedAt: eventAt + 500,
        hasActiveRun: false,
        status: 'done'
      })
    ], eventAt + 20_000)

    expect(reconciled).toHaveLength(1)
    expect(reconciled[0].state).toBe('idle')
    expect(reconciled[0].detail).toContain('done')
  })

  it('keeps the newest state for repeated session keys', async () => {
    const {
      getAllSessionStates,
      getSessionState,
      reportAgentStatusEvent
    } = await import('../src/services/agent-status.js')

    reportAgentStatusEvent({
      agentId: 'main',
      state: 'thinking',
      sessionKey: 'agent:main:main',
      sessionId: 'old-session',
      timestamp: 100_000
    })

    reportAgentStatusEvent({
      agentId: 'main',
      state: 'idle',
      sessionKey: 'agent:main:main',
      sessionId: 'new-session',
      timestamp: 110_000
    })

    expect(getSessionState('agent:main:main')?.state).toBe('idle')
    expect(getAllSessionStates().filter(entry => entry.sessionKey === 'agent:main:main')).toHaveLength(1)
  })

  it('does not turn an old idle terminal state into stale', async () => {
    const {
      getAgentSessionState,
      reportAgentStatusEvent
    } = await import('../src/services/agent-status.js')

    reportAgentStatusEvent({
      agentId: 'main',
      state: 'idle',
      sessionKey: 'agent:main:main',
      sessionId: 'session-main',
      timestamp: Date.now() - 10 * 60 * 1000
    })

    expect(getAgentSessionState('main')).toBe('idle')
  })
})
