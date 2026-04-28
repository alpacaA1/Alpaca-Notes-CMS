import { describe, expect, it } from 'vitest'
import { parsePost } from './parse-post'

describe('parsePost', () => {
  it('parses frontmatter and raw markdown body', () => {
    const parsed = parsePost({
      path: 'source/_posts/example.md',
      sha: 'sha-1',
      content: `---
title: Example
date: 2026-04-01 20:10:00
published: true
pinned: true
categories:
  - 思考
tags:
  - 记录
desc: Example desc
---

Hello world\n`,
    })

    expect(parsed.frontmatter.title).toBe('Example')
    expect(parsed.frontmatter.date).toBe('2026-04-01 20:10:00')
    expect(parsed.frontmatter.published).toBe(true)
    expect(parsed.frontmatter.pinned).toBe(true)
    expect(parsed.frontmatter.categories).toEqual(['思考'])
    expect(parsed.frontmatter.tags).toEqual(['记录'])
    expect(parsed.frontmatter.desc).toBe('Example desc')
    expect(parsed.body).toBe('Hello world\n')
  })

  it('preserves legacy missing permalink and missing published semantics', () => {
    const parsed = parsePost({
      path: 'source/_posts/legacy.md',
      sha: 'sha-legacy',
      content: `---
title: Legacy
date: 2026-03-01 10:00:00
categories:
  - 生活
tags:
  - 观察
desc: Legacy desc
---

Legacy body`,
    })

    expect(parsed.frontmatter.published).toBe(true)
    expect(parsed.frontmatter.pinned).toBe(false)
    expect(parsed.hasExplicitPublished).toBe(false)
    expect(parsed.frontmatter.permalink).toBeUndefined()
    expect(parsed.hasExplicitPermalink).toBe(false)
  })

  it('drops blank category and tag values after trimming quotes and whitespace', () => {
    const parsed = parsePost({
      path: 'source/_posts/blank-taxonomy.md',
      sha: 'sha-blank-taxonomy',
      content: `---
title: Blank taxonomy post
date: 2026-04-04 09:00:00
desc: Blank taxonomy content
categories:
  - ""
  - '   '
  - "专业"
tags:
  - ''
  - "  "
  - '产品'
---

Body`,
    })

    expect(parsed.frontmatter.categories).toEqual(['专业'])
    expect(parsed.frontmatter.tags).toEqual(['产品'])
  })
})
