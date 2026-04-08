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

const unsafeLinkContent = `---
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

Body with [safe link](https://example.com), [relative link](/internal), [bare relative link](guide/), [asset link](assets/file.pdf), [unsafe link](javascript:alert), [tab-obfuscated link](java	script:alert(1)), [newline-obfuscated link](java
script:alert(1)), and [protocol-relative link](//example.com).`

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

  it('renders the current document title, date, and body in preview mode', async () => {
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
    await screen.findByLabelText('可视编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    expect(await screen.findByRole('heading', { name: 'Preview supported post' })).toBeTruthy()
    expect(screen.getByText('2026-04-03 12:00:00')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Preview Title' })).toBeTruthy()
    expect(screen.getByText(/Body with/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'link' })).toBeTruthy()
  })

  it('sanitizes unsafe markdown links before rendering preview anchors', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: unsafeLinkContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Preview supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /preview supported post/i }))
    await screen.findByLabelText('可视编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const safeLink = await screen.findByRole('link', { name: 'safe link' })
    expect(safeLink.getAttribute('href')).toBe('https://example.com')

    const relativeLink = screen.getByRole('link', { name: 'relative link' })
    expect(relativeLink.getAttribute('href')).toBe('/internal')

    const bareRelativeLink = screen.getByRole('link', { name: 'bare relative link' })
    expect(bareRelativeLink.getAttribute('href')).toBe('guide/')

    const assetLink = screen.getByRole('link', { name: 'asset link' })
    expect(assetLink.getAttribute('href')).toBe('assets/file.pdf')

    const unsafeLink = screen.getByText('unsafe link')
    expect(unsafeLink.tagName).toBe('SPAN')

    const tabObfuscatedLink = screen.getByText('tab-obfuscated link')
    expect(tabObfuscatedLink.tagName).toBe('SPAN')

    const newlineObfuscatedLink = screen.getByText('newline-obfuscated link')
    expect(newlineObfuscatedLink.tagName).toBe('SPAN')

    const protocolRelativeLink = screen.getByText('protocol-relative link')
    expect(protocolRelativeLink.tagName).toBe('SPAN')
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
    await screen.findByLabelText('Markdown 编辑器')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    expect(await screen.findByRole('link', { name: 'alt' })).toBeTruthy()
    expect(screen.getByText('富文本模式暂不支持图片语法。')).toBeTruthy()
    expect(screen.queryByText('这是客户端近似预览，最终呈现仍以 Hexo 与主题渲染结果为准。')).toBeNull()
  })
})
