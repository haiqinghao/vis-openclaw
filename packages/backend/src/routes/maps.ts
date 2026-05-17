import { Router } from 'express'
import { mapsDb } from '../db/maps-db.js'

export const mapsRouter = Router()

// 获取所有地图列表（只返回摘要）
mapsRouter.get('/', async (_req, res) => {
  try {
    const maps = mapsDb.findAll()
    const list = maps.map(m => ({
      id: m.id,
      name: m.name,
      width: m.width,
      height: m.height,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt
    }))
    res.json({ success: true, list })
  } catch (error: any) {
    console.error('[Maps GET] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 获取单个地图完整数据
mapsRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const map = mapsDb.findById(id)

    if (!map) {
      return res.status(404).json({ error: 'Map not found' })
    }

    res.json({ success: true, map })
  } catch (error: any) {
    console.error('[Maps GET :id] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 创建/保存地图
mapsRouter.post('/', async (req, res) => {
  try {
    const mapData = req.body

    if (!mapData.id || !mapData.name) {
      return res.status(400).json({ error: 'id and name are required' })
    }

    // 如果已存在则更新，否则创建
    const existing = mapsDb.findById(mapData.id)
    if (existing) {
      const { id, createdAt, ...updates } = mapData
      mapsDb.update(mapData.id, updates)
    } else {
      mapsDb.create(mapData)
    }

    res.json({ success: true })
  } catch (error: any) {
    console.error('[Maps POST] Error:', error)
    res.status(500).json({ error: error.message })
  }
})

// 删除地图
mapsRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params
    mapsDb.delete(id)
    res.json({ success: true })
  } catch (error: any) {
    console.error('[Maps DELETE] Error:', error)
    res.status(500).json({ error: error.message })
  }
})
