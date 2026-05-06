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

  it('preserves an explicit content format from frontmatter', () => {
    const parsed = parsePost({
      path: 'source/_posts/plaintext.md',
      sha: 'sha-plaintext',
      content: `---
title: Plain text post
format: plaintxt
date: 2026-04-04 09:00:00
desc: Plain text body
categories:
tags:
---

Body`,
    })

    expect(parsed.frontmatter.format).toBe('plaintxt')
  })

  it('detects diary entries and keeps them unpublished by default', () => {
    const parsed = parsePost({
      path: 'source/diary/20260505010101.md',
      sha: 'sha-diary',
      content: `---
title: 五月记录
diary: true
date: 2026-05-05 01:01:01
tags:
  - 月初
desc: 记录一下最近的状态
---

今天先记一笔。`,
    })

    expect(parsed.contentType).toBe('diary')
    expect(parsed.frontmatter.diary).toBe(true)
    expect(parsed.frontmatter.published).toBe(false)
  })

  it('detects knowledge items and preserves source metadata', () => {
    const parsed = parsePost({
      path: 'source/_knowledge/20260505010101.md',
      sha: 'sha-knowledge',
      content: `---
title: 系统复用
knowledge: true
nav_exclude: true
source_type: read-later
source_path: source/read-later-items/example.md
source_title: 一篇关于系统设计的文章
source_url: https://example.com/system
date: 2026-05-05 01:01:01
tags:
  - 复用
desc: 关于系统复用的知识点
---

## 原文摘录
> 能力来自反复验证的抽象。`,
    })

    expect(parsed.contentType).toBe('knowledge')
    expect(parsed.frontmatter.knowledge).toBe(true)
    expect(parsed.frontmatter.nav_exclude).toBe(true)
    expect(parsed.frontmatter.source_type).toBe('read-later')
    expect(parsed.frontmatter.source_path).toBe('source/read-later-items/example.md')
    expect(parsed.frontmatter.source_title).toBe('一篇关于系统设计的文章')
    expect(parsed.frontmatter.source_url).toBe('https://example.com/system')
    expect(parsed.frontmatter.published).toBe(false)
  })

  it('accepts diary as a knowledge source type', () => {
    const parsed = parsePost({
      path: 'source/_knowledge/20260506010101.md',
      sha: 'sha-knowledge-diary',
      content: `---
title: 日记里的决策
knowledge: true
source_type: diary
source_path: source/diary/20260506090909.md
source_title: 2026-05-06-星期三
date: 2026-05-06 10:10:10
tags:
  - 复盘
desc: 从日记沉淀的知识点
---

系统能力来自稳定复用过的决策边界。`,
    })

    expect(parsed.frontmatter.source_type).toBe('diary')
    expect(parsed.frontmatter.source_path).toBe('source/diary/20260506090909.md')
    expect(parsed.frontmatter.source_title).toBe('2026-05-06-星期三')
  })
})
