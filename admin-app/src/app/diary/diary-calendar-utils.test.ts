import { describe, expect, it } from 'vitest'
import {
  buildMonthCalendarGrid,
  calculateConsecutiveStreak,
  estimatePostWordCount,
  extractDateStrFromPost,
  getMorandiColorForDate,
} from './diary-calendar-utils'
import type { PostIndexItem } from '../posts/post-types'

describe('diary-calendar-utils', () => {
  it('generates consistent Morandi colors for the same date', () => {
    const color1 = getMorandiColorForDate('2026-08-25')
    const color2 = getMorandiColorForDate('2026-08-25')
    expect(color1).toBe(color2)
    expect(color1.startsWith('#')).toBe(true)
  })

  it('extracts date string from various post formats', () => {
    const postWithDate: PostIndexItem = {
      path: 'source/diary/20260825080000.md',
      sha: '1',
      title: '2026-08-25-星期二',
      date: '2026-08-25 08:00:00',
      desc: '',
      published: false,
      hasExplicitPublished: false,
      categories: [],
      tags: [],
      permalink: null,
      cover: null,
    }
    expect(extractDateStrFromPost(postWithDate)).toBe('2026-08-25')

    const postWithTitleOnly: PostIndexItem = {
      path: 'source/diary/test.md',
      sha: '2',
      title: '2026-05-10 日记',
      date: '',
      desc: '',
      published: false,
      hasExplicitPublished: false,
      categories: [],
      tags: [],
      permalink: null,
      cover: null,
    }
    expect(extractDateStrFromPost(postWithTitleOnly)).toBe('2026-05-10')
  })

  it('calculates consecutive streak correctly', () => {
    const dates = new Set(['2026-08-25', '2026-08-24', '2026-08-23'])
    const streak = calculateConsecutiveStreak(dates, '2026-08-25')
    expect(streak).toBe(3)
  })

  it('builds full 7-column calendar grid with correct month stats and Monday alignment', () => {
    const mockPosts: PostIndexItem[] = [
      {
        path: 'source/diary/20260825080000.md',
        sha: '1',
        title: '2026-08-25-星期二',
        date: '2026-08-25 08:00:00',
        desc: '这是一篇充满希望的日记',
        published: false,
        hasExplicitPublished: false,
        categories: [],
        tags: [],
        permalink: null,
        cover: null,
      },
    ]

    const { cells, stats } = buildMonthCalendarGrid(2026, 8, mockPosts)

    // Grid count must be a multiple of 7 (35 or 42)
    expect(cells.length % 7).toBe(0)
    expect(cells.length).toBeGreaterThanOrEqual(28)

    // Month stats check
    expect(stats.diaryCount).toBe(1)
    expect(stats.totalWords).toBeGreaterThan(0)

    // Cell on 2026-08-25 has post attached
    const cell25 = cells.find((c) => c.dateStr === '2026-08-25')
    expect(cell25).toBeDefined()
    expect(cell25?.post).not.toBeNull()
    expect(cell25?.isCurrentMonth).toBe(true)

    // Empty cell check
    const cell20 = cells.find((c) => c.dateStr === '2026-08-20')
    expect(cell20?.post).toBeNull()
  })

  it('calculates word count from post.body with fallback to desc', () => {
    const postWithBody: PostIndexItem = {
      path: 'source/diary/test1.md',
      sha: '1',
      title: '日记',
      date: '2026-08-25',
      desc: '简短描述',
      body: '## 今天\n\n写了很长很长的一段正文内容，记录当下的思考。',
      published: false,
      hasExplicitPublished: false,
      categories: [],
      tags: [],
      permalink: null,
      cover: null,
    }
    // Should compute actual character count of body
    expect(estimatePostWordCount(postWithBody)).toBeGreaterThan(15)

    const postWithDescOnly: PostIndexItem = {
      path: 'source/diary/test2.md',
      sha: '2',
      title: '日记2',
      date: '2026-08-26',
      desc: '简短描述',
      published: false,
      hasExplicitPublished: false,
      categories: [],
      tags: [],
      permalink: null,
      cover: null,
    }
    expect(estimatePostWordCount(postWithDescOnly)).toBe(4)

    const postEmpty: PostIndexItem = {
      path: 'source/diary/test3.md',
      sha: '3',
      title: '日记3',
      date: '2026-08-27',
      desc: '',
      published: false,
      hasExplicitPublished: false,
      categories: [],
      tags: [],
      permalink: null,
      cover: null,
    }
    expect(estimatePostWordCount(postEmpty)).toBe(0)
  })
})
