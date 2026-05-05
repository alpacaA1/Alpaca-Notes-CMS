import { describe, expect, it } from 'vitest'
import { pickDailyKnowledgeItems } from './daily-selection'
import type { PostIndexItem } from '../posts/post-types'

function createKnowledge(path: string): PostIndexItem {
  return {
    path,
    sha: `${path}-sha`,
    title: path.split('/').pop() || path,
    date: '2026-05-05 09:00:00',
    desc: '知识点',
    published: false,
    hasExplicitPublished: true,
    categories: [],
    tags: ['记录'],
    permalink: null,
    cover: null,
    contentType: 'knowledge',
  }
}

describe('pickDailyKnowledgeItems', () => {
  const items = Array.from({ length: 20 }).map((_, index) => createKnowledge(`source/_knowledge/${index + 1}.md`))

  it('returns a deterministic same-day selection capped by the requested limit', () => {
    const date = new Date(2026, 4, 5, 8, 0, 0)
    const first = pickDailyKnowledgeItems(items, 15, date)
    const second = pickDailyKnowledgeItems(items, 15, new Date(2026, 4, 5, 23, 59, 59))

    expect(first).toHaveLength(15)
    expect(first.map((item) => item.path)).toEqual(second.map((item) => item.path))
  })

  it('changes the selection on a different day', () => {
    const first = pickDailyKnowledgeItems(items, 15, new Date(2026, 4, 5, 8, 0, 0))
    const second = pickDailyKnowledgeItems(items, 15, new Date(2026, 4, 6, 8, 0, 0))

    expect(first.map((item) => item.path)).not.toEqual(second.map((item) => item.path))
  })
})
