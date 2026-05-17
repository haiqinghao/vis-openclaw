import { describe, expect, it } from 'vitest'
import { buildTaskDispatchMessage, extractTaskMentions } from '../src/services/task-dispatch.js'

describe('task dispatch message', () => {
  it('builds a readable OpenClaw task message with interpolated task fields', () => {
    const message = buildTaskDispatchMessage(
      {
        id: 'task-123',
        name: '检查 Gateway 状态',
        description: '请检查 @dev 的 OpenClaw 会话状态。',
        collaborationMode: 'parallel'
      },
      {
        agentId: 'dev',
        requestedAgentId: 'dev',
        sessionKey: 'agent:dev:main',
        role: 'primary',
        instructions: '优先检查任务分发链路。'
      }
    )

    expect(message).toContain('[VIS OpenClaw 任务分发]')
    expect(message).toContain('任务名称：检查 Gateway 状态')
    expect(message).toContain('任务 ID：task-123')
    expect(message).toContain('协作模式：parallel')
    expect(message).toContain('Agent 角色：primary')
    expect(message).toContain('任务描述：')
    expect(message).toContain('请检查 @dev 的 OpenClaw 会话状态。')
    expect(message).toContain('给当前 Agent 的指令：')
    expect(message).toContain('优先检查任务分发链路。')
  })

  it('extracts task mentions without treating emails or scoped packages as agents', () => {
    expect(extractTaskMentions('请 @main 和 @[dev] 一起处理，联系 test@company.com，检查 @vue/runtime。')).toEqual([
      'main',
      'dev'
    ])
  })
})
