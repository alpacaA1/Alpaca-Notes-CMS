import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import * as postsIndexModule from './posts/index-posts'
import * as sessionModule from './session'

const indexedPost = {
  path: 'source/_posts/recover-me.md',
  sha: 'sha-recover',
  title: 'Recover me',
  date: '2026-04-30 10:00:00',
  desc: 'desc',
  published: false,
  hasExplicitPublished: true,
  categories: ['专业'],
  tags: ['恢复'],
  permalink: 'recover-me/',
}

const indexedPostContent = `---
title: Recover me
permalink: recover-me/
date: 2026-04-30 10:00:00
published: false
categories:
  - 专业
tags:
  - 恢复
desc: desc
---

Original body.`

describe('App local draft recovery', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    githubClientModule.clearMarkdownFileCache()
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('restores an existing post draft after reopening the app', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([indexedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: indexedPost.path,
      sha: indexedPost.sha,
      content: indexedPostContent,
    })

    const firstRender = render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Recover me')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /recover me/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Recovered after crash' } })

    await waitFor(() => {
      expect(window.localStorage.length).toBeGreaterThan(0)
    })

    firstRender.unmount()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Recover me')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /recover me/i }))

    expect(await screen.findByDisplayValue('Recovered after crash')).toBeTruthy()
    expect(screen.getByRole('button', { name: '保存' })).toBeTruthy()
    expect(screen.getByText(/未保存修改/)).toBeTruthy()
  })

  it('shows an orphan local draft entry for an unsaved new post', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])

    const firstRender = render(<App />)

    await waitFor(() => {
      expect(screen.getByText('还没有文章')).toBeTruthy()
    })

    fireEvent.click(screen.getAllByRole('button', { name: '+ 新建文章' })[0] as HTMLButtonElement)
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Local-only draft' } })

    await waitFor(() => {
      expect(window.localStorage.length).toBeGreaterThan(0)
    })

    firstRender.unmount()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('检测到 1 条未恢复的本地草稿')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /local-only draft/i }))

    expect(await screen.findByDisplayValue('Local-only draft')).toBeTruthy()
    expect(screen.getByRole('button', { name: '保存' })).toBeTruthy()
    expect(screen.getByText(/未保存修改/)).toBeTruthy()
  })
})
