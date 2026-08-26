import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import * as indexPostsModule from './posts/index-posts'
import * as readLaterIndexModule from './read-later/index-items'
import * as sessionModule from './session'
import { encodeReadLaterAnnotations } from './read-later/item-types'
import { getTodayDateString } from './diary/diary-quote'

const todayDateStr = getTodayDateString()

const readLaterPost = {
  path: 'source/read-later-items/20260825000000.md',
  sha: 'sha-rl-1',
  title: '认知觉醒精读',
  date: `${todayDateStr} 10:00:00`,
  desc: '',
  published: false as const,
  hasExplicitPublished: false as const,
  categories: [],
  tags: ['思考'],
  permalink: 'read-later/cognitive-awakening/',
  contentType: 'read-later' as const,
  externalUrl: 'https://example.com/cognitive',
  sourceName: '认知实验室',
  readingStatus: 'unread' as const,
  cover: null,
}

const annotation = {
  id: 'ann-1',
  sectionKey: 'articleExcerpt' as const,
  quote: '元认知是人类最高级别的认知能力。',
  prefix: '作者指出，',
  suffix: '这一能力可以通过刻意练习提升。',
  note: '很有启发，需要结合日常反思来实践。',
  createdAt: '2026-08-25T10:00:00.000Z',
  updatedAt: '2026-08-25T10:00:00.000Z',
}

const readLaterContent = `---
title: 认知觉醒精读
permalink: read-later/cognitive-awakening/
date: ${todayDateStr} 10:00:00
published: false
categories: []
tags:
  - 思考
external_url: https://example.com/cognitive
source_name: 认知实验室
reading_status: reading
read_later: true
nav_exclude: true
layout: read-later-item
reader_annotations:
  - ${encodeReadLaterAnnotations([annotation])[0]}
---

## 原文摘录

作者指出，元认知是人类最高级别的认知能力。这一能力可以通过刻意练习提升。

## 我的总结

总结内容。

## 我的评论

评论内容。`

const existingTodayDiaryPost = {
  path: `source/diary/${todayDateStr.replace(/-/g, '')}080000.md`,
  sha: 'sha-diary-today',
  title: `${todayDateStr}-星期二`,
  date: `${todayDateStr} 08:00:00`,
  desc: '',
  published: false as const,
  hasExplicitPublished: true as const,
  categories: [],
  tags: [],
  contentType: 'diary' as const,
}

const existingTodayDiaryContent = `---
title: ${todayDateStr}-星期二
date: ${todayDateStr} 08:00:00
published: false
categories: []
tags: []
diary: true
---

早上完成了今日计划制定。`

describe('App diary quote and single-day convergence flow', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    githubClientModule.clearMarkdownFileCache()
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('opens existing today diary directly when clicking 新建日记 if today diary exists', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([existingTodayDiaryPost])
    const fetchSpy = vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingTodayDiaryPost.path,
      sha: existingTodayDiaryPost.sha,
      content: existingTodayDiaryContent,
    })

    render(<App />)

    // Switch to diary tab
    fireEvent.click(await screen.findByRole('radio', { name: '日记' }))

    // Click "新建日记"
    fireEvent.click(await screen.findByRole('button', { name: '新建日记' }))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith({ token: 'persisted-token' }, existingTodayDiaryPost.path)
    })

    expect(await screen.findByDisplayValue(`${todayDateStr}-星期二`)).toBeTruthy()
  })

  it('quotes highlight to today diary creating new diary when none exists', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])

    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterContent,
    })

    const saveSpy = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockImplementation(async (_session, file) => ({
      path: file.path,
      sha: 'sha-new-diary',
      content: file.content,
    }))

    render(<App />)

    // Switch to read-later tab
    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    // Wait for read-later item to appear
    await waitFor(() => {
      expect(screen.getByText('认知觉醒精读')).toBeTruthy()
    })

    // Open read-later article
    fireEvent.click(screen.getByRole('button', { name: /认知觉醒精读/i }))

    // Switch to 评论 tab
    fireEvent.click(await screen.findByRole('tab', { name: '评论' }))

    // Click the highlight card to activate it
    const highlightsSection = await screen.findByRole('region', { name: 'Highlights' })
    const highlightCard = within(highlightsSection).getByRole('button', { name: '元认知是人类最高级别的认知能力。' })
    fireEvent.click(highlightCard)

    // Click "引用到今日日记"
    const quoteButton = await screen.findByRole('button', { name: '引用到今日日记' })
    fireEvent.click(quoteButton)

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1)
    })

    const savedCall = saveSpy.mock.calls[0]?.[1]
    expect(savedCall?.path).toMatch(/^source\/diary\/\d+\.md$/)
    expect(savedCall?.content).toContain('## 待读摘录')
    expect(savedCall?.content).toContain('### 🔖')
    expect(savedCall?.content).toContain('> 元认知是人类最高级别的认知能力。')
    expect(savedCall?.content).toContain('💬 **我的思考**：很有启发，需要结合日常反思来实践。')
    expect(savedCall?.content).toContain('🔗 **来源**：[[认知觉醒精读]]')

    // Check toast notification and action button
    expect(await screen.findByText(/已引用到今日日记/)).toBeTruthy()
    expect(await screen.findByRole('button', { name: '打开日记' })).toBeTruthy()
  })

  it('quotes highlight and appends to existing today diary, and clicking 打开日记 switches to editor', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([existingTodayDiaryPost])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])

    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockImplementation(async (_session, path) => {
      if (path === readLaterPost.path) {
        return {
          path: readLaterPost.path,
          sha: readLaterPost.sha,
          content: readLaterContent,
        }
      }
      return {
        path: existingTodayDiaryPost.path,
        sha: existingTodayDiaryPost.sha,
        content: existingTodayDiaryContent,
      }
    })

    const saveSpy = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockImplementation(async (_session, file) => ({
      path: file.path,
      sha: 'sha-diary-updated',
      content: file.content,
    }))

    render(<App />)

    // Switch to read-later
    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    await waitFor(() => {
      expect(screen.getByText('认知觉醒精读')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /认知觉醒精读/i }))

    // Switch to 评论 tab
    fireEvent.click(await screen.findByRole('tab', { name: '评论' }))

    // Click highlight card to activate
    const highlightsSection = await screen.findByRole('region', { name: 'Highlights' })
    const highlightCard = within(highlightsSection).getByRole('button', { name: '元认知是人类最高级别的认知能力。' })
    fireEvent.click(highlightCard)

    // Click "引用到今日日记"
    fireEvent.click(await screen.findByRole('button', { name: '引用到今日日记' }))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1)
    })

    const savedCall = saveSpy.mock.calls[0]?.[1]
    expect(savedCall?.path).toBe(existingTodayDiaryPost.path)
    expect(savedCall?.content).toContain('早上完成了今日计划制定。')
    expect(savedCall?.content).toContain('## 待读摘录')
    expect(savedCall?.content).toContain('### 🔖')
    expect(savedCall?.content).toContain('> 元认知是人类最高级别的认知能力。')
    expect(savedCall?.content).toContain('💬 **我的思考**：很有启发，需要结合日常反思来实践。')
    expect(savedCall?.content).toContain('🔗 **来源**：[[认知觉醒精读]]')

    // Click "打开日记" from toast
    const openDiaryBtn = await screen.findByRole('button', { name: '打开日记' })
    fireEvent.click(openDiaryBtn)

    await waitFor(() => {
      expect(screen.getByDisplayValue(`${todayDateStr}-星期二`)).toBeTruthy()
    })
  })

  it('quotes annotation from the full annotations aggregation view to today diary', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([existingTodayDiaryPost])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])

    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockImplementation(async (_session, path) => {
      if (path === readLaterPost.path) {
        return {
          path: readLaterPost.path,
          sha: readLaterPost.sha,
          content: readLaterContent,
        }
      }
      return {
        path: existingTodayDiaryPost.path,
        sha: existingTodayDiaryPost.sha,
        content: existingTodayDiaryContent,
      }
    })

    const saveSpy = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockImplementation(async (_session, file) => ({
      path: file.path,
      sha: 'sha-diary-updated',
      content: file.content,
    }))

    render(<App />)

    // Switch to read-later
    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    await waitFor(() => {
      expect(screen.getByText('认知觉醒精读')).toBeTruthy()
    })

    // Click "批注" to go to annotations aggregation view
    fireEvent.click(screen.getByRole('button', { name: '批注' }))

    // Click the annotation card to select it
    fireEvent.click(await screen.findByText('元认知是人类最高级别的认知能力。'))

    // In the detail panel, click "引用到今日日记"
    const quoteButton = await screen.findByRole('button', { name: '引用到今日日记' })
    fireEvent.click(quoteButton)

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1)
    })

    const savedCall = saveSpy.mock.calls[0]?.[1]
    expect(savedCall?.path).toBe(existingTodayDiaryPost.path)
    expect(savedCall?.content).toContain('## 待读摘录')
    expect(savedCall?.content).toContain('### 🔖')
    expect(savedCall?.content).toContain('> 元认知是人类最高级别的认知能力。')
    expect(savedCall?.content).toContain('🔗 **来源**：[[认知觉醒精读]]')
  })
})

