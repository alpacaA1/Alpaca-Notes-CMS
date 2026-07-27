import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appStyles = readFileSync(resolve(process.cwd(), 'src/styles/app.css'), 'utf8')

describe('书架视图高度', () => {
  it('占满顶栏下方的 Grid 行，为绝对定位的阅读器提供确定高度', () => {
    const rule = appStyles.match(/\.admin-shell__viewport--books\s*\{([^}]*)\}/)?.[1] ?? ''

    expect(rule).toContain('min-height: 0')
    expect(rule).toMatch(/height:\s*100%/)
  })
})
