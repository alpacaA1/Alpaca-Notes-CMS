import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { legacyAdminDir, sourceAdminAssetsDir, sourceAdminDir, workspaceRoot } from '../build-paths'

const generatedIndexPath = resolve(sourceAdminDir, 'index.html')
const legacyIndexPath = resolve(legacyAdminDir, 'index.html')
const staleSentinelPath = resolve(sourceAdminDir, '__stale-sentinel__.txt')

function runBuild() {
  execFileSync('npm', ['run', 'build:admin'], {
    cwd: workspaceRoot,
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

    const generatedIndex = readFileSync(generatedIndexPath, 'utf8')
    const generatedAssetFiles = readdirSync(sourceAdminAssetsDir)

    expect(generatedIndex).toContain('Alpaca Notes Admin')
    expect(generatedAssetFiles.length).toBeGreaterThan(0)
    expect(generatedAssetFiles.some((file) => file.endsWith('.js'))).toBe(true)
    expect(generatedAssetFiles.some((file) => file.endsWith('.css'))).toBe(true)
    expect(generatedIndex).not.toContain('window.CMS_MANUAL_INIT = true')
    expect(generatedIndex).not.toContain('decap-cms')
    expect(generatedIndex).not.toContain('config.yml')
    expect(generatedIndex).not.toContain('正在加载在线编辑后台')

    expect(existsSync(resolve(sourceAdminDir, 'config.yml'))).toBe(false)
    expect(existsSync(staleSentinelPath)).toBe(false)
    expect(existsSync(legacyIndexPath)).toBe(true)
  })
})
