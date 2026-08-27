import { describe, expect, it } from 'vitest'
import type { PostIndexItem } from '../posts/post-types'
import {
  appendQuoteToDiaryBody,
  cleanSourceTitleForDiary,
  findTodayDiaryPost,
  formatBatchHighlightQuotesForDiary,
  formatHighlightQuoteForDiary,
  getTodayDateString,
} from './diary-quote'

describe('diary-quote utilities', () => {
  it('returns formatted today date string in YYYY-MM-DD format', () => {
    const fixedDate = new Date(2026, 7, 25, 14, 30, 0) // 2026-08-25
    expect(getTodayDateString(fixedDate)).toBe('2026-08-25')
  })

  it('finds existing today diary post by date or title', () => {
    const today = new Date(2026, 7, 25, 10, 0, 0)
    const posts: PostIndexItem[] = [
      {
        path: 'source/diary/20260824100000.md',
        sha: 'sha-24',
        title: '2026-08-24-星期一',
        date: '2026-08-24 10:00:00',
        published: false,
        hasExplicitPublished: true,
        categories: [],
        tags: [],
        contentType: 'diary',
      },
      {
        path: 'source/diary/20260825083000.md',
        sha: 'sha-25',
        title: '2026-08-25-星期二',
        date: '2026-08-25 08:30:00',
        published: false,
        hasExplicitPublished: true,
        categories: [],
        tags: [],
        contentType: 'diary',
      },
    ]

    const matched = findTodayDiaryPost(posts, today)
    expect(matched).toBeDefined()
    expect(matched?.path).toBe('source/diary/20260825083000.md')

    // Matches by path even if date string is missing
    const postsWithPathOnly: PostIndexItem[] = [
      {
        path: 'source/diary/20260825101041.md',
        sha: 'sha-25-a',
        title: '日记',
        date: '',
        published: false,
        hasExplicitPublished: true,
        categories: [],
        tags: [],
        contentType: 'diary',
      },
    ]
    expect(findTodayDiaryPost(postsWithPathOnly, today)?.path).toBe('source/diary/20260825101041.md')

    const tomorrow = new Date(2026, 7, 26, 10, 0, 0)
    expect(findTodayDiaryPost(posts, tomorrow)).toBeUndefined()
  })

  it('formats highlight quote without note', () => {
    const fixedDate = new Date(2026, 7, 25, 14, 32, 0)
    const formatted = formatHighlightQuoteForDiary({
      quote: '这是一个非常有启发性的观点。',
      sourceTitle: '认知觉醒精读',
      date: fixedDate,
    })

    expect(formatted).toBe([
      '### 🔖 14:32 · 待读摘录',
      '',
      '> 这是一个非常有启发性的观点。',
      '',
      '🔗 **来源**：[[认知觉醒精读]]',
    ].join('\n'))
  })

  it('formats highlight quote with note and multi-line quote', () => {
    const fixedDate = new Date(2026, 7, 25, 9, 5, 0)
    const formatted = formatHighlightQuoteForDiary({
      quote: '第一行摘录\n第二行摘录',
      note: '我认为这里需要结合实际项目去验证。',
      sourceTitle: '系统思考笔记',
      date: fixedDate,
    })

    expect(formatted).toBe([
      '### 🔖 09:05 · 待读摘录',
      '',
      '> 第一行摘录\n> 第二行摘录',
      '',
      '💬 **我的思考**：我认为这里需要结合实际项目去验证。',
      '',
      '🔗 **来源**：[[系统思考笔记]]',
    ].join('\n'))
  })

  it('appends quote block under ## 待读摘录 for empty, non-existing, and existing sections', () => {
    const quote1 = '### 🔖 10:15 · 待读摘录\n\n> 第一次摘录\n\n🔗 **来源**：[[文章一]]'
    const quote2 = '### 🔖 14:32 · 待读摘录\n\n> 第二次摘录\n\n🔗 **来源**：[[文章二]]'

    // Case 1: Empty body
    const result1 = appendQuoteToDiaryBody('', quote1)
    expect(result1).toBe(`## 待读摘录\n\n${quote1}\n`)

    // Case 2: Existing body without ## 待读摘录
    const result2 = appendQuoteToDiaryBody('早上完成了需求评审。', quote1)
    expect(result2).toBe(`早上完成了需求评审。\n\n## 待读摘录\n\n${quote1}\n`)

    // Case 3: Existing body with ## 待读摘录 (appends under the same heading)
    const result3 = appendQuoteToDiaryBody(result2, quote2)
    expect(result3).toBe(`早上完成了需求评审。\n\n## 待读摘录\n\n${quote1}\n\n${quote2}\n`)

    // Case 4: Existing body with ## 待读摘录 followed by another section ## 今日总结
    const bodyWithNextSection = `## 待读摘录\n\n${quote1}\n\n## 今日总结\n\n今天很充实。`
    const result4 = appendQuoteToDiaryBody(bodyWithNextSection, quote2)
    expect(result4).toBe(`## 待读摘录\n\n${quote1}\n\n${quote2}\n\n## 今日总结\n\n今天很充实。\n`)
  })

  it('cleans trailing author or site suffixes from sourceTitle', () => {
    expect(cleanSourceTitleForDiary('Agent评测漫谈 —— 由浅入深讲解Agent评测 | 美团 · 技术团队')).toBe(
      'Agent评测漫谈 —— 由浅入深讲解Agent评测',
    )
    expect(cleanSourceTitleForDiary('深入理解 TypeScript - 少数派')).toBe('深入理解 TypeScript')
    expect(cleanSourceTitleForDiary('AI 发展年度回顾 — 36氪')).toBe('AI 发展年度回顾')
    expect(cleanSourceTitleForDiary('独立开发的思考 _ 知乎')).toBe('独立开发的思考')
    expect(cleanSourceTitleForDiary('干净的主标题')).toBe('干净的主标题')
  })

  it('formats batch highlight quotes for diary by merging same source into a single footer source', () => {
    const itemsSameSource = [
      {
        quote: '第一条批注摘录内容',
        sourceTitle: '纳瓦尔宝典精读 | 少数派',
      },
      {
        quote: '第二条批注摘录内容\n包含换行',
        note: '这是关于第二条的思考',
        sourceTitle: '纳瓦尔宝典精读',
      },
    ]

    const formattedSame = formatBatchHighlightQuotesForDiary(itemsSameSource)
    expect(formattedSame).toBe(
      '> 第一条批注摘录内容\n\n> 第二条批注摘录内容\n> 包含换行\n\n💭 这是关于第二条的思考\n\n来源：《纳瓦尔宝典精读》',
    )
  })

  it('formats batch highlight quotes across multiple sources with separators', () => {
    const itemsMultiSource = [
      {
        quote: '纳瓦尔的第一句话',
        sourceTitle: '纳瓦尔宝典',
      },
      {
        quote: '纳瓦尔的第二句话',
        sourceTitle: '纳瓦尔宝典',
      },
      {
        quote: '阿德勒的观点',
        note: '很有启发',
        sourceTitle: '被讨厌的勇气',
      },
    ]

    const formattedMulti = formatBatchHighlightQuotesForDiary(itemsMultiSource)
    expect(formattedMulti).toBe(
      '> 纳瓦尔的第一句话\n\n> 纳瓦尔的第二句话\n\n来源：《纳瓦尔宝典》\n\n---\n\n> 阿德勒的观点\n\n💭 很有启发\n\n来源：《被讨厌的勇气》',
    )
  })
})
