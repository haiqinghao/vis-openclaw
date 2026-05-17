import { describe, expect, it } from 'vitest'
import {
  OpenClawGatewayPermissionPendingError,
  parseGatewayJson
} from '../src/services/openclaw-gateway-rpc.js'

describe('OpenClaw gateway RPC parsing', () => {
  it('parses normal JSON responses', () => {
    expect(parseGatewayJson('health', '\uFEFF{"ok":true}')).toEqual({ ok: true })
  })

  it('extracts pending approval request ids as structured errors', () => {
    expect(() => parseGatewayJson(
      'sessions.send',
      'gateway connect failed: GatewayClientRequestError: scope upgrade pending approval (requestId: abc-123)'
    )).toThrow(OpenClawGatewayPermissionPendingError)

    try {
      parseGatewayJson('sessions.send', 'scope upgrade pending approval (requestId: abc-123)')
    } catch (error) {
      expect(error).toBeInstanceOf(OpenClawGatewayPermissionPendingError)
      expect((error as OpenClawGatewayPermissionPendingError).requestId).toBe('abc-123')
      expect((error as OpenClawGatewayPermissionPendingError).code).toBe('OPENCLAW_GATEWAY_PERMISSION_PENDING')
    }
  })
})
