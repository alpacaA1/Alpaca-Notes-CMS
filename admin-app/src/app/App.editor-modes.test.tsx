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

function selectReadLaterText(text: string) {
  const paragraph = screen.getByText(text)
  const textNode = paragraph.firstChild

  if (!textNode) {
    throw new Error('Missing text node for read-later selection test.')
  }

  const range = document.createRange()
  range.setStart(textNode, 0)
  range.setEnd(textNode, text.length)
  Object.defineProperty(range, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 80,
      height: 24,
      top: 120,
      left: 160,
      right: 240,
      bottom: 144,
      x: 160,
      y: 120,
      toJSON: () => ({}),
    }),
  })

  const selection = window.getSelection()
  if (!selection) {
    throw new Error('Missing window selection for read-later selection test.')
  }

  selection.removeAllRanges()
  selection.addRange(range)
  fireEvent.mouseUp(paragraph)
}

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

    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))
    await waitFor(() => {
      expect(screen.getByText('Read-later mode item')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /read-later mode item/i }))

    expect(await screen.findByText('这里是原文摘录。')).toBeTruthy()
    expect(screen.queryByText('待读设置')).toBeNull()
    expect(screen.getByRole('tab', { name: '信息' })).toBeTruthy()
    expect(screen.getByText('内容目录')).toBeTruthy()
    expect(screen.getByRole('button', { name: '← 返回归档' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '文章目录' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '回到顶部' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '第一部分' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '我的总结' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull()
    expect(screen.queryByRole('button', { name: '阅读视图' })).toBeNull()
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
    expect(screen.queryByText('当前稿件')).toBeNull()
    expect(container.querySelector('.admin-layout--reader')).toBeTruthy()
    expect(container.querySelector('.editor-layout--reader')).toBeTruthy()
    expect(container.querySelector('.editor-stack--reader')).toBeTruthy()
  })

  it('pins the opened read-later item from the info panel', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterContent,
    })
    const saveMarkdownFile = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockImplementation(async (_session, file) => ({
      path: file.path,
      sha: 'sha-read-later-editor-mode-pinned',
    }))

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))
    await waitFor(() => {
      expect(screen.getByText('Read-later mode item')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /read-later mode item/i }))
    expect(await screen.findByText('这里是原文摘录。')).toBeTruthy()

    fireEvent.click(screen.getByRole('checkbox', { name: '置顶' }))
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(saveMarkdownFile).toHaveBeenCalledTimes(1)
    })

    expect(saveMarkdownFile.mock.calls[0]?.[1]?.content).toContain('pinned: true')
    expect((screen.getByRole('checkbox', { name: '置顶' }) as HTMLInputElement).checked).toBe(true)
  })

  it('lets read-later reader hide and show the top bar', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterContent,
    })

    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))
    await waitFor(() => {
      expect(screen.getByText('Read-later mode item')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /read-later mode item/i }))
    await screen.findByText('这里是原文摘录。')

    expect(screen.getByRole('textbox', { name: '搜索' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '隐藏顶部栏' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '隐藏顶部栏' }))

    expect(screen.queryByRole('textbox', { name: '搜索' })).toBeNull()
    expect(screen.getByRole('button', { name: '显示顶部栏' })).toBeTruthy()
    expect(container.querySelector('.admin-shell--reader-top-bar-hidden')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '显示顶部栏' }))

    expect(screen.getByRole('textbox', { name: '搜索' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '隐藏顶部栏' })).toBeTruthy()
    expect(container.querySelector('.admin-shell--reader-top-bar-hidden')).toBeNull()
  })

  it('scrolls the center reader when clicking outline links', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterContent,
    })

    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))
    await waitFor(() => {
      expect(screen.getByText('Read-later mode item')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /read-later mode item/i }))
    expect(await screen.findByText('这里是原文摘录。')).toBeTruthy()

    const previewPane = container.querySelector('.preview-pane--reading-canvas') as HTMLElement | null
    const sectionHeading = screen.getByRole('heading', { name: '第一部分' })
    if (!previewPane) {
      throw new Error('Missing preview pane in read-later outline test.')
    }

    const scrollTo = vi.fn()
    Object.defineProperty(previewPane, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    Object.defineProperty(previewPane, 'scrollTop', {
      configurable: true,
      value: 48,
      writable: true,
    })
    Object.defineProperty(previewPane, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, left: 0, right: 800, bottom: 700, width: 800, height: 600, x: 0, y: 100, toJSON: () => ({}) }),
    })
    Object.defineProperty(sectionHeading, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 320, left: 0, right: 640, bottom: 360, width: 640, height: 40, x: 0, y: 320, toJSON: () => ({}) }),
    })

    fireEvent.click(screen.getByRole('link', { name: '第一部分' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 244, behavior: 'smooth' })

    scrollTo.mockClear()
    fireEvent.click(screen.getByRole('link', { name: '回到顶部' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })

  it('updates the left outline highlight while the reader scrolls', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterContent,
    })

    const { container } = render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))
    await waitFor(() => {
      expect(screen.getByText('Read-later mode item')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /read-later mode item/i }))
    expect(await screen.findByText('这里是原文摘录。')).toBeTruthy()

    const previewPane = container.querySelector('.preview-pane--reading-canvas') as HTMLElement | null
    const article = container.querySelector('#read-later-content') as HTMLElement | null
    const firstHeading = screen.getByRole('heading', { name: '第一部分' })
    const summarySection = container.querySelector('#read-later-summary') as HTMLElement | null
    const commentarySection = container.querySelector('#read-later-commentary') as HTMLElement | null
    if (!previewPane || !article || !summarySection || !commentarySection) {
      throw new Error('Missing reader elements for outline sync test.')
    }

    Object.defineProperty(previewPane, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, left: 0, right: 800, bottom: 700, width: 800, height: 600, x: 0, y: 100, toJSON: () => ({}) }),
    })

    Object.defineProperty(article, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 112, left: 0, right: 760, bottom: 1200, width: 760, height: 1088, x: 0, y: 112, toJSON: () => ({}) }),
    })

    let firstHeadingTop = 180
    let summarySectionTop = 560
    let commentarySectionTop = 920

    Object.defineProperty(firstHeading, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: firstHeadingTop, left: 0, right: 640, bottom: firstHeadingTop + 40, width: 640, height: 40, x: 0, y: firstHeadingTop, toJSON: () => ({}) }),
    })

    Object.defineProperty(summarySection, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: summarySectionTop, left: 0, right: 640, bottom: summarySectionTop + 120, width: 640, height: 120, x: 0, y: summarySectionTop, toJSON: () => ({}) }),
    })

    Object.defineProperty(commentarySection, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: commentarySectionTop, left: 0, right: 640, bottom: commentarySectionTop + 120, width: 640, height: 120, x: 0, y: commentarySectionTop, toJSON: () => ({}) }),
    })

    fireEvent.scroll(previewPane)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '第一部分' }).className).toContain('is-active')
    })

    firstHeadingTop = -120
    summarySectionTop = 180
    commentarySectionTop = 520
    fireEvent.scroll(previewPane)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '我的总结' }).className).toContain('is-active')
    })

    expect(screen.getByRole('link', { name: '第一部分' }).className).not.toContain('is-active')
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
    fireEvent.click(screen.getByRole('button', { name: 'Document note' }))
    fireEvent.change(screen.getByLabelText('Document note'), { target: { value: '新的待读评论' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getAllByText('新的待读评论').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '← 返回归档' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull()
    expect(screen.queryByRole('button', { name: '阅读视图' })).toBeNull()
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
  })

  it('creates a read-later highlight note from text selection and opens the sidebar editor', async () => {
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

    selectReadLaterText('这里是原文摘录。')
    expect(await screen.findByRole('toolbar', { name: '文本批注工具栏' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '批注' }))

    expect(await screen.findByRole('button', { name: '这里是原文摘录。' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '高亮：这里是原文摘录。' })).toBeTruthy()
    expect(screen.getByLabelText('Highlight document note')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Highlight document note'), { target: { value: '选区批注' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('选区批注')).toBeTruthy()
    expect(screen.getByRole('button', { name: '← 返回归档' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull()
    expect(screen.queryByRole('button', { name: '阅读视图' })).toBeNull()
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
  })

  it('scrolls to and deletes a read-later highlight from the reading canvas', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

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

    selectReadLaterText('这里是原文摘录。')
    fireEvent.click(await screen.findByRole('button', { name: '批注' }))
    fireEvent.change(await screen.findByLabelText('Highlight document note'), { target: { value: '选区批注' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('选区批注')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '删除高亮' })).toBeNull()
    expect(scrollIntoView).not.toHaveBeenCalled()
    scrollIntoView.mockClear()

    fireEvent.click(screen.getByRole('button', { name: '这里是原文摘录。' }))
    expect(scrollIntoView).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '删除高亮' })).toBeNull()

    scrollIntoView.mockClear()
    fireEvent.click(screen.getByRole('button', { name: '高亮：这里是原文摘录。' }))
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '删除高亮' })).toBeTruthy()
    expect(screen.getByLabelText('Highlight document note')).toBeTruthy()

    fireEvent.click(screen.getByText('这里是我的总结。'))
    expect(screen.queryByRole('button', { name: '删除高亮' })).toBeNull()
    expect(screen.queryByLabelText('Highlight document note')).toBeNull()
    expect(screen.getByRole('button', { name: '高亮：这里是原文摘录。' }).className).not.toContain('is-active')

    fireEvent.click(screen.getByRole('button', { name: '高亮：这里是原文摘录。' }))
    fireEvent.click(screen.getByRole('button', { name: '删除高亮' }))

    expect(screen.queryByRole('button', { name: '这里是原文摘录。' })).toBeNull()
    expect(screen.queryByText('选区批注')).toBeNull()
    expect(screen.queryByRole('button', { name: '高亮：这里是原文摘录。' })).toBeNull()
    expect(screen.getByText('选中文本后可在这里查看高亮和批注。')).toBeTruthy()
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
