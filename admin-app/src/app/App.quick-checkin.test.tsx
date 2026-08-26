import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { getTodayDateString } from './diary/diary-quote'
import * as githubClientModule from './github-client'
import * as indexPostsModule from './posts/index-posts'
import { getPendingObservationCount } from './self-observation/self-observation-outbox'
import * as sessionModule from './session'

describe('App Quick Checkin flow', () => {
  const originalLocation = window.location

  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
    window.location = originalLocation
  })

  const todayDateStr = getTodayDateString()

  const existingTodayDiaryPost = {
    path: `source/diary/${todayDateStr.replace(/-/g, '')}080000.md`,
    sha: 'sha-diary-today',
    title: `${todayDateStr}-星期二`,
    date: `${todayDateStr} 08:00:00`,
    published: false,
    hasExplicitPublished: true,
    categories: [],
    tags: [],
    contentType: 'diary' as const,
  }

  const existingTodayDiaryContent = `---
title: ${todayDateStr}-星期二
permalink: diary/${todayDateStr}/
date: ${todayDateStr} 08:00:00
published: false
categories: []
tags: []
---

早上完成了今日计划制定。`

  it('renders QuickCheckinView directly when url contains ?quick=checkin and saves to today diary', async () => {
    // Mock window.location
    delete (window as any).location
    window.location = new URL(`http://localhost:5174/Alpaca-Notes-CMS/admin/?quick=checkin`) as any

    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([existingTodayDiaryPost])

    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingTodayDiaryPost.path,
      sha: existingTodayDiaryPost.sha,
      content: existingTodayDiaryContent,
    })

    const saveSpy = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: existingTodayDiaryPost.path,
      sha: 'sha-diary-updated',
      content: 'saved',
    })

    render(<App />)

    // Should render quick checkin view directly
    expect(screen.getByText('我现在')).toBeTruthy()
    expect(screen.getByText('Alpaca Notes')).toBeTruthy()

    // Select "烦" and "紧张"
    fireEvent.click(screen.getByRole('button', { name: '烦' }))
    fireEvent.click(screen.getByRole('button', { name: '紧张' }))

    // Expand the optional context field
    fireEvent.click(screen.getByRole('button', { name: /发生了什么 \/ 我想到什么/ }))
    const textarea = screen.getByPlaceholderText('发生了什么，或脑中闪过的一句话…')
    fireEvent.change(textarea, { target: { value: '开会时被临时打断' } })

    // Save
    fireEvent.click(screen.getByRole('button', { name: '先记下来' }))

    await waitFor(() => {
      expect(screen.getByText('已记录。')).toBeTruthy()
    })

    expect(saveSpy).toHaveBeenCalledTimes(1)
    const savedContent = saveSpy.mock.calls[0]?.[1]?.content
    expect(savedContent).toContain('早上完成了今日计划制定。')
    expect(savedContent).toContain('## 自我观察')
    expect(savedContent).toContain('烦、紧张')
    expect(savedContent).toContain('开会时被临时打断')
  })

  it('opens SelfObservationModal from TopBar in desktop mode and saves observation', async () => {
    delete (window as any).location
    window.location = new URL(`http://localhost:5174/Alpaca-Notes-CMS/admin/`) as any

    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([existingTodayDiaryPost])

    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingTodayDiaryPost.path,
      sha: existingTodayDiaryPost.sha,
      content: existingTodayDiaryContent,
    })

    const saveSpy = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: existingTodayDiaryPost.path,
      sha: 'sha-diary-updated',
      content: 'saved',
    })

    render(<App />)

    // TopBar checkin button should be visible
    const checkinBtn = screen.getByRole('button', { name: '自我观察签到' })
    expect(checkinBtn).toBeTruthy()

    // Click to open modal
    fireEvent.click(checkinBtn)

    expect(screen.getByRole('dialog', { name: '自我观察签到' })).toBeTruthy()

    // Select "开心" and save
    fireEvent.click(screen.getByRole('button', { name: '开心' }))
    fireEvent.click(screen.getByRole('button', { name: '先记下来' }))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1)
    })
  })

  it('handles offline mode by keeping record in outbox and syncing when triggered', async () => {
    delete (window as any).location
    window.location = new URL(`http://localhost:5174/Alpaca-Notes-CMS/admin/?quick=checkin`) as any

    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([existingTodayDiaryPost])

    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingTodayDiaryPost.path,
      sha: existingTodayDiaryPost.sha,
      content: existingTodayDiaryContent,
    })

    // Mock network failure on save
    const saveSpy = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockRejectedValueOnce(new Error('Network error'))

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '烦' }))
    fireEvent.click(screen.getByRole('button', { name: '先记下来' }))

    await waitFor(() => {
      expect(screen.getByText(/已保存在本机/)).toBeTruthy()
    })

    expect(getPendingObservationCount()).toBe(1)
    expect(screen.getByText(/本机有 1 条待同步记录/)).toBeTruthy()

    // Now restore network and click sync
    saveSpy.mockResolvedValueOnce({
      path: existingTodayDiaryPost.path,
      sha: 'sha-diary-updated',
      content: 'saved',
    })

    fireEvent.click(screen.getByRole('button', { name: '同步' }))

    await waitFor(() => {
      expect(getPendingObservationCount()).toBe(0)
    })
  })

  it('switches out of quick mode to full editor when clicking 今日日记', async () => {
    delete (window as any).location
    window.location = new URL(`http://localhost:5174/Alpaca-Notes-CMS/admin/?quick=checkin`) as any

    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([existingTodayDiaryPost])

    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingTodayDiaryPost.path,
      sha: existingTodayDiaryPost.sha,
      content: existingTodayDiaryContent,
    })

    render(<App />)

    expect(screen.getByText('我现在')).toBeTruthy()

    // Click "今日日记"
    fireEvent.click(screen.getByRole('button', { name: '今日日记' }))

    await waitFor(() => {
      expect(screen.getByDisplayValue(`${todayDateStr}-星期二`)).toBeTruthy()
    })
  })
})
