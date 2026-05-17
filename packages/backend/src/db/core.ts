import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '../../data')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

export interface Agent {
  id: string
  name: string
  description: string
  model: string
  systemPrompt: string
  workspace: string
  status: string
  avatarUnit?: string
  createdAt: string
  updatedAt: string
}

export interface TaskAgent {
  agentId: string
  role: string
  instructions: string
}

export interface ScheduledConfig {
  enabled: boolean
  mode: 'interval' | 'fixed'
  interval?: { value: number; unit: 'minutes' | 'hours' }
  fixedTime?: string
  cronId?: string
  lastRun?: string
  nextRun?: string
}

export interface Task {
  id: string
  name: string
  description: string
  collaborationMode: string
  status: string
  agents: TaskAgent[]
  sessionIds: string[]
  dispatchMode?: 'bind-existing-session' | 'gateway-session-send' | 'agent-run'
  dispatchErrors?: { agentId: string; error: string; code?: string; requestId?: string }[]
  dispatchedAt?: string
  scheduledConfig?: ScheduledConfig
  avatarType?: 'sheep' | 'gold'
  createdAt: string
  updatedAt: string
}

export interface MapData {
  id: string
  name: string
  width: number
  height: number
  layers: {
    terrain: string[][]
    environment: { x: number; y: number; type: string }[]
    units: { x: number; y: number; type: string }[]
  }
  createdAt: number
  updatedAt: number
}

export interface DatabaseData {
  agents: Agent[]
  tasks: Task[]
  maps: MapData[]
}

const dbPath = path.join(dataDir, 'visualizing-openclaw.json')
const adapter = new JSONFile<DatabaseData>(dbPath)
const defaultData: DatabaseData = { agents: [], tasks: [], maps: [] }

export const db = new Low(adapter, defaultData)

let writeQueue = Promise.resolve()

export function persistDb(): void {
  writeQueue = writeQueue
    .then(() => db.write())
    .catch((error: any) => {
      console.error('[Database] Failed to persist local data:', error?.message || error)
    })
}

export async function flushDbWrites(): Promise<void> {
  await writeQueue
}

// 初始化
await db.read()
db.data ||= defaultData
if (!db.data.maps) {
  db.data.maps = []
  await db.write()
}
