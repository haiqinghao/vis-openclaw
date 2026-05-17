import { Router } from 'express'
import axios from 'axios'
import { runOpenClawCli } from '../services/openclaw-command.js'

export const gatewayRouter = Router()

// Gateway 基础 URL
const GATEWAY_BASE_URL = process.env.GATEWAY_BASE_URL || 'http://127.0.0.1:18789'

// 获取 Gateway 状态
gatewayRouter.get('/status', async (_req, res) => {
  try {
    const response = await axios.get(`${GATEWAY_BASE_URL}/health`, {
      timeout: 3000,
      proxy: false
    })

    if (response.status === 200) {
      res.json({ status: 'ok', data: response.data })
    } else {
      res.json({ status: 'error' })
    }
  } catch {
    // Gateway 未运行或未安装，静默返回错误状态
    res.json({ status: 'error', message: 'Gateway not reachable' })
  }
})

// 启动 Gateway
gatewayRouter.post('/start', async (_req, res) => {
  try {
    // 先尝试以服务模式启动
    let output = ''
    let serviceMode = false

    try {
      output = await runOpenClawCli(['gateway', 'start'], {
        timeoutMs: 10000,
        logPrefix: 'Gateway Route'
      }) || ''
      serviceMode = true
      if (output.includes('service missing') || output.includes('not installed')) {
        throw new Error(output)
      }
    } catch (e: any) {
      output = e.stdout || e.stderr || e.message || ''

      // 检查是否服务未安装
      if (output.includes('service missing') || output.includes('not installed')) {
        // 尝试直接启动 gateway（非服务模式）
        try {
          output = await runOpenClawCli(['gateway'], {
            timeoutMs: 5000,
            logPrefix: 'Gateway Route'
          }) || ''
          serviceMode = false
        } catch (e2: any) {
          output = e2.stdout || e2.stderr || e2.message || ''
        }
      }
    }

    res.json({
      success: true,
      message: serviceMode ? 'Gateway 服务启动中...' : 'Gateway 启动中...',
      output,
      hint: output.includes('service missing')
        ? '请先安装 Gateway 服务: openclaw gateway install'
        : undefined
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
      hint: '请确保 OpenClaw 已正确安装'
    })
  }
})

// 重启 Gateway
gatewayRouter.post('/restart', async (_req, res) => {
  try {
    let output = ''

    try {
      output = await runOpenClawCli(['gateway', 'restart'], {
        timeoutMs: 15000,
        logPrefix: 'Gateway Route'
      }) || ''
    } catch (e: any) {
      output = e.stdout || e.stderr || e.message || ''
    }

    res.json({
      success: true,
      message: 'Gateway 重启中...',
      output
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})

// 停止 Gateway
gatewayRouter.post('/stop', async (_req, res) => {
  try {
    let output = ''

    try {
      output = await runOpenClawCli(['gateway', 'stop'], {
        timeoutMs: 10000,
        logPrefix: 'Gateway Route'
      }) || ''
    } catch (e: any) {
      output = e.stdout || e.stderr || e.message || ''
    }

    res.json({
      success: true,
      message: 'Gateway 已停止',
      output
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
})
