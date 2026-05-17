import { db, persistDb, type MapData } from './core.js'

export type { MapData }

export const mapsDb = {
  findAll(): MapData[] {
    return [...db.data.maps].sort((a, b) => b.updatedAt - a.updatedAt)
  },

  findById(id: string): MapData | undefined {
    return db.data.maps.find(m => m.id === id)
  },

  create(map: MapData): MapData {
    db.data.maps.push(map)
    persistDb()
    return map
  },

  update(id: string, updates: Partial<Omit<MapData, 'id' | 'createdAt'>>): MapData | undefined {
    const index = db.data.maps.findIndex(m => m.id === id)
    if (index === -1) return undefined

    db.data.maps[index] = {
      ...db.data.maps[index],
      ...updates,
      updatedAt: Date.now()
    }
    persistDb()
    return db.data.maps[index]
  },

  delete(id: string): void {
    db.data.maps = db.data.maps.filter(m => m.id !== id)
    persistDb()
  }
}
