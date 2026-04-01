import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.join(__dirname, '../../data')

// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

interface Agent {
  id: string
  name: string
  description: string
  model: string
  systemPrompt: string
  workspace: string
  status: string
  createdAt: string
  updatedAt: string
}

interface TaskAgent {
  agentId: string
  role: string
  instructions: string
}

// 定时任务配置
interface ScheduledConfig {
  enabled: boolean            // 是否启用定时
  mode: 'interval' | 'fixed'  // 模式：间隔启动 | 定点启动
  interval?: {                // 间隔模式配置
    value: number             // 间隔数值
    unit: 'minutes' | 'hours' // 间隔单位
  }
  fixedTime?: string          // 定点模式时间 (HH:MM 格式)
  cronId?: string             // OpenClaw cron job ID
  lastRun?: string            // 上次运行时间
  nextRun?: string            // 下次运行时间
}

interface Task {
  id: string
  name: string
  description: string
  collaborationMode: string
  status: string
  agents: TaskAgent[]
  sessionIds: string[]
  scheduledConfig?: ScheduledConfig  // 定时任务配置
  createdAt: string
  updatedAt: string
}

interface DatabaseData {
  agents: Agent[]
  tasks: Task[]
}

// 导出类型供其他模块使用
export type { ScheduledConfig, Task, TaskAgent }

const defaultData: DatabaseData = {
  agents: [],
  tasks: []
}

const dbPath = path.join(dataDir, 'visualizing-openclaw.json')
const adapter = new JSONFile<DatabaseData>(dbPath)
const db = new Low(adapter, defaultData)

// 初始化数据库
await db.read()
db.data ||= defaultData
await db.write()

// Agent 操作
export const agentDb = {
  findAll(): Agent[] {
    return db.data.agents.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  },

  findById(id: string): Agent | undefined {
    return db.data.agents.find(a => a.id === id)
  },

  create(agent: {
    name: string
    description?: string
    model?: string
    systemPrompt?: string
    workspace?: string
  }): Agent {
    const now = new Date().toISOString()
    const newAgent: Agent = {
      id: uuidv4(),
      name: agent.name,
      description: agent.description || '',
      model: agent.model || '',
      systemPrompt: agent.systemPrompt || '',
      workspace: agent.workspace || '',
      status: 'offline',
      createdAt: now,
      updatedAt: now
    }
    db.data.agents.push(newAgent)
    db.write()
    return newAgent
  },

  update(id: string, updates: Partial<Omit<Agent, 'id' | 'createdAt'>>): Agent | undefined {
    const index = db.data.agents.findIndex(a => a.id === id)
    if (index === -1) return undefined

    db.data.agents[index] = {
      ...db.data.agents[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    db.write()
    return db.data.agents[index]
  },

  delete(id: string): void {
    db.data.agents = db.data.agents.filter(a => a.id !== id)
    db.write()
  }
}

// Task 操作
export const taskDb = {
  findAll(): Task[] {
    return db.data.tasks.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  },

  findById(id: string): Task | undefined {
    return db.data.tasks.find(t => t.id === id)
  },

  create(task: {
    name: string
    description?: string
    collaborationMode?: string
    agents?: TaskAgent[]
  }): Task {
    const now = new Date().toISOString()
    const newTask: Task = {
      id: uuidv4(),
      name: task.name,
      description: task.description || '',
      collaborationMode: task.collaborationMode || 'sequential',
      status: 'pending',
      agents: task.agents || [],
      sessionIds: [],
      createdAt: now,
      updatedAt: now
    }
    db.data.tasks.push(newTask)
    db.write()
    return newTask
  },

  update(id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>): Task | undefined {
    const index = db.data.tasks.findIndex(t => t.id === id)
    if (index === -1) return undefined

    db.data.tasks[index] = {
      ...db.data.tasks[index],
      ...updates,
      updatedAt: new Date().toISOString()
    }
    db.write()
    return db.data.tasks[index]
  },

  delete(id: string): void {
    db.data.tasks = db.data.tasks.filter(t => t.id !== id)
    db.write()
  },

  // 设置定时配置
  setSchedule(id: string, config: ScheduledConfig): Task | undefined {
    const index = db.data.tasks.findIndex(t => t.id === id)
    if (index === -1) return undefined

    db.data.tasks[index] = {
      ...db.data.tasks[index],
      scheduledConfig: config,
      status: config.enabled ? 'scheduled' : db.data.tasks[index].status,
      updatedAt: new Date().toISOString()
    }
    db.write()
    return db.data.tasks[index]
  },

  // 取消定时配置
  clearSchedule(id: string): Task | undefined {
    const index = db.data.tasks.findIndex(t => t.id === id)
    if (index === -1) return undefined

    const task = db.data.tasks[index]
    db.data.tasks[index] = {
      ...task,
      scheduledConfig: undefined,
      status: task.status === 'scheduled' ? 'pending' : task.status,
      updatedAt: new Date().toISOString()
    }
    db.write()
    return db.data.tasks[index]
  },

  // 更新定时任务运行状态
  updateScheduleRun(id: string, lastRun: string, nextRun?: string): Task | undefined {
    const index = db.data.tasks.findIndex(t => t.id === id)
    if (index === -1) return undefined

    if (db.data.tasks[index].scheduledConfig) {
      db.data.tasks[index].scheduledConfig!.lastRun = lastRun
      if (nextRun) {
        db.data.tasks[index].scheduledConfig!.nextRun = nextRun
      }
      db.data.tasks[index].updatedAt = new Date().toISOString()
      db.write()
    }
    return db.data.tasks[index]
  }
}

export default db