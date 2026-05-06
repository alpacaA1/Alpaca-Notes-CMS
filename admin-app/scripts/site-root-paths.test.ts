import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workspaceRoot } from '../build-paths'

const generatedSiteIndexPath = resolve(workspaceRoot, 'public', 'index.html')

function createPrivateContentFixture() {
  const fixtureRoot = mkdtempSync(resolve(tmpdir(), 'alpaca-private-content-'))
  const postDir = resolve(fixtureRoot, 'source', '_posts')
  mkdirSync(postDir, { recursive: true })
  writeFileSync(resolve(postDir, 'fixture.md'), `---
title: Fixture Post
permalink: fixture/
date: 2026-05-06 18:00:00
published: true
categories:
  - 测试
tags:
  - 构建
desc: 用于站点构建测试的文章。
---

这是一篇用于验证构建路径的测试文章。`)

  return fixtureRoot
}

function runSiteBuild(privateContentPath: string) {
  execFileSync('npm', ['run', 'clean'], {
    cwd: workspaceRoot,
    stdio: 'pipe',
  })

  execFileSync('npm', ['run', 'build'], {
    cwd: workspaceRoot,
    stdio: 'pipe',
    env: {
      ...process.env,
      PRIVATE_CONTENT_PATH: privateContentPath,
    },
  })
}

describe('site build root path smoke test', () => {
  it('emits repo-aware showcase asset and navigation paths for GitHub Pages', () => {
    const privateContentPath = createPrivateContentFixture()

    try {
      runSiteBuild(privateContentPath)
    } finally {
      rmSync(privateContentPath, { recursive: true, force: true })
    }

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
