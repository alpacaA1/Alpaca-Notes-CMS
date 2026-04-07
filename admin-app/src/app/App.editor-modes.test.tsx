import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import * as indexPostsModule from './posts/index-posts'
import * as sessionModule from './session'

const supportedPost = {
  path: 'source/_posts/supported.md',
  sha: 'sha-supported',
  title: 'Supported post',
  date: '2026-04-03 12:00:00',
  desc: 'desc',
  published: true,
  hasExplicitPublished: true,
  categories: ['专业'],
  tags: ['产品'],
  permalink: 'supported-post/',
}

const supportedContent = `---
title: Supported post
permalink: supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Body with **bold** text.`

const unsupportedContent = `---
title: Unsupported post
permalink: unsupported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

![alt](/uploads/image.png)`

const unsupportedPost = {
  ...supportedPost,
  path: 'source/_posts/unsupported.md',
  title: 'Unsupported post',
  permalink: 'unsupported-post/',
}

describe('App editor modes', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  it('keeps markdown mode available for supported documents', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: supportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /supported post/i }))
    await screen.findByLabelText('Rich editor')

    fireEvent.click(screen.getByRole('button', { name: 'Markdown' }))
    expect(await screen.findByLabelText('Markdown editor')).toBeTruthy()
  })

  it('opens supported documents in rich mode and preserves canonical markdown through switches', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: supportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /supported post/i }))
    expect(await screen.findByLabelText('Rich editor')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    expect(await screen.findByText('Approximate client-side preview. Final Hexo or theme rendering may differ.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Editor' }))
    expect(await screen.findByLabelText('Rich editor')).toBeTruthy()
  })

  it('keeps unsupported documents in markdown mode and shows the warning banner', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([unsupportedPost])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: unsupportedPost.path,
      sha: unsupportedPost.sha,
      content: unsupportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Unsupported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /unsupported post/i }))
    expect(await screen.findByLabelText('Markdown editor')).toBeTruthy()
    expect(screen.getByText('Image syntax is not supported in rich mode.')).toBeTruthy()
  })
})
