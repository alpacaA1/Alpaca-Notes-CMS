import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import * as indexPostsModule from './posts/index-posts'
import * as readLaterIndexModule from './read-later/index-items'
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

const imageContent = `---
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

const imagePost = {
  ...supportedPost,
  path: 'source/_posts/image.md',
  title: 'Image post',
  permalink: 'image-post/',
}

const readLaterPost = {
  path: 'source/read-later-items/editor-mode-item.md',
  sha: 'sha-read-later-editor-mode',
  title: 'Read-later mode item',
  date: '2026-04-05 09:30:00',
  desc: 'desc',
  published: false,
  hasExplicitPublished: false,
  categories: [],
  tags: ['待读'],
  permalink: 'read-later/editor-mode-item/',
  contentType: 'read-later' as const,
  externalUrl: 'https://example.com/original',
  sourceName: 'Mode Source',
  readingStatus: 'reading' as const,
}

const readLaterContent = `---
title: Read-later mode item
permalink: read-later/editor-mode-item/
date: 2026-04-05 09:30:00
desc: desc
external_url: https://example.com/original
source_name: Mode Source
reading_status: reading
read_later: true
nav_exclude: true
layout: read-later-item
---

## 原文摘录
# 第一部分
这里是原文摘录。

## 我的总结
这里是我的总结。

## 我的评论
这里是我的评论。`

describe('App editor modes', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    githubClientModule.clearMarkdownFileCache()
    window.sessionStorage.clear()
  })

  it('opens supported documents directly in markdown mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: supportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /supported post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '可视编辑' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull()
  })

  it('returns to markdown mode after leaving preview', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: supportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /supported post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '预览' }))
    expect(await screen.findByRole('heading', { name: 'Supported post' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()
  })

  it('opens read-later documents directly in reading view with the reader outline visible', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterContent,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))
    await waitFor(() => {
      expect(screen.getByText('Read-later mode item')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /read-later mode item/i }))

    expect(await screen.findByText('这里是原文摘录。')).toBeTruthy()
    expect(screen.getByText('待读设置')).toBeTruthy()
    expect(screen.getByText('内容目录')).toBeTruthy()
    expect(screen.getByRole('button', { name: '← 返回归档' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '文章目录' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '第一部分' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '我的总结' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull()
    expect(screen.queryByRole('button', { name: '阅读视图' })).toBeNull()
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
    expect(screen.queryByText('当前稿件')).toBeNull()
  })

  it('keeps read-later in reading view while sidebar edits update the rendered commentary', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterContent,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))
    await waitFor(() => {
      expect(screen.getByText('Read-later mode item')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /read-later mode item/i }))
    await screen.findByText('这里是原文摘录。')

    fireEvent.click(screen.getByRole('tab', { name: '评论' }))
    fireEvent.change(screen.getByLabelText('我的评论'), { target: { value: '新的待读评论' } })

    expect((await screen.findByLabelText('我的评论') as HTMLTextAreaElement).value).toBe('新的待读评论')
    expect(screen.getAllByText('新的待读评论').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '← 返回归档' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull()
    expect(screen.queryByRole('button', { name: '阅读视图' })).toBeNull()
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
  })

  it('opens image documents directly in markdown mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([imagePost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: imagePost.path,
      sha: imagePost.sha,
      content: imageContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Image post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /image post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()
    expect(screen.queryByText('富文本模式暂不支持图片语法。')).toBeNull()
  })

  it('uses immersive mode from the editor toolbar and keeps it beside upload image', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: supportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /supported post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()
    expect(screen.getByText('当前稿件')).toBeTruthy()
    expect(screen.getByText('文章归档')).toBeTruthy()
    expect(screen.getByText('发布设置')).toBeTruthy()

    expect(screen.queryByRole('button', { name: '沉浸模式' })).toBeTruthy()
    expect(screen.queryAllByRole('button', { name: '沉浸模式' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: '沉浸模式' }).closest('.markdown-editor__toolbar')).toBeTruthy()
    expect(screen.getByRole('button', { name: '上传图片' }).closest('.markdown-editor__toolbar')).toBe(
      screen.getByRole('button', { name: '沉浸模式' }).closest('.markdown-editor__toolbar'),
    )

    fireEvent.click(screen.getByRole('button', { name: '沉浸模式' }))

    expect(screen.queryByText('当前稿件')).toBeNull()
    expect(screen.queryByText('文章归档')).toBeNull()
    expect(screen.queryByText('发布设置')).toBeNull()
    expect(screen.getByRole('button', { name: '退出沉浸' }).closest('.markdown-editor__toolbar')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '退出沉浸' }))

    expect(await screen.findByText('当前稿件')).toBeTruthy()
    expect(screen.getByText('文章归档')).toBeTruthy()
    expect(screen.getByText('发布设置')).toBeTruthy()
  })

  it('renders unsaved title and body edits in preview and returns to markdown mode on exit', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: supportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /supported post/i }))
    const markdownEditor = await screen.findByLabelText('Markdown 编辑器')

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Edited title before preview' } })
    fireEvent.change(markdownEditor, {
      target: { value: 'Edited body before preview with **bold** text.' },
    })

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    expect(await screen.findByRole('heading', { name: 'Edited title before preview' })).toBeTruthy()
    expect(screen.getByText(/Edited body before preview/)).toBeTruthy()
    expect(screen.queryByText('当前稿件')).toBeNull()
    expect(screen.queryByText('文章归档')).toBeNull()
    expect(screen.queryByText('发布设置')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))

    const restoredMarkdownEditor = await screen.findByLabelText('Markdown 编辑器')
    expect(restoredMarkdownEditor).toBeTruthy()
    expect(screen.getByDisplayValue('Edited title before preview')).toBeTruthy()
    expect(screen.getByDisplayValue('Edited body before preview with **bold** text.')).toBeTruthy()
    expect(screen.getByText('当前稿件')).toBeTruthy()
    expect(screen.getByText('文章归档')).toBeTruthy()
    expect(screen.getByText('发布设置')).toBeTruthy()
  })

  it('renders unsaved paragraph line breaks in preview and preserves them after returning to edit mode', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: supportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /supported post/i }))
    const markdownEditor = await screen.findByLabelText('Markdown 编辑器')

    fireEvent.change(markdownEditor, {
      target: { value: 'First line\nSecond line' },
    })

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const paragraph = await screen.findByText(
      (_, element) => element?.tagName === 'P' && element.textContent === 'First lineSecond line',
    )
    expect(paragraph.querySelector('br')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))

    const restoredMarkdownEditor = await screen.findByLabelText('Markdown 编辑器') as HTMLTextAreaElement
    expect(restoredMarkdownEditor.value).toBe('First line\nSecond line')
  })

  it('restores markdown mode with unsaved edits after leaving preview', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: supportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Supported post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /supported post/i }))
    const markdownEditor = await screen.findByLabelText('Markdown 编辑器')
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Markdown preview title' } })
    fireEvent.change(markdownEditor, {
      target: { value: 'Markdown preview body with [draft link](https://example.com).' },
    })

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    expect(await screen.findByRole('heading', { name: 'Markdown preview title' })).toBeTruthy()
    expect(screen.getByText(/Markdown preview body with/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))

    const restoredMarkdownEditor = await screen.findByLabelText('Markdown 编辑器')
    expect(restoredMarkdownEditor).toBeTruthy()
    expect(screen.getByDisplayValue('Markdown preview title')).toBeTruthy()
    expect(screen.getByDisplayValue('Markdown preview body with [draft link](https://example.com).')).toBeTruthy()
  })

  it('does not expose a separate expand editor action', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([supportedPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: supportedPost.path,
      sha: supportedPost.sha,
      content: supportedContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Supported post')).toBeTruthy()
    })

    expect(screen.queryByRole('button', { name: '放大编辑框' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /supported post/i }))
    await screen.findByLabelText('Markdown 编辑器')

    expect(screen.queryByRole('button', { name: '放大编辑框' })).toBeNull()
  })
})
