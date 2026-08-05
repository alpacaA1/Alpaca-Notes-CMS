import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import * as indexPostsModule from './posts/index-posts'
import * as sessionModule from './session'

const mockPost = {
  path: 'source/_posts/toast-test.md',
  sha: 'sha-toast',
  title: 'Toast test post',
  date: '2026-04-03 12:00:00',
  desc: 'desc',
  published: false,
  hasExplicitPublished: true,
  categories: ['专业'],
  tags: ['产品'],
  permalink: 'toast-test-post/',
}

const mockContent = `---
title: Toast test post
permalink: toast-test-post/
date: 2026-04-03 12:00:00
published: false
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Body text.`

describe('App floating toast notifications', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders save success notification as a floating toast with close button and auto dismisses', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([mockPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: mockPost.path,
      sha: mockPost.sha,
      content: mockContent,
    })
    vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: mockPost.path,
      sha: 'sha-updated',
      content: 'serialized',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Toast test post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /toast test post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Updated Toast Title' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    const toastContainer = await screen.findByRole('region', { name: '通知提示' })
    expect(toastContainer).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('已保存。')

    // Click close button
    const closeBtn = screen.getByRole('button', { name: '关闭提示' })
    expect(closeBtn).toBeTruthy()

    fireEvent.click(closeBtn)
    expect(screen.queryByRole('region', { name: '通知提示' })).toBeNull()
  })

  it('automatically dismisses save toast after timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([mockPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: mockPost.path,
      sha: mockPost.sha,
      content: mockContent,
    })
    vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: mockPost.path,
      sha: 'sha-updated',
      content: 'serialized',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Toast test post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /toast test post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Updated Toast Title 2' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('region', { name: '通知提示' })).toBeTruthy()

    // Advance timer past 3200ms
    act(() => {
      vi.advanceTimersByTime(3500)
    })

    expect(screen.queryByRole('region', { name: '通知提示' })).toBeNull()
  })
})
