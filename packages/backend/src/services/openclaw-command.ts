import { execFile, spawn } from 'child_process'

export interface OpenClawCommandOptions {
  timeoutMs?: number
  maxBuffer?: number
  logPrefix?: string
}

function displayArg(arg: string): string {
  if (/^[a-zA-Z0-9_./:=@-]+$/.test(arg)) return arg
  const safe = arg.length > 120 ? `${arg.slice(0, 117)}...` : arg
  return JSON.stringify(safe)
}

function killProcessTree(pid: number): void {
  if (process.platform === 'win32') {
    execFile('taskkill.exe', ['/pid', String(pid), '/t', '/f'], { windowsHide: true }, () => {})
    return
  }

  try {
    process.kill(-pid, 'SIGKILL')
  } catch {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
}

export async function runOpenClawCli(args: string[], options: OpenClawCommandOptions = {}): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? 120000
  const maxBuffer = options.maxBuffer ?? 1024 * 1024 * 2
  const logPrefix = options.logPrefix ?? 'OpenClaw CLI'
  const displayCommand = `openclaw ${args.map(displayArg).join(' ')}`

  return new Promise((resolve) => {
    console.log(`[${logPrefix}] Running: ${displayCommand}`)

    const isWindows = process.platform === 'win32'
    const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'openclaw'
    const commandArgs = isWindows ? ['/d', '/s', '/c', 'openclaw', ...args] : args

    let stdout = ''
    let stderr = ''
    let settled = false

    const child = spawn(command, commandArgs, {
      detached: !isWindows,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const finish = (value: string | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length + chunk.length <= maxBuffer) {
        stdout += chunk.toString('utf-8')
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length + chunk.length <= maxBuffer) {
        stderr += chunk.toString('utf-8')
      }
    })

    child.on('error', (error) => {
      console.error(`[${logPrefix}] Error:`, error.message)
      finish(null)
    })

    child.on('close', (code) => {
      const output = stdout.trim() || stderr.trim() || null
      if (code && code !== 0) {
        console.error(`[${logPrefix}] Exit code ${code}: ${displayCommand}`)
      }
      finish(output)
    })

    const timer = setTimeout(() => {
      if (settled) return
      console.warn(`[${logPrefix}] Timeout after ${timeoutMs}ms: ${displayCommand}`)
      if (child.pid) killProcessTree(child.pid)
      finish(null)
    }, timeoutMs)
  })
}
