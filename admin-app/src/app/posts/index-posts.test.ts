import { afterEach, describe, expect, it, vi } from 'vitest'
import * as githubClientModule from '../github-client'
import { buildDiaryIndex, buildKnowledgeIndex, buildPostIndex, collectPostIndexFacets, filterPostIndex, parsePostIndexItem, sortPostIndex } from './index-posts'
import type { PostIndexItem, PostIndexView } from './post-types'

const legacyPost = parsePostIndexItem({
  path: 'source/_posts/legacy.md',
  sha: 'legacy-sha',
  content: `---
title: Legacy post
date: 2026-03-01 10:00:00
desc: Legacy content
categories:
  - 生活
tags:
  - 观察
---

Body with deeper architecture notes.`,
})

const draftPost = parsePostIndexItem({
  path: 'source/_posts/draft.md',
  sha: 'draft-sha',
  content: `---
title: Draft post
date: 2026-04-01 09:00:00
desc: Draft content
published: false
pinned: true
permalink: draft-post/
categories:
  - 专业
tags:
  - 产品
---

This draft body mentions a recovery checklist.`,
})

const publishedPost = parsePostIndexItem({
  path: 'source/_posts/published.md',
  sha: 'published-sha',
  content: `---
title: Published post
date: 2026-04-02 09:00:00
desc: Published content
published: true
permalink: published-post/
categories:
  - 专业
tags:
  - 信息架构
---

Published body covers information architecture search behavior.`,
})

const posts: PostIndexItem[] = [legacyPost, draftPost, publishedPost]
const defaultView: PostIndexView = {
  query: '',
  publishState: 'all',
  category: null,
  tag: null,
  sort: 'date-desc',
}

describe('post indexing helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    githubClientModule.clearMarkdownFileCache()
  })

  it('treats legacy missing published as published in UI state', () => {
    expect(legacyPost.published).toBe(true)
    expect(legacyPost.pinned).toBe(false)
    expect(legacyPost.hasExplicitPublished).toBe(false)
  })

  it('searches by title, permalink, summary, taxonomy, and body', () => {
    expect(filterPostIndex(posts, { ...defaultView, query: 'draft' })).toEqual([draftPost])
    expect(filterPostIndex(posts, { ...defaultView, query: 'published-post/' })).toEqual([publishedPost])
    expect(filterPostIndex(posts, { ...defaultView, query: 'legacy content' })).toEqual([legacyPost])
    expect(filterPostIndex(posts, { ...defaultView, query: '观察' })).toEqual([legacyPost])
    expect(filterPostIndex(posts, { ...defaultView, query: 'recovery checklist' })).toEqual([draftPost])
  })

  it('filters by publish state, category, and tag', () => {
    expect(filterPostIndex(posts, { ...defaultView, publishState: 'draft' })).toEqual([draftPost])
    expect(filterPostIndex(posts, { ...defaultView, publishState: 'published' })).toEqual([
      legacyPost,
      publishedPost,
    ])
    expect(filterPostIndex(posts, { ...defaultView, category: '生活' })).toEqual([legacyPost])
    expect(filterPostIndex(posts, { ...defaultView, tag: '产品' })).toEqual([draftPost])
  })

  it('sorts pinned posts ahead of non-pinned posts for date ordering', () => {
    expect(sortPostIndex(posts, 'date-desc').map((post) => post.title)).toEqual([
      'Draft post',
      'Published post',
      'Legacy post',
    ])
    expect(sortPostIndex(posts, 'title-asc').map((post) => post.title)).toEqual([
      'Draft post',
      'Legacy post',
      'Published post',
    ])
  })

  it('collects unique category and tag facets', () => {
    expect(collectPostIndexFacets(posts)).toEqual({
      categories: ['生活', '专业'],
      tags: ['产品', '观察', '信息架构'],
    })
  })

  it('drops blank category and tag values after trimming quotes and whitespace', () => {
    const parsed = parsePostIndexItem({
      path: 'source/_posts/blank-taxonomy.md',
      sha: 'blank-taxonomy-sha',
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

    expect(parsed.categories).toEqual(['专业'])
    expect(parsed.tags).toEqual(['产品'])
  })

  it('detects diary entries and keeps them as unpublished internal content', () => {
    const parsed = parsePostIndexItem({
      path: 'source/diary/20260505010101.md',
      sha: 'diary-sha',
      content: `---
title: 五月记录
diary: true
date: 2026-05-05 01:01:01
tags:
  - 记录
desc: 最近的状态
---

今天先记一笔。`,
    })

    expect(parsed.contentType).toBe('diary')
    expect(parsed.published).toBe(false)
  })

  it('detects knowledge entries and indexes source metadata for search', () => {
    const parsed = parsePostIndexItem({
      path: 'source/_knowledge/20260505010101.md',
      sha: 'knowledge-sha',
      content: `---
title: 系统复用
knowledge: true
source_type: post
source_path: source/_posts/example.md
source_title: 关于系统设计的文章
source_url: https://alpacaa1.github.io/Alpaca-Notes-CMS/example/
date: 2026-05-05 01:01:01
tags:
  - 复用
desc: 关于系统复用的知识点
---

能力来自反复验证的抽象。`,
    })

    expect(parsed.contentType).toBe('knowledge')
    expect(parsed.published).toBe(false)
    expect(parsed.body).toBe('\n能力来自反复验证的抽象。')
    expect(parsed.sourceType).toBe('post')
    expect(parsed.sourcePath).toBe('source/_posts/example.md')
    expect(parsed.sourceTitle).toBe('关于系统设计的文章')
    expect(parsed.sourceUrl).toBe('https://alpacaa1.github.io/Alpaca-Notes-CMS/example/')
    expect(filterPostIndex([parsed], { ...defaultView, query: '系统设计' })).toEqual([parsed])
  })

  it('keeps diary knowledge provenance in the index', () => {
    const parsed = parsePostIndexItem({
      path: 'source/_knowledge/20260506010101.md',
      sha: 'knowledge-diary-sha',
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

    expect(parsed.sourceType).toBe('diary')
    expect(parsed.sourcePath).toBe('source/diary/20260506090909.md')
    expect(parsed.sourceTitle).toBe('2026-05-06-星期三')
    expect(filterPostIndex([parsed], { ...defaultView, query: '2026-05-06-星期三' })).toEqual([parsed])
  })

  it('strips generated topic backlink sections from indexed body and search text', () => {
    const parsed = parsePostIndexItem({
      path: 'source/_posts/influence-topic.md',
      sha: 'topic-generated-sha',
      content: `---
title: 影响力
date: 2026-05-07 10:10:10
desc: 关于《影响力》的主题页
topic: true
topic_type: book
node_key: book/影响力
published: false
categories:
  - 读书
tags:
  - 说服
---

这是一个主题文章。

<!-- topic-backlinks:start -->

## 相关双链摘录

### 重读说服机制

文章 · 2026-05-04

> 今天又想到 《影响力》 里讲的互惠原则。

<!-- topic-backlinks:end -->`,
    })

    expect(parsed.body).toBe('\n这是一个主题文章。')
    expect(parsed.searchText?.includes('重读说服机制')).toBe(false)
  })

  it('builds the index from sha-matched cached markdown without refetching files', async () => {
    const cachedContent = `---
title: Cached post
date: 2026-04-05 09:00:00
desc: Cached content
published: true
---

Body`
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'file',
        path: 'source/_posts/cached.md',
        sha: 'cached-sha',
        encoding: 'base64',
        content: Buffer.from(cachedContent, 'utf8').toString('base64'),
      }),
    } as Response)

    await githubClientModule.fetchPostFile({ token: 'token' }, 'source/_posts/cached.md')
    fetch.mockClear()

    vi.spyOn(githubClientModule, 'listPostFiles').mockResolvedValue([
      { path: 'source/_posts/cached.md', sha: 'cached-sha', name: 'cached.md', type: 'file' },
    ])
    const fetchPostFile = vi.spyOn(githubClientModule, 'fetchPostFile')

    const indexed = await buildPostIndex({ token: 'token' })

    expect(indexed.map((post) => post.title)).toEqual(['Cached post'])
    expect(fetchPostFile).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refetches an indexed post when the cached sha is stale', async () => {
    const staleContent = `---
title: Stale post
date: 2026-04-05 09:00:00
desc: Stale content
published: true
---

Body`
    const freshContent = `---
title: Fresh post
date: 2026-04-06 09:00:00
desc: Fresh content
published: true
---

Body`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'file',
        path: 'source/_posts/stale.md',
        sha: 'old-sha',
        encoding: 'base64',
        content: Buffer.from(staleContent, 'utf8').toString('base64'),
      }),
    } as Response)

    await githubClientModule.fetchPostFile({ token: 'token' }, 'source/_posts/stale.md')

    vi.spyOn(githubClientModule, 'listPostFiles').mockResolvedValue([
      { path: 'source/_posts/stale.md', sha: 'new-sha', name: 'stale.md', type: 'file' },
    ])
    const fetchPostFile = vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: 'source/_posts/stale.md',
      sha: 'new-sha',
      content: freshContent,
    })

    const indexed = await buildPostIndex({ token: 'token' })

    expect(fetchPostFile).toHaveBeenCalledWith({ token: 'token' }, 'source/_posts/stale.md')
    expect(indexed.map((post) => post.title)).toEqual(['Fresh post'])
  })

  it('builds the diary index from the dedicated directory', async () => {
    vi.spyOn(githubClientModule, 'listDiaryFiles').mockResolvedValue([
      { path: 'source/diary/20260505010101.md', sha: 'diary-sha', name: '20260505010101.md', type: 'file' },
    ])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: 'source/diary/20260505010101.md',
      sha: 'diary-sha',
      content: `---
title: 五月记录
diary: true
date: 2026-05-05 01:01:01
published: false
tags:
  - 记录
desc: 最近的状态
---

今天先记一笔。`,
    })

    const indexed = await buildDiaryIndex({ token: 'token' })

    expect(indexed[0]?.contentType).toBe('diary')
    expect(indexed[0]?.title).toBe('五月记录')
  })

  it('builds the knowledge index from the dedicated internal directory', async () => {
    vi.spyOn(githubClientModule, 'listKnowledgeFiles').mockResolvedValue([
      { path: 'source/_knowledge/20260505010101.md', sha: 'knowledge-sha', name: '20260505010101.md', type: 'file' },
    ])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: 'source/_knowledge/20260505010101.md',
      sha: 'knowledge-sha',
      content: `---
title: 系统复用
knowledge: true
source_type: read-later
source_path: source/read-later-items/example.md
source_title: 一篇关于系统设计的文章
date: 2026-05-05 01:01:01
published: false
tags:
  - 复用
desc: 关于系统复用的知识点
---

## 原文摘录
> 能力来自反复验证的抽象。

## 我的理解
把经验沉淀成可复用结构。`,
    })

    const indexed = await buildKnowledgeIndex({ token: 'token' })

    expect(indexed[0]?.contentType).toBe('knowledge')
    expect(indexed[0]?.sourceTitle).toBe('一篇关于系统设计的文章')
    expect(indexed[0]?.desc).toBe('能力来自反复验证的抽象。')
  })

  it('indexes topic-node metadata and aliases for search', () => {
    const parsed = parsePostIndexItem({
      path: 'source/_knowledge/topic.md',
      sha: 'topic-sha',
      content: `---
title: 影响力
knowledge: true
knowledge_kind: topic
topic_type: book
node_key: book/影响力
aliases:
  - 《影响力》
  - Influence
date: 2026-05-07 10:10:10
tags:
  - 读书
desc:
---

这是一个主题节点。`,
    })

    expect(parsed.knowledgeKind).toBe('topic')
    expect(parsed.topicType).toBe('book')
    expect(parsed.nodeKey).toBe('book/影响力')
    expect(parsed.aliases).toEqual(['《影响力》', 'Influence'])
    expect(filterPostIndex([parsed], { ...defaultView, query: 'Influence' })).toEqual([parsed])
  })

  it('indexes topic article metadata and aliases for search', () => {
    const parsed = parsePostIndexItem({
      path: 'source/_posts/influence-topic.md',
      sha: 'topic-post-sha',
      content: `---
title: 影响力
permalink: influence/
topic: true
topic_type: book
node_key: book/影响力
aliases:
  - 《影响力》
  - Influence
date: 2026-05-07 10:10:10
published: false
categories:
  - 读书
tags:
  - 说服
desc: 关于《影响力》的主题页
---

这是一个主题文章。`,
    })

    expect(parsed.contentType).toBe('post')
    expect(parsed.isTopic).toBe(true)
    expect(parsed.topicType).toBe('book')
    expect(parsed.nodeKey).toBe('book/影响力')
    expect(parsed.aliases).toEqual(['《影响力》', 'Influence'])
    expect(filterPostIndex([parsed], { ...defaultView, query: 'Influence' })).toEqual([parsed])
  })
})
