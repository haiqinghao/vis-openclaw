import { v4 as uuidv4 } from 'uuid'
import { db, persistDb, type Task, type TaskAgent, type ScheduledConfig } from './core.js'

export type { Task, TaskAgent, ScheduledConfig }

export const tasksDb = {
  findAll(): Task[] {
    return [...db.data.tasks].sort((a, b) =>
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
    avatarType?: 'sheep' | 'gold'
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
      avatarType: task.avatarType || 'sheep',
      createdAt: now,
      updatedAt: now
    }
    db.data.tasks.push(newTask)
    persistDb()
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
    persistDb()
    return db.data.tasks[index]
  },

  delete(id: string): void {
    db.data.tasks = db.data.tasks.filter(t => t.id !== id)
    persistDb()
  },

  setSchedule(id: string, config: ScheduledConfig): Task | undefined {
    const index = db.data.tasks.findIndex(t => t.id === id)
    if (index === -1) return undefined

    db.data.tasks[index] = {
      ...db.data.tasks[index],
      scheduledConfig: config,
      status: config.enabled ? 'scheduled' : db.data.tasks[index].status,
      updatedAt: new Date().toISOString()
    }
    persistDb()
    return db.data.tasks[index]
  },

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
    persistDb()
    return db.data.tasks[index]
  },

  updateScheduleRun(id: string, lastRun: string, nextRun?: string): Task | undefined {
    const index = db.data.tasks.findIndex(t => t.id === id)
    if (index === -1) return undefined

    if (db.data.tasks[index].scheduledConfig) {
      db.data.tasks[index].scheduledConfig!.lastRun = lastRun
      if (nextRun) {
        db.data.tasks[index].scheduledConfig!.nextRun = nextRun
      }
      db.data.tasks[index].updatedAt = new Date().toISOString()
      persistDb()
    }
    return db.data.tasks[index]
  }
}
