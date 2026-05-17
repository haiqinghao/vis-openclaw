import { v4 as uuidv4 } from 'uuid'
import { db, persistDb, type Agent } from './core.js'

export type { Agent }

export const agentsDb = {
  findAll(): Agent[] {
    return [...db.data.agents].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  },

  findById(id: string): Agent | undefined {
    return db.data.agents.find(a => a.id === id)
  },

  create(agent: {
    id?: string
    name: string
    description?: string
    model?: string
    systemPrompt?: string
    workspace?: string
    status?: string
    avatarUnit?: string
  }): Agent {
    const now = new Date().toISOString()
    const newAgent: Agent = {
      id: agent.id || uuidv4(),
      name: agent.name,
      description: agent.description || '',
      model: agent.model || '',
      systemPrompt: agent.systemPrompt || '',
      workspace: agent.workspace || '',
      status: agent.status || 'offline',
      avatarUnit: agent.avatarUnit || '',
      createdAt: now,
      updatedAt: now
    }
    db.data.agents.push(newAgent)
    persistDb()
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
    persistDb()
    return db.data.agents[index]
  },

  delete(id: string): void {
    db.data.agents = db.data.agents.filter(a => a.id !== id)
    persistDb()
  }
}
