import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import * as indexPostsModule from './posts/index-posts'
import * as sessionModule from './session'

const supportedPost = {
  path: 'source/_posts/preview-supported.md',
  sha: 'sha-preview-supported',
  title: 'Preview supported post',
  date: '2026-04-03 12:00:00',
  desc: 'desc',
  published: true,
  hasExplicitPublished: true,
  categories: ['专业'],
  tags: ['产品'],
  permalink: 'preview-supported-post/',
}

const supportedContent = `---
title: Preview supported post
permalink: preview-supported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

# Preview Title

Body with **bold** text and [link](https://example.com).`

const unsupportedPost = {
  ...supportedPost,
  path: 'source/_posts/preview-unsupported.md',
  sha: 'sha-preview-unsupported',
  title: 'Preview unsupported post',
  permalink: 'preview-unsupported-post/',
}

const unsupportedContent = `---
title: Preview unsupported post
permalink: preview-unsupported-post/
date: 2026-04-03 12:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: desc
---

![alt](/uploads/image.png)`

describe('App preview mode', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  it('renders an approximate markdown preview for the current document', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: supportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('Rich editor')

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

    expect(await screen.findByRole('heading', { name: 'Preview Title' })).toBeTruthy()
    expect(screen.getByText(/Body with/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'link' })).toBeTruthy()
    expect(screen.getByText('Approximate client-side preview. Final Hexo or theme rendering may differ.')).toBeTruthy()
  })

  it('keeps unsupported-content warnings visible in preview mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([unsupportedPost])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: unsupportedPost.path,
      sha: unsupportedPost.sha,
      content: unsupportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview unsupported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview unsupported post/i }))
    await screen.findByLabelText('Markdown editor')

    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

    expect(await screen.findByRole('link', { name: 'alt' })).toBeTruthy()
    expect(screen.getByText('Image syntax is not supported in rich mode.')).toBeTruthy()
    expect(screen.getByText('Approximate client-side preview. Final Hexo or theme rendering may differ.')).toBeTruthy()
  })
})
