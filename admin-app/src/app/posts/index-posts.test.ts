import { describe, expect, it } from 'vitest'
import { collectPostIndexFacets, filterPostIndex, parsePostIndexItem, sortPostIndex } from './index-posts'
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

Body`,
})

const draftPost = parsePostIndexItem({
  path: 'source/_posts/draft.md',
  sha: 'draft-sha',
  content: `---
title: Draft post
date: 2026-04-01 09:00:00
desc: Draft content
published: false
permalink: draft-post/
categories:
  - 专业
tags:
  - 产品
---

Body`,
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

Body`,
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
  it('treats legacy missing published as published in UI state', () => {
    expect(legacyPost.published).toBe(true)
    expect(legacyPost.hasExplicitPublished).toBe(false)
  })

  it('searches by title and permalink', () => {
    expect(filterPostIndex(posts, { ...defaultView, query: 'draft' })).toEqual([draftPost])
    expect(filterPostIndex(posts, { ...defaultView, query: 'published-post/' })).toEqual([publishedPost])
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

  it('sorts only by date and title', () => {
    expect(sortPostIndex(posts, 'date-desc').map((post) => post.title)).toEqual([
      'Published post',
      'Draft post',
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
})
