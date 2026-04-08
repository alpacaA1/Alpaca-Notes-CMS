import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workspaceRoot } from '../build-paths'

const generatedSiteIndexPath = resolve(workspaceRoot, 'public', 'index.html')

function runSiteBuild() {
  execFileSync('npm', ['run', 'build'], {
    cwd: workspaceRoot,
    stdio: 'pipe',
  })
}

describe('site build root path smoke test', () => {
  it('emits repo-aware showcase asset and navigation paths for GitHub Pages', () => {
    runSiteBuild()

    const generatedIndex = readFileSync(generatedSiteIndexPath, 'utf8')

    expect(generatedIndex).toContain('href="/Alpaca-Notes-CMS/css/style.css"')
    expect(generatedIndex).toContain('src="/Alpaca-Notes-CMS/js/typography.js"')
    expect(generatedIndex).toContain('href="/Alpaca-Notes-CMS/archives"')
    expect(generatedIndex).toContain('href="/Alpaca-Notes-CMS/atom.xml"')
    expect(generatedIndex).not.toContain('href="/css/style.css"')
    expect(generatedIndex).not.toContain('src="/js/typography.js"')
    expect(generatedIndex).not.toContain('href="/atom.xml"')
    expect(generatedIndex).not.toContain('href="/admin/assets/')
    expect(generatedIndex).not.toContain('src="/admin/assets/')
  })
})
