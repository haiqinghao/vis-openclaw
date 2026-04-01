/**
 * 安全配置模块
 * - 使用环境变量替代硬编码路径
 * - 提供安全的路径解析方法
 */

import os from 'os'
import path from 'path'

/**
 * 获取 OpenClaw 数据目录
 * 优先使用环境变量，其次使用用户主目录
 */
export function getOpenClawDataDir(): string {
  const envDir = process.env.OPENCLAW_DATA_DIR
  
  if (envDir) {
    return envDir
  }
  
  // 使用 os.homedir() 获取用户主目录（跨平台）
  return path.join(os.homedir(), '.openclaw')
}

/**
 * 获取 Agent 工作目录
 */
export function getAgentWorkspace(agentId: string): string {
  const dataDir = getOpenClawDataDir()
  return path.join(dataDir, 'agents', agentId, 'workspace')
}

/**
 * 获取可能的 Agent 工作目录列表（按优先级排序）
 * 注意：main agent 默认使用 ~/.openclaw/workspace 目录
 */
export function getPossibleAgentWorkspaces(agentId: string): string[] {
  const dataDir = getOpenClawDataDir()
  
  // 对于 main agent，优先检查默认 workspace 目录
  if (agentId === 'main') {
    return [
      path.join(dataDir, 'workspace'),           // main agent 默认目录（最优先）
      path.join(dataDir, 'agents', 'main', 'workspace'),
      path.join(dataDir, 'agents', 'main', 'agent')
    ]
  }
  
  // 其他 agent 的工作目录查找顺序
  // 支持: workspace-{id}, {id}-workspace, agents/{id}/workspace 等格式
  return [
    path.join(dataDir, `workspace-${agentId}`),  // workspace-dev, workspace-business
    path.join(dataDir, `${agentId}-workspace`),  // dev-workspace
    path.join(dataDir, 'agents', agentId, 'workspace'),
    path.join(dataDir, 'agents', agentId, 'agent'),
    path.join(dataDir, 'workspace')  // 回退到默认目录
  ]
}

/**
 * 安全地解析文件名，防止路径遍历攻击
 * 使用 path.basename() 只取文件名，忽略任何路径部分
 */
export function sanitizeFileName(fileName: string): string {
  // 解码 URL 编码（防止编码绕过）
  let decoded = fileName
  try {
    // 多次解码以处理双重编码
    while (decoded.includes('%')) {
      const newDecoded = decodeURIComponent(decoded)
      if (newDecoded === decoded) break
      decoded = newDecoded
    }
  } catch {
    // 解码失败，返回空字符串表示无效
    return ''
  }
  
  // 使用 path.basename() 只保留文件名部分
  const safeName = path.basename(decoded)
  
  // 移除任何可能残留的路径分隔符
  return safeName.replace(/[\/\\]/g, '')
}

/**
 * 验证文件路径是否在预期的目录范围内
 * 防止路径遍历到其他目录
 */
export function isPathWithinBase(basePath: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(basePath)
  const resolvedTarget = path.resolve(targetPath)
  
  // 确保目标路径以基础路径开头
  return resolvedTarget.startsWith(resolvedBase + path.sep) || 
         resolvedTarget === resolvedBase
}

/**
 * 安全构建文件路径
 * 结合 sanitizeFileName 和 isPathWithinBase 进行完整验证
 */
export function safeJoinPath(basePath: string, fileName: string, allowedExtensions?: string[]): { 
  success: boolean
  path?: string
  error?: string 
} {
  // 1. 清理文件名
  const safeName = sanitizeFileName(fileName)
  
  if (!safeName) {
    return { success: false, error: 'Invalid file name' }
  }
  
  // 2. 验证扩展名（如果指定了允许的扩展名）
  if (allowedExtensions && allowedExtensions.length > 0) {
    const ext = path.extname(safeName).toLowerCase()
    if (!allowedExtensions.includes(ext)) {
      return { 
        success: false, 
        error: `File extension not allowed. Allowed: ${allowedExtensions.join(', ')}` 
      }
    }
  }
  
  // 3. 构建完整路径
  const fullPath = path.join(basePath, safeName)
  
  // 4. 验证路径在预期范围内
  if (!isPathWithinBase(basePath, fullPath)) {
    return { success: false, error: 'Path traversal detected' }
  }
  
  return { success: true, path: fullPath }
}

/**
 * 允许访问的 .md 文件白名单
 * 只允许读取这些特定的配置文件
 */
export const ALLOWED_MD_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
  'IDENTITY.md',
  'USER.md',
  'HEARTBEAT.md',
  'BOOTSTRAP.md',
  'MEMORY.md'
]

/**
 * 检查文件名是否在允许的白名单中
 */
export function isAllowedMdFile(fileName: string): boolean {
  const safeName = sanitizeFileName(fileName)
  return ALLOWED_MD_FILES.includes(safeName)
}

/**
 * 安全构建 Agent 配置文件路径（带白名单验证）
 */
export function safeJoinAgentPath(basePath: string, fileName: string): { 
  success: boolean
  path?: string
  error?: string 
} {
  // 1. 清理文件名
  const safeName = sanitizeFileName(fileName)
  
  if (!safeName) {
    return { success: false, error: 'Invalid file name' }
  }
  
  // 2. 验证是否在白名单中
  if (!ALLOWED_MD_FILES.includes(safeName)) {
    return { 
      success: false, 
      error: `File not allowed. Allowed files: ${ALLOWED_MD_FILES.join(', ')}` 
    }
  }
  
  // 3. 验证扩展名
  if (!safeName.endsWith('.md')) {
    return { success: false, error: 'Only .md files are allowed' }
  }
  
  // 4. 构建完整路径
  const fullPath = path.join(basePath, safeName)
  
  // 5. 验证路径在预期范围内
  if (!isPathWithinBase(basePath, fullPath)) {
    return { success: false, error: 'Path traversal detected' }
  }
  
  return { success: true, path: fullPath }
}

/**
 * 配置缓存（避免重复计算）
 */
let cachedDataDir: string | null = null

export function getCachedDataDir(): string {
  if (!cachedDataDir) {
    cachedDataDir = getOpenClawDataDir()
  }
  return cachedDataDir
}

/**
 * 获取服务器端口
 */
export function getServerPort(): number {
  return parseInt(process.env.PORT || '4000', 10)
}

/**
 * 获取 Gateway URL
 */
export function getGatewayBaseUrl(): string {
  return process.env.GATEWAY_BASE_URL || 'http://127.0.0.1:18789'
}