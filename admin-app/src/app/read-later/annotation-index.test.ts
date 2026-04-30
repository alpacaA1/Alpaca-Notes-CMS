import { afterEach, describe, expect, it, vi } from 'vitest'
import * as githubClientModule from '../github-client'
import type { ReadLaterAnnotation } from './item-types'
import { buildReadLaterAnnotationIndex } from './annotation-index'

const annotationA: ReadLaterAnnotation = {
  id: 'annotation-a',
  sectionKey: 'articleExcerpt' as const,
  quote: '第一条摘录',
  prefix: '',
  suffix: '',
  note: '第一条评论',
  createdAt: '2026-04-28T08:00:00.000Z',
  updatedAt: '2026-04-28T08:00:00.000Z',
}

const annotationB: ReadLaterAnnotation = {
  id: 'annotation-b',
  sectionKey: 'summary' as const,
  quote: '第二条摘录',
  prefix: '',
  suffix: '',
  note: '第二条评论',
  createdAt: '2026-04-29T08:00:00.000Z',
  updatedAt: '2026-04-30T08:30:00.000Z',
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

${options.title} 正文

## 我的总结

${options.title} 总结

## 我的评论

${options.title} 评论`
}

describe('read-later annotation index', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    githubClientModule.clearMarkdownFileCache()
  })

  it('builds annotation cards from existing read-later files and sorts by latest update', async () => {
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockImplementation(async (_session, path) => {
      if (path === 'source/read-later-items/a.md') {
        return {
          path,
          sha: 'sha-a',
          content: createReadLaterContent({
            title: '第一篇待读',
            date: '2026-04-28 10:00:00',
            sourceName: '站点 A',
            externalUrl: 'https://example.com/a',
            readingStatus: 'reading',
            tags: ['写作'],
            annotations: [annotationA],
          }),
        }
      }

      return {
        path,
        sha: 'sha-b',
        content: createReadLaterContent({
          title: '第二篇待读',
          date: '2026-04-29 10:00:00',
          sourceName: '站点 B',
          externalUrl: 'https://example.com/b',
          readingStatus: 'done',
          tags: ['设计'],
          annotations: [annotationB],
        }),
      }
    })

    const result = await buildReadLaterAnnotationIndex(
      { token: 'persisted-token' },
      [
        { path: 'source/read-later-items/a.md', sha: 'sha-a' },
        { path: 'source/read-later-items/b.md', sha: 'sha-b' },
      ],
    )

    expect(result).toHaveLength(2)
    expect(result.map((item) => item.annotationId)).toEqual(['annotation-b', 'annotation-a'])
    expect(result[0]).toMatchObject({
      postTitle: '第二篇待读',
      sectionLabel: '我的总结',
      sourceName: '站点 B',
      readingStatus: 'done',
      tags: ['设计'],
      note: '第二条评论',
    })
    expect(result[1].searchText).toContain('第一条摘录')
    expect(result[1].searchText).toContain('站点 a')
    expect(result[1].searchText).toContain('在读')
  })
})
