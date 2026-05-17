import { runOpenClawCli } from './openclaw-command.js'

const DEFAULT_GATEWAY_CALL_TIMEOUT_MS = Number(process.env.VIS_OPENCLAW_GATEWAY_CALL_TIMEOUT_MS || 30000)
const DEFAULT_GATEWAY_CALL_RETRIES = Number(process.env.VIS_OPENCLAW_GATEWAY_CALL_RETRIES || 2)

export interface OpenClawGatewayCallOptions {
  timeoutMs?: number
  expectFinal?: boolean
}

export interface GatewaySessionSendOptions {
  idempotencyKey?: string
  thinking?: string
  attachments?: unknown[]
  gatewayTimeoutMs?: number
  agentTimeoutMs?: number
}

export interface GatewaySessionSendResult {
  runId?: string
  status?: string
  ok?: boolean
  messageSeq?: number
  [key: string]: unknown
}

export class OpenClawGatewayPermissionPendingError extends Error {
  readonly code = 'OPENCLAW_GATEWAY_PERMISSION_PENDING'
  readonly requestId: string

  constructor(requestId: string) {
    super(`OpenClaw Gateway write permission is pending approval. Run "openclaw devices approve ${requestId}" and dispatch again.`)
    this.name = 'OpenClawGatewayPermissionPendingError'
    this.requestId = requestId
  }
}

function cleanParams(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined)
  )
}

export function parseGatewayJson<T>(method: string, output: string): T {
  const trimmed = output.trim().replace(/^\uFEFF/, '')
  try {
    return JSON.parse(trimmed) as T
  } catch (error: any) {
    const approvalMatch = trimmed.match(/scope upgrade pending approval \(requestId:\s*([^)]+)\)/i)
    if (approvalMatch?.[1]) {
      throw new OpenClawGatewayPermissionPendingError(approvalMatch[1])
    }

    throw new Error(`OpenClaw gateway call "${method}" returned non-JSON output: ${trimmed.slice(0, 500)}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function callOpenClawGateway<T = unknown>(
  method: string,
  params: Record<string, unknown> = {},
  options: OpenClawGatewayCallOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_GATEWAY_CALL_TIMEOUT_MS
  const args = ['gateway', 'call', method, '--json']

  if (Object.keys(params).length > 0) {
    args.push('--params', JSON.stringify(cleanParams(params)))
  }

  args.push('--timeout', String(timeoutMs))
  if (options.expectFinal) args.push('--expect-final')

  const attempts = Math.max(1, DEFAULT_GATEWAY_CALL_RETRIES + 1)
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const output = await runOpenClawCli(args, {
      timeoutMs: timeoutMs + 5000,
      maxBuffer: 1024 * 1024 * 2,
      logPrefix: 'OpenClaw Gateway RPC'
    })

    if (output) return parseGatewayJson<T>(method, output)

    if (attempt < attempts) {
      const delayMs = 500 * attempt
      console.warn(`[OpenClaw Gateway RPC] Empty output from ${method}; retrying ${attempt}/${attempts - 1} after ${delayMs}ms`)
      await sleep(delayMs)
    }
  }

  throw new Error(`OpenClaw gateway call "${method}" returned no output`)
}

export async function listGatewaySessions(): Promise<any[]> {
  const result = await callOpenClawGateway<any>('sessions.list', {}, {
    timeoutMs: DEFAULT_GATEWAY_CALL_TIMEOUT_MS
  })

  if (Array.isArray(result)) return result
  if (Array.isArray(result?.sessions)) return result.sessions
  return []
}

export async function sendGatewaySessionMessage(
  key: string,
  message: string,
  options: GatewaySessionSendOptions = {}
): Promise<GatewaySessionSendResult> {
  return callOpenClawGateway<GatewaySessionSendResult>('sessions.send', {
    key,
    message,
    thinking: options.thinking,
    attachments: options.attachments,
    timeoutMs: options.agentTimeoutMs,
    idempotencyKey: options.idempotencyKey
  }, {
    timeoutMs: options.gatewayTimeoutMs ?? DEFAULT_GATEWAY_CALL_TIMEOUT_MS
  })
}
