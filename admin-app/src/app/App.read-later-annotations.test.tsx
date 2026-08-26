import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import * as postsIndexModule from './posts/index-posts'
import * as readLaterIndexModule from './read-later/index-items'
import type { ReadLaterAnnotation, ReadLaterIndexItem } from './read-later/item-types'
import * as sessionModule from './session'

const readLaterPosts: ReadLaterIndexItem[] = [
  {
    path: 'source/read-later-items/product.md',
    sha: 'sha-product',
    title: '产品研究 A',
    date: '2026-04-28 10:00:00',
    desc: '关于产品写作的一篇文章',
    published: false as const,
    hasExplicitPublished: false as const,
    categories: [],
    tags: ['产品', '写作'],
    permalink: 'read-later/product-a/',
    contentType: 'read-later' as const,
    externalUrl: 'https://example.com/product',
    sourceName: 'Product Weekly',
    readingStatus: 'reading' as const,
    cover: null,
  },
  {
    path: 'source/read-later-items/design.md',
    sha: 'sha-design',
    title: '设计研究 B',
    date: '2026-04-29 10:00:00',
    desc: '关于设计评审的一篇文章',
    published: false as const,
    hasExplicitPublished: false as const,
    categories: [],
    tags: ['设计'],
    permalink: 'read-later/design-b/',
    contentType: 'read-later' as const,
    externalUrl: 'https://example.com/design',
    sourceName: 'Design Notes',
    readingStatus: 'done' as const,
    cover: null,
  },
]

const productAnnotation: ReadLaterAnnotation = {
  id: 'annotation-product',
  sectionKey: 'articleExcerpt' as const,
  quote: '要回看的句子',
  prefix: '这是上文，',
  suffix: '这里是下文。',
  note: '写作切入点',
  createdAt: '2026-04-29T08:00:00.000Z',
  updatedAt: '2026-04-29T08:00:00.000Z',
}

const designAnnotation: ReadLaterAnnotation = {
  id: 'annotation-design',
  sectionKey: 'summary' as const,
  quote: '交互上的提醒',
  prefix: '设计师提到',
  suffix: '需要反复检查。',
  note: '交互观察',
  createdAt: '2026-04-30T08:00:00.000Z',
  updatedAt: '2026-04-30T08:00:00.000Z',
}

function createReadLaterContent(options: {
  title: string
  date: string
  sourceName: string
  externalUrl: string
  readingStatus?: 'unread' | 'reading' | 'done'
  tags: string[]
  annotations: ReadLaterAnnotation[]
}) {
  const encodedAnnotations = options.annotations.map((annotation) => encodeURIComponent(JSON.stringify(annotation)))

  return `---
title: ${options.title}
permalink: read-later/${options.title}/
layout: read-later-item
date: ${options.date}
read_later: true
nav_exclude: true
external_url: ${options.externalUrl}
source_name: ${options.sourceName}
reading_status: ${options.readingStatus || 'unread'}
reader_annotations:
${encodedAnnotations.map((annotation) => `  - ${annotation}`).join('\n')}
tags:
${options.tags.map((tag) => `  - ${tag}`).join('\n')}
desc: ${options.title} 摘要
---

## 原文摘录

${options.title} 的正文，包含${options.annotations[0]?.quote || '内容'}。

## 我的总结

${options.title} 的总结。

## 我的评论

${options.title} 的评论。`
}

describe('App read-later annotations view', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    githubClientModule.clearMarkdownFileCache()
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('aggregates annotations, supports 3-column interaction, comment save, and opening original item', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue(readLaterPosts)
    const saveMarkdownSpy = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockImplementation(async (_session, file) => ({
      path: file.path,
      sha: 'new-sha',
    }))
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockImplementation(async (_session, path) => {
      if (path === readLaterPosts[0].path) {
        return {
          path,
          sha: readLaterPosts[0].sha,
          content: createReadLaterContent({
            title: readLaterPosts[0].title,
            date: readLaterPosts[0].date,
            sourceName: readLaterPosts[0].sourceName || '',
            externalUrl: readLaterPosts[0].externalUrl || '',
            readingStatus: readLaterPosts[0].readingStatus,
            tags: readLaterPosts[0].tags,
            annotations: [productAnnotation],
          }),
        }
      }

      return {
        path,
        sha: readLaterPosts[1].sha,
        content: createReadLaterContent({
          title: readLaterPosts[1].title,
          date: readLaterPosts[1].date,
          sourceName: readLaterPosts[1].sourceName || '',
          externalUrl: readLaterPosts[1].externalUrl || '',
          readingStatus: readLaterPosts[1].readingStatus,
          tags: readLaterPosts[1].tags,
          annotations: [designAnnotation],
        }),
      }
    })

    render(<App />)

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    await waitFor(() => {
      expect(screen.getByText('产品研究 A')).toBeTruthy()
      expect(screen.getByText('设计研究 B')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: '批注' }))

    expect(await screen.findByRole('heading', { name: '批注管理' })).toBeTruthy()
    expect(await screen.findByText('2 条批注 · 来自 2 篇文章')).toBeTruthy()

    // 3 Columns verification
    const sourceRail = screen.getByLabelText('来源文章列表')
    const listSection = screen.getByLabelText('批注列表区')
    const detailSection = screen.getByLabelText('批注详情与评论')

    expect(sourceRail).toBeTruthy()
    expect(listSection).toBeTruthy()
    expect(detailSection).toBeTruthy()

    expect(within(sourceRail).getByText('产品研究 A')).toBeTruthy()
    expect(within(sourceRail).getByText('设计研究 B')).toBeTruthy()

    expect(within(listSection).getByText('要回看的句子')).toBeTruthy()
    expect(within(listSection).getByText('交互上的提醒')).toBeTruthy()

    // Right detail pane contains first annotation
    expect(within(detailSection).getByText('完整摘录')).toBeTruthy()
    expect(within(detailSection).getByText('我的评论')).toBeTruthy()
    expect(within(detailSection).getByText('上下文')).toBeTruthy()

    // Test editing and saving comment directly in right pane
    const textarea = within(detailSection).getByPlaceholderText('写下你的想法...')
    fireEvent.change(textarea, { target: { value: '更新后的深入评论' } })

    const saveCommentBtn = within(detailSection).getByRole('button', { name: '保存评论' })
    fireEvent.click(saveCommentBtn)

    await waitFor(() => {
      expect(saveMarkdownSpy).toHaveBeenCalled()
    })

    // Test filtering by source article
    fireEvent.click(within(sourceRail).getByRole('button', { name: /设计研究 B/ }))
    expect(within(listSection).queryByText('要回看的句子')).toBeNull()
    expect(within(listSection).getByText('交互上的提醒')).toBeTruthy()

    // Test Open Original Read Later Item
    const openOriginalBtn = within(detailSection).getByRole('button', { name: /打开原文/ })
    fireEvent.click(openOriginalBtn)

    // Should navigate to reader / editor view
    expect(await screen.findByRole('heading', { name: '原文摘录' })).toBeTruthy()
  })
})
