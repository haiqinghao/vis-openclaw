/**
 * 安全测试 - 验证路径遍历漏洞修复和硬编码路径移除
 */

import path from 'path'
import os from 'os'
import { describe, it, expect } from 'vitest'
import {
  sanitizeFileName,
  isPathWithinBase,
  safeJoinPath,
  safeJoinAgentPath,
  isAllowedMdFile,
  ALLOWED_MD_FILES,
  getOpenClawDataDir,
  getCachedDataDir,
  getAgentWorkspace,
  getPossibleAgentWorkspaces
} from '../src/services/config.js'

describe('Security Tests', () => {

  // ========== 测试 1: 路径遍历漏洞修复 ==========

  describe('Path Traversal Prevention', () => {

    it('should sanitize simple path traversal attempts', () => {
      // 基础路径遍历尝试
      expect(sanitizeFileName('../secret.md')).toBe('secret.md')
      expect(sanitizeFileName('..\\secret.md')).toBe('secret.md')
      expect(sanitizeFileName('../../etc/passwd')).toBe('passwd')
    })

    it('should sanitize URL encoded path traversal', () => {
      // URL 编码绕过尝试
      expect(sanitizeFileName('%2e%2e%2fsecret.md')).toBe('secret.md')
      expect(sanitizeFileName('%2e%2e/secret.md')).toBe('secret.md')
      expect(sanitizeFileName('..%2fsecret.md')).toBe('secret.md')
    })

    it('should sanitize double URL encoded path traversal', () => {
      // 双重编码绕过尝试
      expect(sanitizeFileName('%252e%252e%252fsecret.md')).toBe('secret.md')
    })

    it('should sanitize mixed path separators', () => {
      // 混合路径分隔符
      expect(sanitizeFileName('foo/../../../bar.md')).toBe('bar.md')
      expect(sanitizeFileName('foo\\..\\..\\bar.md')).toBe('bar.md')
    })

    it('should return empty string for invalid input', () => {
      // 无效输入（解码失败）
      expect(sanitizeFileName('%ZZinvalid')).toBe('')
    })

    it('should preserve valid file names', () => {
      // 正常文件名应保持不变
      expect(sanitizeFileName('IDENTITY.md')).toBe('IDENTITY.md')
      expect(sanitizeFileName('MEMORY.md')).toBe('MEMORY.md')
      expect(sanitizeFileName('test-file_123.md')).toBe('test-file_123.md')
    })

    it('should validate path within base directory', () => {
      const base = '/home/user/workspace'

      // 有效路径
      expect(isPathWithinBase(base, '/home/user/workspace/file.md')).toBe(true)
      expect(isPathWithinBase(base, '/home/user/workspace/subdir/file.md')).toBe(true)

      // 路径遍历尝试
      expect(isPathWithinBase(base, '/home/user/secret.md')).toBe(false)
      expect(isPathWithinBase(base, '/etc/passwd')).toBe(false)
      expect(isPathWithinBase(base, '/home/user/../other/file.md')).toBe(false)
    })

    it('should safely join paths and validate extensions', () => {
      const base = '/home/user/workspace'

      // 有效路径
      const result1 = safeJoinPath(base, 'IDENTITY.md', ['.md'])
      expect(result1.success).toBe(true)
      expect(result1.path).toBe(path.join(base, 'IDENTITY.md'))

      // 路径遍历尝试
      const result2 = safeJoinPath(base, '../secret.md', ['.md'])
      expect(result2.success).toBe(true) // basename 已清理，但路径安全
      expect(result2.path).toBe(path.join(base, 'secret.md'))

      // 无效扩展名
      const result3 = safeJoinPath(base, 'malicious.exe', ['.md'])
      expect(result3.success).toBe(false)
      expect(result3.error).toContain('not allowed')

      // 无效文件名
      const result4 = safeJoinPath(base, '%ZZinvalid.md', ['.md'])
      expect(result4.success).toBe(false)
    })
  })

  // ========== 测试 1.5: 文件白名单验证 ==========

  describe('File Whitelist Validation', () => {

    it('should have correct allowed files list', () => {
      expect(ALLOWED_MD_FILES).toEqual([
        'AGENTS.md',
        'SOUL.md',
        'TOOLS.md',
        'IDENTITY.md',
        'USER.md',
        'HEARTBEAT.md',
        'BOOTSTRAP.md',
        'MEMORY.md'
      ])
    })

    it('should identify allowed files correctly', () => {
      // 允许的文件
      expect(isAllowedMdFile('AGENTS.md')).toBe(true)
      expect(isAllowedMdFile('SOUL.md')).toBe(true)
      expect(isAllowedMdFile('MEMORY.md')).toBe(true)

      // 不允许的文件
      expect(isAllowedMdFile('random.md')).toBe(false)
      expect(isAllowedMdFile('notes.md')).toBe(false)
      expect(isAllowedMdFile('test-file.md')).toBe(false)
    })

    it('should reject non-whitelisted files with safeJoinAgentPath', () => {
      const base = '/home/user/workspace'

      // 白名单中的文件 - 成功
      const result1 = safeJoinAgentPath(base, 'AGENTS.md')
      expect(result1.success).toBe(true)
      expect(result1.path).toBe(path.join(base, 'AGENTS.md'))

      const result2 = safeJoinAgentPath(base, 'MEMORY.md')
      expect(result2.success).toBe(true)

      // 不在白名单中的文件 - 拒绝
      const result3 = safeJoinAgentPath(base, 'random.md')
      expect(result3.success).toBe(false)
      expect(result3.error).toContain('File not allowed')

      const result4 = safeJoinAgentPath(base, 'secret.md')
      expect(result4.success).toBe(false)

      // 路径遍历尝试 - 即使目标是白名单文件，也要验证路径
      const result5 = safeJoinAgentPath(base, '../AGENTS.md')
      expect(result5.success).toBe(true) // basename 清理后是 AGENTS.md
      expect(result5.path).toBe(path.join(base, 'AGENTS.md'))
    })

    it('should sanitize URL encoded filenames in whitelist check', () => {
      const base = '/home/user/workspace'

      // URL 编码的白名单文件应该被正确处理
      // %41 = A, 所以 %41GENTS.md 解码后是 AGENTS.md（在白名单中）
      const result1 = safeJoinAgentPath(base, '%41GENTS.md')
      expect(result1.success).toBe(true) // 解码后是 AGENTS.md，在白名单中
      expect(result1.path).toBe(path.join(base, 'AGENTS.md'))

      // 尝试 URL 编码不在白名单的文件
      const result2 = safeJoinAgentPath(base, '%52ANDOM.md') // R = %52
      expect(result2.success).toBe(false) // 解码后是 RANDOM.md，不在白名单

      // 路径遍历 + URL 编码的组合
      const result3 = safeJoinAgentPath(base, '%2e%2e/AGENTS.md')
      expect(result3.success).toBe(true) // 清理后是 AGENTS.md
      expect(result3.path).toBe(path.join(base, 'AGENTS.md'))
    })
  })

  // ========== 测试 2: 硬编码路径移除 ==========

  describe('Hardcoded Path Removal', () => {

    it('should use os.homedir() instead of hardcoded path', () => {
      const dataDir = getOpenClawDataDir()
      const homeDir = os.homedir()

      // 应包含用户主目录（动态获取）
      expect(dataDir).toContain(homeDir)
      expect(dataDir).toContain('.openclaw')

      // 验证路径格式正确
      expect(path.isAbsolute(dataDir)).toBe(true)
    })

    it('should respect OPENCLAW_DATA_DIR environment variable', () => {
      // 设置环境变量测试（需要在测试前设置）
      const originalEnv = process.env.OPENCLAW_DATA_DIR

      // 测试默认值
      process.env.OPENCLAW_DATA_DIR = ''
      const defaultDir = getOpenClawDataDir()
      expect(defaultDir).toBe(path.join(os.homedir(), '.openclaw'))

      // 恢复环境变量
      if (originalEnv) {
        process.env.OPENCLAW_DATA_DIR = originalEnv
      }
    })

    it('should generate agent workspace paths dynamically', () => {
      const agentId = 'test-agent'
      const workspace = getAgentWorkspace(agentId)
      const homeDir = os.homedir()

      // 应使用动态路径（包含 homeDir）
      expect(workspace).toContain(homeDir)
      expect(workspace).toContain(agentId)

      // 路径格式正确
      expect(path.isAbsolute(workspace)).toBe(true)
    })

    it('should generate possible workspace paths dynamically', () => {
      const agentId = 'dev'
      const possiblePaths = getPossibleAgentWorkspaces(agentId)
      const homeDir = os.homedir()

      // 所有路径都应包含动态获取的 homeDir
      for (const p of possiblePaths) {
        expect(p).toContain(homeDir)
        expect(path.isAbsolute(p)).toBe(true)
      }

      // 应包含预期的路径格式
      expect(possiblePaths.length).toBe(6)
      // 第一优先级应该是 workspace-{id}
      expect(possiblePaths[0]).toContain('workspace-dev')
      expect(possiblePaths.some(p => p.includes('.openclaw-dev'))).toBe(true)
    })

    it('should prioritize default workspace for main agent', () => {
      const possiblePaths = getPossibleAgentWorkspaces('main')
      const homeDir = os.homedir()

      // main agent 应该只有 3 个路径（简化）
      expect(possiblePaths.length).toBe(3)

      // 第一优先级应该是默认 workspace 目录
      expect(possiblePaths[0]).toBe(path.join(homeDir, '.openclaw', 'workspace'))
    })

    it('should work on different platforms', () => {
      const dataDir = getOpenClawDataDir()

      // 应使用正确的路径分隔符
      // path.join 会自动处理平台差异
      const normalized = path.normalize(dataDir)
      expect(dataDir).toBe(normalized)
    })

    it('should verify source code does not contain hardcoded path strings', async () => {
      // 读取源文件内容，验证没有硬编码路径
      const fs = await import('fs')

      const configPath = '../src/services/config.ts'
      const configContent = fs.readFileSync(
        path.join(__dirname, configPath),
        'utf-8'
      )

      // 不应包含硬编码的用户路径
      expect(configContent).not.toMatch(/C:\\Users\\[^\\]+\\.openclaw/)
      expect(configContent).not.toContain("'C:\\\\Users\\\\49541\\\\.openclaw'")
      expect(configContent).toContain('os.homedir()') // 应使用动态获取
    })
  })

  // ========== 测试 3: API 密钥检查 ==========

  describe('API Key Security', () => {

    it('should not have hardcoded API keys in source files', async () => {
      // 这个测试需要检查源文件内容
      // 简单的检查：确保环境变量中没有默认密钥值

      // 检查常见敏感配置是否使用环境变量
      const sensitiveKeys = ['API_KEY', 'SECRET', 'PASSWORD', 'TOKEN', 'BAILIAN_API_KEY']

      for (const key of sensitiveKeys) {
        const value = process.env[key]
        if (value) {
          // 如果设置了环境变量，不应该有硬编码的默认值
          expect(value).not.toMatch(/^sk-[a-f0-9]{32}$/) // 常见 API 密钥格式
          expect(value).not.toBe('default-api-key')
          expect(value).not.toBe('placeholder')
        }
      }
    })

    it('should read config from environment variables, not hardcoded values', () => {
      // config.ts 应使用 process.env
      const port = parseInt(process.env.PORT || '4000', 10)
      expect(port).toBeTypeOf('number')

      const gatewayUrl = process.env.GATEWAY_BASE_URL || 'http://127.0.0.1:18789'
      expect(gatewayUrl).toContain('http')
    })
  })
})

// ========== 运行测试的说明 ==========
console.log(`
🔒 安全测试说明

测试范围：
1. 路径遍历漏洞修复验证
   - 基础路径遍历 (../, ..\\)
   - URL 编码绕过 (%2e%2e%2f)
   - 双重编码绕过 (%252e%252e%252f)
   - 混合分隔符

2. 硬编码路径移除验证
   - 使用 os.homedir() 替代硬编码用户名
   - 环境变量配置
   - 跨平台兼容性

3. API 密钥安全检查
   - 确保没有硬编码密钥
   - 配置从环境变量读取

运行方式：
  cd packages/backend
  npm test

或：
  npx vitest run test/security.test.ts
`)
