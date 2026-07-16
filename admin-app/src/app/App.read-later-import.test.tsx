import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import * as postsIndexModule from './posts/index-posts'
import * as feedDirectoryClientModule from './read-later/feed-directory-client'
import * as feedImportClientModule from './read-later/feed-import-client'
import * as readLaterIndexModule from './read-later/index-items'
import * as importClientModule from './read-later/import-client'
import * as feedSubscriptionsModule from './rss/feed-subscriptions'
import * as sessionModule from './session'

const readLaterPost = {
  path: 'source/read-later-items/import-me.md',
  sha: 'sha-read-later',
  title: 'Import me later',
  date: '2026-04-27 10:00:00',
  desc: 'old desc',
  published: false,
  hasExplicitPublished: false,
  categories: [],
  tags: ['待读'],
  permalink: 'read-later/import-me/',
  contentType: 'read-later' as const,
  externalUrl: 'https://example.com/article',
  sourceName: 'Old source',
  readingStatus: 'unread' as const,
}

const readLaterContent = `---
title:
permalink: read-later/import-me/
layout: read-later-item
date: 2026-04-27 10:00:00
read_later: true
nav_exclude: true
external_url: https://example.com/article
source_name:
reading_status: unread
tags:
  - 待读
desc:
---

## 原文摘录

## 我的总结

## 我的评论`

const annotation = {
  id: 'annotation-1',
  sectionKey: 'articleExcerpt' as const,
  quote: '高亮内容',
  prefix: '这里是',
  suffix: '和正文。',
  note: '已有批注',
  createdAt: '2026-04-29T08:00:00.000Z',
  updatedAt: '2026-04-29T08:00:00.000Z',
}

describe('App read-later import flow', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    githubClientModule.clearMarkdownFileCache()
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('imports article content into a read-later draft and backfills empty metadata', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterContent,
    })
    const importSpy = vi.spyOn(importClientModule, 'importReadLaterFromUrl').mockResolvedValue({
      title: '导入后的标题',
      desc: '导入后的摘要',
      sourceName: '导入来源',
      markdown: '# 导入正文\n\n第二段',
      requestedUrl: 'https://example.com/article',
      finalUrl: 'https://example.com/article',
      needsManualPaste: false,
    })
    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    await waitFor(() => {
      expect(screen.getByText('Import me later')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /import me later/i }))
    expect(await screen.findByRole('link', { name: '原文摘录' })).toBeTruthy()
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '信息' }))
    fireEvent.click(screen.getByRole('button', { name: '从链接导入正文' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText('当前正文将被导入内容覆盖，确认继续吗？')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '覆盖并导入' }))

    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledWith(
        { token: 'persisted-token' },
        'https://example.com/article',
        { includeImages: true },
      )
    })

    expect(await screen.findByRole('heading', { name: '导入正文' })).toBeTruthy()
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('导入后的标题')
    expect((screen.getByLabelText('摘要') as HTMLTextAreaElement).value).toBe('导入后的摘要')
    expect((screen.getByLabelText('来源') as HTMLInputElement).value).toBe('导入来源')
    expect(screen.getByRole('button', { name: '保存' })).toBeTruthy()
  })

  it('uploads imported remote images and rewrites read-later markdown to site image paths', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: readLaterContent,
    })
    const uploadSpy = vi.spyOn(githubClientModule, 'uploadImageFile').mockResolvedValue({
      path: 'source/images/2026/06/1-p735699706.jpg',
      sha: 'image-sha',
    })
    vi.spyOn(importClientModule, 'importReadLaterFromUrl').mockResolvedValue({
      title: '豆瓣帖子',
      desc: '摘要',
      sourceName: 'douban.com',
      markdown: '导入正文\n\n![图1](https://img9.doubanio.com/view/group_topic/l/public/p735699706.jpg)',
      requestedUrl: 'https://www.douban.com/group/topic/490564194/',
      finalUrl: 'https://www.douban.com/group/topic/490564194/',
      needsManualPaste: false,
      images: [
        {
          sourceUrl: 'https://img9.doubanio.com/view/group_topic/l/public/p735699706.jpg',
          finalUrl: 'https://img9.doubanio.com/view/group_topic/l/public/p735699706.jpg',
          contentType: 'image/jpeg',
          extension: 'jpg',
          basename: 'p735699706',
          contentBase64: 'aGVsbG8=',
        },
      ],
    })

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))
    await waitFor(() => {
      expect(screen.getByText('Import me later')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /import me later/i }))
    await screen.findByRole('link', { name: '原文摘录' })
    fireEvent.click(screen.getByRole('tab', { name: '信息' }))
    fireEvent.click(screen.getByRole('button', { name: '从链接导入正文' }))
    fireEvent.click(await screen.findByRole('button', { name: '覆盖并导入' }))

    await waitFor(() => {
      expect(uploadSpy).toHaveBeenCalledWith(
        { token: 'persisted-token' },
        expect.objectContaining({
          path: expect.stringMatching(/^source\/images\/\d{4}\/\d{2}\/\d+-p735699706\.jpg$/),
          file: expect.any(File),
        }),
      )
    })

    const image = await screen.findByAltText('图1') as HTMLImageElement
    expect(image.getAttribute('src')).toMatch(/^\/Alpaca-Notes-CMS\/images\/\d{4}\/\d{2}\/\d+-p735699706\.jpg$/)
  })

  it('confirms before overwriting annotated content and clears highlights after import', async () => {
    const encodedAnnotation = encodeURIComponent(JSON.stringify(annotation))

    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: `---
 title: Import me later
 permalink: read-later/import-me/
 layout: read-later-item
 date: 2026-04-27 10:00:00
 read_later: true
 nav_exclude: true
 external_url: https://example.com/article
 source_name: Old source
 reading_status: unread
 reader_annotations:
   - ${encodedAnnotation}
 tags:
   - 待读
 desc: old desc
 ---

 ## 原文摘录
 这里是高亮内容和正文。

 ## 我的总结
 已有总结

 ## 我的评论
 已有评论`.replace(/^ /gm, ''),
    })
    const importSpy = vi.spyOn(importClientModule, 'importReadLaterFromUrl').mockResolvedValue({
      title: '导入后的标题',
      desc: '导入后的摘要',
      sourceName: '导入来源',
      markdown: '# 导入正文',
      requestedUrl: 'https://example.com/article',
      finalUrl: 'https://example.com/article',
      needsManualPaste: false,
    })
    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))
    await waitFor(() => {
      expect(screen.getByText('Import me later')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /import me later/i }))
    await screen.findByRole('link', { name: '原文摘录' })

    fireEvent.click(screen.getByRole('tab', { name: '评论' }))
    expect(await screen.findByRole('button', { name: '高亮内容' })).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: '信息' }))
    fireEvent.click(screen.getByRole('button', { name: '从链接导入正文' }))

    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText('当前正文和高亮批注将被导入内容覆盖，确认继续吗？')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '覆盖并导入' }))

    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledWith(
        { token: 'persisted-token' },
        'https://example.com/article',
        { includeImages: true },
      )
    })

    expect(await screen.findByRole('heading', { name: '导入正文' })).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: '评论' }))
    expect(screen.queryByRole('button', { name: '高亮内容' })).toBeNull()
    expect(screen.getByText('选中文本后可在这里查看高亮和批注。')).toBeTruthy()
  })

  it('edits read-later commentary from the sidebar and auto-structures plain markdown', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: readLaterPost.path,
      sha: readLaterPost.sha,
      content: `---
 title: Import me later
 permalink: read-later/import-me/
 layout: read-later-item
 date: 2026-04-27 10:00:00
 read_later: true
 nav_exclude: true
 external_url: https://example.com/article
 source_name: Old source
 reading_status: unread
 tags:
   - 待读
 desc: old desc
 ---

 # 导入正文

 第二段`.replace(/^ /gm, ''),
    })

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))
    await waitFor(() => {
      expect(screen.getByText('Import me later')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /import me later/i }))
    expect(await screen.findByText('第二段')).toBeTruthy()
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
    expect(screen.queryByRole('heading', { name: '原文摘录' })).toBeNull()

    fireEvent.click(screen.getByRole('tab', { name: '评论' }))
    fireEvent.click(screen.getByRole('button', { name: 'Document note' }))
    fireEvent.change(screen.getByLabelText('Document note'), { target: { value: '补一条评论' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getAllByText('补一条评论').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: '原文摘录' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '我的评论' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull()
  })

  it('quickly captures a new read-later draft from the dashboard and warns on duplicate url', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    const importSpy = vi.spyOn(importClientModule, 'importReadLaterFromUrl').mockResolvedValue({
      title: '快速收录标题',
      desc: '快速收录摘要',
      sourceName: '快速来源',
      markdown: '# 快速导入正文\n\n第二段',
      requestedUrl: 'https://example.com/article',
      finalUrl: 'https://example.com/article',
      needsManualPaste: false,
    })
    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    await waitFor(() => {
      expect(screen.getByText('Import me later')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('快速收录链接'), { target: { value: 'https://example.com/article' } })
    fireEvent.click(screen.getByRole('button', { name: '快速收录' }))

    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    expect(screen.getByText('已存在相同原文链接的待读《Import me later》。仍要继续创建新草稿吗？')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '继续创建' }))

    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledWith(
        { token: 'persisted-token' },
        'https://example.com/article',
        { allowMetadataOnly: true, includeImages: true },
      )
    })

    expect(await screen.findByRole('heading', { name: '快速导入正文' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '信息' }))
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('快速收录标题')
    expect((screen.getByLabelText('摘要') as HTMLTextAreaElement).value).toBe('快速收录摘要')
    expect((screen.getByLabelText('来源') as HTMLInputElement).value).toBe('快速来源')
    expect(screen.getByRole('button', { name: '保存' })).toBeTruthy()
  })

  it('falls back to metadata-only quick capture when article extraction fails', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    const importSpy = vi.spyOn(importClientModule, 'importReadLaterFromUrl').mockResolvedValue({
      title: '上下文主权：AI 时代，什么才算你的想法',
      desc: '上下文不是越多越好。',
      sourceName: 'Superlinear Academy',
      markdown: '',
      requestedUrl: 'https://www.superlinear.academy/c/posts/ai-5eb938',
      finalUrl: 'https://www.superlinear.academy/c/posts/ai-5eb938',
      needsManualPaste: true,
    })

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    await waitFor(() => {
      expect(screen.getByText('Import me later')).toBeTruthy()
    })

    fireEvent.change(screen.getByLabelText('快速收录链接'), {
      target: { value: 'https://www.superlinear.academy/c/posts/ai-5eb938' },
    })
    fireEvent.click(screen.getByRole('button', { name: '快速收录' }))

    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledWith(
        { token: 'persisted-token' },
        'https://www.superlinear.academy/c/posts/ai-5eb938',
        { allowMetadataOnly: true, includeImages: true },
      )
    })

    expect(await screen.findByRole('heading', { name: '上下文主权：AI 时代，什么才算你的想法' })).toBeTruthy()
    expect(await screen.findByRole('link', { name: '原文摘录' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '信息' }))
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('上下文主权：AI 时代，什么才算你的想法')
    expect((screen.getByLabelText('摘要') as HTMLTextAreaElement).value).toBe('上下文不是越多越好。')
    expect((screen.getByLabelText('来源') as HTMLInputElement).value).toBe('Superlinear Academy')

    fireEvent.change(screen.getByLabelText('手动粘贴正文'), {
      target: { value: '手动补录的正文第一段。' },
    })

    await waitFor(() => {
      expect(screen.getAllByText('手动补录的正文第一段。').length).toBeGreaterThan(0)
    })
  })

  it('subscribes a feed from the RSS page and automatically previews the selected article body', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(feedSubscriptionsModule, 'readFeedSubscriptions').mockResolvedValue({
      path: 'source/_data/feed-subscriptions.json',
      subscriptions: [],
    })
    vi.spyOn(feedSubscriptionsModule, 'saveFeedSubscriptions').mockImplementation(async (_session, state) => ({
      ...state,
      sha: 'feed-sha',
    }))
    const feedSpy = vi.spyOn(feedImportClientModule, 'importFeedFromUrl').mockResolvedValue({
      title: '设计摘录',
      description: '最近更新的设计文章',
      requestedUrl: 'https://example.com/feed.xml',
      finalUrl: 'https://example.com/feed.xml',
      items: [
        {
          id: 'feed-item-1',
          title: '新的系统设计文章',
          url: 'https://example.com/posts/design-systems',
          summary: '这是一篇关于系统设计取舍的摘要。',
          publishedAt: '2026-06-04T08:00:00.000Z',
          sourceName: '设计摘录',
        },
      ],
    })
    const importSpy = vi.spyOn(importClientModule, 'importReadLaterFromUrl').mockResolvedValue({
      title: '新的系统设计文章',
      desc: '这是一篇关于系统设计取舍的摘要。',
      sourceName: '设计摘录',
      markdown: '# 正文标题\n\n正文第一段',
      requestedUrl: 'https://example.com/posts/design-systems',
      finalUrl: 'https://example.com/posts/design-systems',
      needsManualPaste: false,
    })

    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'RSS' }))
    await screen.findByLabelText('Feed URL')
    fireEvent.change(screen.getByLabelText('Feed URL'), { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.click(screen.getByRole('button', { name: '新增 feed' }))

    await waitFor(() => {
      expect(feedSpy).toHaveBeenCalledWith({ token: 'persisted-token' }, 'https://example.com/feed.xml')
    })

    expect((await screen.findAllByText('设计摘录')).length).toBeGreaterThan(0)

    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledWith(
        { token: 'persisted-token' },
        'https://example.com/posts/design-systems',
        { includeImages: true },
      )
    })

    expect(await screen.findByRole('status')).toBeTruthy()
    expect(container.querySelector('.success-message')).toBeNull()
    expect(await screen.findByRole('heading', { name: '正文标题' })).toBeTruthy()
    expect(screen.getByText('正文第一段')).toBeTruthy()
    expect(screen.getByRole('link', { name: '打开原文' }).getAttribute('href')).toBe('https://example.com/posts/design-systems')

    fireEvent.click(screen.getByRole('button', { name: '加入待读' }))

    expect(importSpy).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: '保存' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '信息' }))
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('新的系统设计文章')
    expect((screen.getByLabelText('摘要') as HTMLTextAreaElement).value).toBe('这是一篇关于系统设计取舍的摘要。')
    expect((screen.getByLabelText('来源') as HTMLInputElement).value).toBe('设计摘录')
  })

  it('shows RSS load success as a toast without taking layout space', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(feedSubscriptionsModule, 'readFeedSubscriptions').mockResolvedValue({
      path: 'source/_data/feed-subscriptions.json',
      subscriptions: [
        {
          id: 'anthropic-news',
          title: 'Anthropic News',
          url: 'https://www.anthropic.com/news/rss.xml',
          description: '',
          category: '',
          sourceType: 'manual',
          articleCount: 20,
          readLaterCount: 0,
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '2026-06-04T12:00:00.000Z',
        },
      ],
    })
    vi.spyOn(feedImportClientModule, 'importFeedFromUrl').mockResolvedValue({
      title: 'Anthropic News',
      description: 'Anthropic updates',
      requestedUrl: 'https://www.anthropic.com/news/rss.xml',
      finalUrl: 'https://www.anthropic.com/news/rss.xml',
      items: Array.from({ length: 20 }, (_, index) => ({
        id: `feed-item-${index + 1}`,
        title: `Anthropic News ${index + 1}`,
        url: `https://www.anthropic.com/news/${index + 1}`,
        summary: 'Latest update.',
        publishedAt: '2026-06-04T08:00:00.000Z',
        sourceName: 'Anthropic News',
      })),
    })
    vi.spyOn(feedSubscriptionsModule, 'saveFeedSubscriptions').mockImplementation(async (_session, state) => ({
      ...state,
      sha: 'next-feed-sha',
    }))
    vi.spyOn(importClientModule, 'importReadLaterFromUrl').mockResolvedValue({
      title: 'Anthropic News 1',
      desc: 'Latest update.',
      sourceName: 'Anthropic News',
      markdown: '# Anthropic News 1',
      requestedUrl: 'https://www.anthropic.com/news/1',
      finalUrl: 'https://www.anthropic.com/news/1',
      needsManualPaste: false,
    })

    const { container } = render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'RSS' }))
    const sidebar = await screen.findByLabelText('已订阅 feed')
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }))
    fireEvent.click(within(sidebar).getByRole('button', { name: /Anthropic News/ }))

    expect(await screen.findByRole('status')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('已加载《Anthropic News》最近 20 条内容。')
    expect(container.querySelector('.success-message')).toBeNull()
  })

  it('keeps the current RSS item list visible while switching to an uncached feed', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(feedSubscriptionsModule, 'readFeedSubscriptions').mockResolvedValue({
      path: 'source/_data/feed-subscriptions.json',
      sha: 'feed-sha',
      folders: [],
      subscriptions: [
        {
          id: 'first-feed',
          title: 'First Feed',
          url: 'https://example.com/first.xml',
          description: '',
          category: '',
          sourceType: 'manual',
          articleCount: 1,
          readLaterCount: 0,
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
        {
          id: 'second-feed',
          title: 'Second Feed',
          url: 'https://example.com/second.xml',
          description: '',
          category: '',
          sourceType: 'manual',
          articleCount: 1,
          readLaterCount: 0,
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
      ],
    })
    vi.spyOn(feedSubscriptionsModule, 'saveFeedSubscriptions').mockImplementation(async (_session, state) => ({
      ...state,
      sha: 'next-feed-sha',
    }))
    vi.spyOn(feedImportClientModule, 'importFeedFromUrl').mockImplementation(async (_session, url) => {
      if (url === 'https://example.com/first.xml') {
        return {
          title: 'First Feed',
          description: '',
          requestedUrl: 'https://example.com/first.xml',
          finalUrl: 'https://example.com/first.xml',
          items: [
            {
              id: 'first-item',
              title: '第一频道文章',
              url: 'https://example.com/posts/first',
              summary: '第一频道摘要。',
              publishedAt: '2026-06-04T08:00:00.000Z',
              sourceName: 'First Feed',
            },
          ],
        }
      }

      return new Promise(() => {})
    })
    vi.spyOn(importClientModule, 'importReadLaterFromUrl').mockResolvedValue({
      title: '第一频道文章',
      desc: '第一频道摘要。',
      sourceName: 'First Feed',
      markdown: '# 第一频道正文',
      requestedUrl: 'https://example.com/posts/first',
      finalUrl: 'https://example.com/posts/first',
      needsManualPaste: false,
    })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'RSS' }))
    const sidebar = await screen.findByLabelText('已订阅 feed')
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }))
    fireEvent.click(within(sidebar).getByText('First Feed').closest('button') as HTMLButtonElement)

    expect(await screen.findByRole('button', { name: /第一频道文章/ })).toBeTruthy()

    fireEvent.click(within(sidebar).getByText('Second Feed').closest('button') as HTMLButtonElement)

    expect(screen.queryByText('正在读取最近条目…')).toBeNull()
    expect(screen.getByText('更新中…')).toBeTruthy()
    expect(screen.getByRole('button', { name: /第一频道文章/ })).toBeTruthy()
  })

  it('refreshes RSS items after entering the system so the top-bar badge uses current item URLs', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    window.localStorage.setItem('alpaca-admin-viewed-feed-items', JSON.stringify({
      'https://example.com/design.xml': [
        'https://example.com/posts/old-one',
        'https://example.com/posts/old-two',
      ],
    }))
    vi.spyOn(feedSubscriptionsModule, 'readFeedSubscriptions').mockResolvedValue({
      path: 'source/_data/feed-subscriptions.json',
      sha: 'feed-sha',
      folders: [],
      subscriptions: [
        {
          id: 'design-feed',
          title: 'Design Feed',
          url: 'https://example.com/design.xml',
          description: '',
          category: '',
          sourceType: 'manual',
          articleCount: 2,
          readLaterCount: 0,
          latestItemKeys: ['guid:feed-item-1', 'guid:feed-item-2'],
          unreadItemKeys: [],
          lastSuccessfulFetchAt: '2026-06-04T10:00:00.000Z',
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
      ],
    })
    const feedSpy = vi.spyOn(feedImportClientModule, 'importFeedFromUrl').mockResolvedValue({
      title: 'Design Feed',
      description: '',
      requestedUrl: 'https://example.com/design.xml',
      finalUrl: 'https://example.com/design.xml',
      items: [
        {
          id: 'feed-item-2',
          title: '旧文章二',
          url: 'https://example.com/posts/old-two',
          summary: '旧摘要。',
          publishedAt: '2026-06-04T08:00:00.000Z',
          sourceName: 'Design Feed',
        },
        {
          id: 'feed-item-3',
          title: '新文章三',
          url: 'https://example.com/posts/new-three',
          summary: '新摘要。',
          publishedAt: '2026-06-05T08:00:00.000Z',
          sourceName: 'Design Feed',
        },
      ],
    })

    const { container } = render(<App />)

    await waitFor(() => {
      expect(feedSpy).toHaveBeenCalledWith({ token: 'persisted-token' }, 'https://example.com/design.xml')
    })
    await waitFor(() => {
      expect(container.querySelector('.top-bar__rss-badge')?.textContent).toBe('1')
    })
  })

  it('updates an existing RSS subscription count after loading newer feed items', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(feedSubscriptionsModule, 'readFeedSubscriptions').mockResolvedValue({
      path: 'source/_data/feed-subscriptions.json',
      sha: 'feed-sha',
      folders: [],
      subscriptions: [
        {
          id: 'design-feed',
          title: '旧标题',
          url: 'https://example.com/design.xml',
          description: '',
          category: '',
          sourceType: 'manual',
          articleCount: 1,
          readLaterCount: 0,
          latestItemKeys: ['guid:legacy-item'],
          unreadItemKeys: [],
          lastSuccessfulFetchAt: '2026-06-04T10:00:00.000Z',
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
      ],
    })
    const saveSpy = vi.spyOn(feedSubscriptionsModule, 'saveFeedSubscriptions').mockImplementation(async (_session, state) => ({
      ...state,
      sha: 'next-feed-sha',
    }))
    vi.spyOn(feedImportClientModule, 'importFeedFromUrl').mockResolvedValue({
      title: 'Design Feed',
      description: '新的简介',
      requestedUrl: 'https://example.com/design.xml',
      finalUrl: 'https://example.com/design.xml',
      items: [
        {
          id: 'feed-item-1',
          title: '旧文章',
          url: 'https://example.com/posts/old',
          summary: '旧摘要。',
          publishedAt: '2026-06-04T08:00:00.000Z',
          sourceName: 'Design Feed',
        },
        {
          id: 'feed-item-2',
          title: '新文章',
          url: 'https://example.com/posts/new',
          summary: '新摘要。',
          publishedAt: '2026-06-05T08:00:00.000Z',
          sourceName: 'Design Feed',
        },
      ],
    })
    vi.spyOn(importClientModule, 'importReadLaterFromUrl').mockResolvedValue({
      title: '旧文章',
      desc: '旧摘要。',
      sourceName: 'Design Feed',
      markdown: '# 旧文章',
      requestedUrl: 'https://example.com/posts/old',
      finalUrl: 'https://example.com/posts/old',
      needsManualPaste: false,
    })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'RSS' }))
    const sidebar = await screen.findByLabelText('已订阅 feed')
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        { token: 'persisted-token' },
        expect.objectContaining({
          subscriptions: [
            expect.objectContaining({
              id: 'design-feed',
              title: 'Design Feed',
              description: '新的简介',
              articleCount: 2,
            }),
          ],
        }),
      )
    })
    expect(await screen.findByLabelText('2 条待读')).toBeTruthy()
  })

  it('refreshes RSS items on entry and shows unread count when newer items replace old ones', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    window.localStorage.setItem('alpaca-admin-viewed-feed-items', JSON.stringify({
      'https://example.com/design.xml': [
        'https://example.com/posts/old-one',
        'https://example.com/posts/old-two',
      ],
    }))
    vi.spyOn(feedSubscriptionsModule, 'readFeedSubscriptions').mockResolvedValue({
      path: 'source/_data/feed-subscriptions.json',
      sha: 'feed-sha',
      folders: [],
      subscriptions: [
        {
          id: 'design-feed',
          title: 'Design Feed',
          url: 'https://example.com/design.xml',
          description: '',
          category: '',
          sourceType: 'manual',
          articleCount: 2,
          readLaterCount: 0,
          latestItemKeys: ['guid:feed-item-1', 'guid:feed-item-2'],
          unreadItemKeys: [],
          lastSuccessfulFetchAt: '2026-06-04T10:00:00.000Z',
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
      ],
    })
    vi.spyOn(feedSubscriptionsModule, 'saveFeedSubscriptions').mockImplementation(async (_session, state) => ({
      ...state,
      sha: 'next-feed-sha',
    }))
    const feedSpy = vi.spyOn(feedImportClientModule, 'importFeedFromUrl').mockResolvedValue({
      title: 'Design Feed',
      description: '',
      requestedUrl: 'https://example.com/design.xml',
      finalUrl: 'https://example.com/design.xml',
      items: [
        {
          id: 'feed-item-2',
          title: '旧文章二',
          url: 'https://example.com/posts/old-two',
          summary: '旧摘要。',
          publishedAt: '2026-06-04T08:00:00.000Z',
          sourceName: 'Design Feed',
        },
        {
          id: 'feed-item-3',
          title: '新文章三',
          url: 'https://example.com/posts/new-three',
          summary: '新摘要。',
          publishedAt: '2026-06-05T08:00:00.000Z',
          sourceName: 'Design Feed',
        },
      ],
    })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'RSS' }))

    await waitFor(() => {
      expect(feedSpy).toHaveBeenCalledWith({ token: 'persisted-token' }, 'https://example.com/design.xml')
    })

    const sidebar = await screen.findByLabelText('已订阅 feed')
    fireEvent.click(within(sidebar).getByRole('button', { name: '展开 Uncategorized' }))
    expect(await within(sidebar).findByLabelText('1 条待读')).toBeTruthy()
  })

  it('deletes an RSS folder and moves its feeds into Uncategorized', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(feedSubscriptionsModule, 'readFeedSubscriptions').mockResolvedValue({
      path: 'source/_data/feed-subscriptions.json',
      sha: 'feed-sha',
      folders: [
        {
          id: 'folder-news',
          name: 'Newspaper',
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
      ],
      subscriptions: [
        {
          id: 'news-feed',
          title: 'News Feed',
          url: 'https://example.com/news.xml',
          description: '',
          category: 'Newspaper',
          sourceType: 'manual',
          articleCount: 3,
          readLaterCount: 0,
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
      ],
    })
    const saveSpy = vi.spyOn(feedSubscriptionsModule, 'saveFeedSubscriptions').mockImplementation(async (_session, state) => ({
      ...state,
      sha: 'next-feed-sha',
    }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'RSS' }))
    const sidebar = await screen.findByLabelText('已订阅 feed')

    fireEvent.click(within(sidebar).getByRole('button', { name: 'Newspaper 更多操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        { token: 'persisted-token' },
        expect.objectContaining({
          folders: [],
          subscriptions: [
            expect.objectContaining({
              id: 'news-feed',
              category: '',
            }),
          ],
        }),
      )
    })
    expect(await screen.findByText('Uncategorized')).toBeTruthy()
  })



  it('shows a fallback notice when the RSS article body cannot be extracted automatically', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue([readLaterPost])
    vi.spyOn(feedSubscriptionsModule, 'readFeedSubscriptions').mockResolvedValue({
      path: 'source/_data/feed-subscriptions.json',
      subscriptions: [],
    })
    vi.spyOn(feedSubscriptionsModule, 'saveFeedSubscriptions').mockImplementation(async (_session, state) => ({
      ...state,
      sha: 'feed-sha',
    }))
    vi.spyOn(feedImportClientModule, 'importFeedFromUrl').mockResolvedValue({
      title: '设计摘录',
      description: '最近更新的设计文章',
      requestedUrl: 'https://example.com/feed.xml',
      finalUrl: 'https://example.com/feed.xml',
      items: [
        {
          id: 'feed-item-1',
          title: '新的系统设计文章',
          url: 'https://example.com/posts/design-systems',
          summary: '这是一篇关于系统设计取舍的摘要。',
          publishedAt: '2026-06-04T08:00:00.000Z',
          sourceName: '设计摘录',
        },
      ],
    })
    vi.spyOn(importClientModule, 'importReadLaterFromUrl').mockResolvedValue({
      title: '新的系统设计文章',
      desc: '这是一篇关于系统设计取舍的摘要。',
      sourceName: '设计摘录',
      markdown: '',
      requestedUrl: 'https://example.com/posts/design-systems',
      finalUrl: 'https://example.com/posts/design-systems',
      needsManualPaste: true,
    })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'RSS' }))
    await screen.findByLabelText('Feed URL')
    fireEvent.change(screen.getByLabelText('Feed URL'), { target: { value: 'https://example.com/feed.xml' } })
    fireEvent.click(screen.getByRole('button', { name: '新增 feed' }))
    expect(await screen.findByText('这篇文章暂时没自动识别出正文，可先打开原文。')).toBeTruthy()
  })
})
