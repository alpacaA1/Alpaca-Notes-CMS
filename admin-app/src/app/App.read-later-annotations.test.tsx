import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as githubClientModule from './github-client'
import ReadLaterAnnotationsView from './layout/read-later-annotations-view'
import * as postsIndexModule from './posts/index-posts'
import type { ReadLaterAnnotationIndexItem } from './read-later/annotation-index'
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

function createAnnotationIndexItem(overrides: Partial<ReadLaterAnnotationIndexItem> = {}): ReadLaterAnnotationIndexItem {
  return {
    id: overrides.id || 'annotation-id',
    annotationId: overrides.annotationId || 'annotation-id',
    postPath: overrides.postPath || 'source/read-later-items/default.md',
    postTitle: overrides.postTitle || '默认文章',
    postDate: overrides.postDate || '2026-05-01 10:00:00',
    sourceName: overrides.sourceName ?? null,
    externalUrl: overrides.externalUrl ?? null,
    tags: overrides.tags || ['默认标签'],
    readingStatus: overrides.readingStatus || 'unread',
    sectionKey: overrides.sectionKey || 'articleExcerpt',
    sectionLabel: overrides.sectionLabel || '原文摘录',
    quote: overrides.quote || '默认摘录',
    prefix: overrides.prefix || '',
    suffix: overrides.suffix || '',
    note: overrides.note || '默认评论',
    createdAt: overrides.createdAt || '2026-05-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-05-01T10:00:00.000Z',
    searchText: overrides.searchText || '默认文章 默认摘录 默认评论',
  }
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
    expect(await screen.findByText('当前结果 2 条')).toBeTruthy()
    expect(screen.getByText('要回看的句子')).toBeTruthy()
    expect(screen.getByText('交互上的提醒')).toBeTruthy()
    expect(screen.getByText('写作切入点')).toBeTruthy()
    expect(screen.getByText('交互观察')).toBeTruthy()
    expect(screen.queryByText('我的评论')).toBeNull()
    expect(screen.queryByText('跳回原文')).toBeNull()
    expect(screen.getByText('在读')).toBeTruthy()
    expect(screen.getByText('已读')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '排序规则' })).toBeTruthy()
    expect(screen.queryByText('Product Weekly')).toBeNull()
    expect(screen.queryByText('Design Notes')).toBeNull()
    expect(screen.getByRole('button', { name: '打开原文：产品研究 A' })).toBeTruthy()

    fireEvent.click(screen.getByText('要回看的句子'))

    const detailPanel = screen.getByLabelText('批注详情')
    expect(within(detailPanel).getByRole('button', { name: '打开原文' })).toBeTruthy()
    expect(within(detailPanel).getByText('完整摘录')).toBeTruthy()
    expect(within(detailPanel).getByText('完整评论')).toBeTruthy()
    expect(within(detailPanel).getByText('来源文章')).toBeTruthy()
    expect(within(detailPanel).getByText('上下文片段')).toBeTruthy()
    expect(within(detailPanel).getByText('Product Weekly')).toBeTruthy()
    expect(
      within(detailPanel).getByText((_, element) => element?.textContent === '这是上文，要回看的句子这里是下文。'),
    ).toBeTruthy()

    const articleRail = screen.getByLabelText('批注文章列表')
    fireEvent.click(within(articleRail).getByRole('button', { name: /设计研究 B/ }))
    expect(screen.queryByText('要回看的句子')).toBeNull()
    expect(screen.getByText('交互上的提醒')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '收起文章栏' }))
    expect(screen.getByRole('button', { name: '展开文章栏' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '展开文章栏' }))
    expect(screen.getByRole('button', { name: '收起文章栏' })).toBeTruthy()

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

    fireEvent.click(screen.getByRole('button', { name: '清空筛选' }))
    await waitFor(() => {
      expect((screen.getByRole('textbox', { name: '搜索' }) as HTMLInputElement).value).toBe('')
      expect(screen.getByText('交互上的提醒')).toBeTruthy()
    })

    fireEvent.change(screen.getByRole('combobox', { name: '排序规则' }), {
      target: { value: 'source-asc' },
    })
    const sortedCards = screen.getAllByRole('article')
    expect(within(sortedCards[0]).getByText('产品研究 A')).toBeTruthy()
    expect(within(sortedCards[1]).getByText('设计研究 B')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox', { name: '来源文章' }), {
      target: { value: readLaterPosts[0].path },
    })
    fireEvent.click(screen.getByText('要回看的句子'))
    fireEvent.click(within(screen.getByLabelText('批注详情')).getByRole('button', { name: '打开原文' }))

    expect(await screen.findByRole('button', { name: '要回看的句子' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '原文摘录' })).toBeTruthy()
  })

  it('caps the annotations board at four columns', () => {
    const annotations = Array.from({ length: 5 }, (_, index) =>
      createAnnotationIndexItem({
        id: `annotation-${index + 1}`,
        annotationId: `annotation-${index + 1}`,
        postPath: `source/read-later-items/item-${index + 1}.md`,
        postTitle: `文章 ${index + 1}`,
        quote: `摘录 ${index + 1}`,
        note: `评论 ${index + 1}`,
        searchText: `文章 ${index + 1} 摘录 ${index + 1} 评论 ${index + 1}`,
      }),
    )

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    const annotationList = screen.getByLabelText('批注列表') as HTMLDivElement
    expect(annotationList.style.gridTemplateColumns).toBe('repeat(4, var(--annotation-card-width))')
    expect(annotationList.style.width).toBe('calc(4 * var(--annotation-card-width) + 3 * var(--annotation-grid-gap))')
  })
})
