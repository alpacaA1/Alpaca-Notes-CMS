import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const workspaceRoot = resolve(__dirname, '..', '..')
const adminAppRoot = resolve(workspaceRoot, 'admin-app')
const sourceAdminDir = resolve(workspaceRoot, 'source', 'admin')
const generatedIndexPath = resolve(sourceAdminDir, 'index.html')
const legacyIndexPath = resolve(workspaceRoot, 'docs', 'legacy-admin', 'index.html')
const staleSentinelPath = resolve(sourceAdminDir, '__stale-sentinel__.txt')

function runBuild() {
  execFileSync('npm', ['run', 'build'], {
    cwd: adminAppRoot,
    stdio: 'pipe',
  })
}

describe('custom admin build smoke test', () => {
  afterEach(() => {
    rmSync(staleSentinelPath, { force: true })
  })

  it('emits fully generated source/admin output and removes stale files', () => {
    mkdirSync(dirname(staleSentinelPath), { recursive: true })
    writeFileSync(staleSentinelPath, 'stale output that build should remove', 'utf8')

    runBuild()

    expect(existsSync(generatedIndexPath)).toBe(true)

    const generatedIndex = readFileSync(generatedIndexPath, 'utf8')

    expect(generatedIndex).toContain('Alpaca Notes Admin')
    expect(generatedIndex).not.toContain('window.CMS_MANUAL_INIT = true')
    expect(generatedIndex).not.toContain('decap-cms')
    expect(generatedIndex).not.toContain('config.yml')
    expect(generatedIndex).not.toContain('正在加载在线编辑后台')

    expect(existsSync(resolve(sourceAdminDir, 'config.yml'))).toBe(false)
    expect(existsSync(staleSentinelPath)).toBe(false)
    expect(existsSync(legacyIndexPath)).toBe(true)
  })
})
