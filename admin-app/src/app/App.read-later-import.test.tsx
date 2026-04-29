import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import * as postsIndexModule from './posts/index-posts'
import * as readLaterIndexModule from './read-later/index-items'
import * as importClientModule from './read-later/import-client'
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
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    await waitFor(() => {
      expect(screen.getByText('Import me later')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /import me later/i }))
    expect(await screen.findByRole('link', { name: '原文摘录' })).toBeTruthy()
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '从链接导入正文' }))

    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledWith({ token: 'persisted-token' }, 'https://example.com/article')
    })

    expect(confirmSpy).toHaveBeenCalledWith('当前正文将被导入内容覆盖，确认继续吗？')
    expect(await screen.findByRole('heading', { name: '导入正文' })).toBeTruthy()
    expect((screen.getByLabelText('标题') as HTMLInputElement).value).toBe('导入后的标题')
    expect((screen.getByLabelText('摘要') as HTMLTextAreaElement).value).toBe('导入后的摘要')
    expect((screen.getByLabelText('来源') as HTMLInputElement).value).toBe('导入来源')
    expect(screen.getByRole('button', { name: '保存' })).toBeTruthy()
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
    })
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

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

    expect(confirmSpy).toHaveBeenCalledWith('当前正文和高亮批注将被导入内容覆盖，确认继续吗？')
    await waitFor(() => {
      expect(importSpy).toHaveBeenCalledWith({ token: 'persisted-token' }, 'https://example.com/article')
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
})
