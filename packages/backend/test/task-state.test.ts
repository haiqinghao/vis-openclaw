import { describe, expect, it } from 'vitest'
import {
  buildEditableTaskPatch,
  canPauseTask,
  canScheduleTask,
  canStartTask,
  normalizeTaskStatus
} from '../src/services/task-state.js'

describe('task state guardrails', () => {
  it('normalizes unknown task status to pending', () => {
    expect(normalizeTaskStatus(undefined)).toBe('pending')
    expect(normalizeTaskStatus('not-a-status')).toBe('pending')
    expect(normalizeTaskStatus({ status: 'running' })).toBe('running')
  })

  it('keeps start, pause, and schedule transitions explicit', () => {
    expect(canStartTask('pending')).toBe(true)
    expect(canStartTask('dispatching')).toBe(false)
    expect(canPauseTask('pending')).toBe(true)
    expect(canPauseTask('distributed')).toBe(false)
    expect(canScheduleTask('scheduled')).toBe(true)
    expect(canScheduleTask('running')).toBe(false)
  })

  it('rejects runtime state fields from generic task updates', () => {
    const result = buildEditableTaskPatch({
      name: 'Keep this editable',
      status: 'completed',
      sessionIds: ['agent:dev:main']
    })

    expect(result.ok).toBe(false)
    expect(result.error).toContain('status')
    expect(result.error).toContain('sessionIds')
  })

  it('allows only editable task metadata through the generic update patch', () => {
    const result = buildEditableTaskPatch({
      name: 'Investigate gateway',
      description: 'Check OpenClaw session state',
      collaborationMode: 'sequential',
      avatarType: 'gold',
      agents: [{ agentId: 'dev', role: 'primary', instructions: 'Use the existing session.' }]
    })

    expect(result).toEqual({
      ok: true,
      patch: {
        name: 'Investigate gateway',
        description: 'Check OpenClaw session state',
        collaborationMode: 'sequential',
        avatarType: 'gold',
        agents: [{ agentId: 'dev', role: 'primary', instructions: 'Use the existing session.' }]
      }
    })
  })
})
