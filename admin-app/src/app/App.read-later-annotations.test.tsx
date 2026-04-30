import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import * as postsIndexModule from './posts/index-posts'
import * as readLaterIndexModule from './read-later/index-items'
import type { ReadLaterAnnotation } from './read-later/item-types'
import * as sessionModule from './session'

const readLaterPosts = [
  {
    path: 'source/read-later-items/product.md',
    sha: 'sha-product',
    title: '产品研究 A',
    date: '2026-04-28 10:00:00',
    desc: '关于产品写作的一篇文章',
    published: false,
    hasExplicitPublished: false,
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
    published: false,
    hasExplicitPublished: false,
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
  prefix: '',
  suffix: '',
  note: '写作切入点',
  createdAt: '2026-04-29T08:00:00.000Z',
  updatedAt: '2026-04-29T08:00:00.000Z',
}

const designAnnotation: ReadLaterAnnotation = {
  id: 'annotation-design',
  sectionKey: 'summary' as const,
  quote: '交互上的提醒',
  prefix: '',
  suffix: '',
  note: '交互观察',
  createdAt: '2026-04-30T08:00:00.000Z',
  updatedAt: '2026-04-30T08:00:00.000Z',
}

function createReadLaterContent(options: {
  title: string
  date: string
  sourceName: string
  externalUrl: string
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
reading_status: unread
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

  it('aggregates annotations, supports filters and opens the original read-later item', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsIndexModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue(readLaterPosts)
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

    expect(await screen.findByText('先整理素材，再决定写什么。')).toBeTruthy()
    expect(screen.getByText('要回看的句子')).toBeTruthy()
    expect(screen.getByText('交互上的提醒')).toBeTruthy()
    expect(screen.getByText('写作切入点')).toBeTruthy()
    expect(screen.getByText('交互观察')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: '来源文章' }), {
      target: { value: readLaterPosts[0].path },
    })
    expect(screen.getByText('要回看的句子')).toBeTruthy()
    expect(screen.queryByText('交互上的提醒')).toBeNull()

    fireEvent.change(screen.getByRole('combobox', { name: '来源文章' }), {
      target: { value: '__all_sources__' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '标签' }), {
      target: { value: '设计' },
    })
    expect(screen.queryByText('要回看的句子')).toBeNull()
    expect(screen.getByText('交互上的提醒')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: '标签' }), {
      target: { value: '__all_tags__' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: '搜索' }), {
      target: { value: '写作切入点' },
    })
    expect(screen.getByText('要回看的句子')).toBeTruthy()
    expect(screen.queryByText('交互上的提醒')).toBeNull()

    fireEvent.change(screen.getByRole('textbox', { name: '搜索' }), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: '来源文章' }), {
      target: { value: readLaterPosts[0].path },
    })
    fireEvent.click(screen.getByRole('button', { name: '跳回原文' }))

    expect(await screen.findByRole('button', { name: '要回看的句子' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '原文摘录' })).toBeTruthy()
  })
})
