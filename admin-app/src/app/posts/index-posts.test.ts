import { afterEach, describe, expect, it, vi } from 'vitest'
import * as githubClientModule from '../github-client'
import { buildDiaryIndex, buildPostIndex, collectPostIndexFacets, filterPostIndex, parsePostIndexItem, sortPostIndex } from './index-posts'
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
})
