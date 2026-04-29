import { describe, expect, it } from 'vitest'
import { getEditableReadLaterSections, parseReadLaterItem, parseReadLaterSections } from './parse-item'

const annotation = {
  id: 'annotation-1',
  sectionKey: 'articleExcerpt',
  quote: '摘录第一段',
  prefix: '',
  suffix: '总结第二段',
  note: '一条批注',
  createdAt: '2026-04-29T08:00:00.000Z',
  updatedAt: '2026-04-29T08:00:00.000Z',
}

const readLaterContent = `---
title: Read later article
permalink: read-later/read-later-article/
layout: read-later-item
cover: https://example.com/cover.png
date: 2026-04-03 06:07:08
read_later: true
nav_exclude: true
pinned: true
external_url: https://example.com/article
source_name: Example Source
reading_status: done
tags:
  - 设计
  - 系统
desc: 一篇值得回看的文章
---

## 原文摘录
摘录第一段

## 我的总结
总结第二段

## 我的评论
评论第三段`

describe('parse read-later item', () => {
  it('parses structured read-later frontmatter and body', () => {
    const item = parseReadLaterItem({
      path: 'source/read-later-items/read-later-article.md',
      sha: 'sha-read-later',
      content: readLaterContent,
    })

    expect(item.contentType).toBe('read-later')
    expect(item.frontmatter.title).toBe('Read later article')
    expect(item.frontmatter.permalink).toBe('read-later/read-later-article/')
    expect(item.frontmatter.external_url).toBe('https://example.com/article')
    expect(item.frontmatter.source_name).toBe('Example Source')
    expect(item.frontmatter.reading_status).toBe('done')
    expect(item.frontmatter.pinned).toBe(true)
    expect(item.frontmatter.tags).toEqual(['设计', '系统'])
    expect(item.frontmatter.categories).toEqual([])
    expect(item.frontmatter.cover).toBe('https://example.com/cover.png')
    expect(item.body).toContain('## 原文摘录')
  })

  it('extracts the three read-later body sections', () => {
    expect(
      parseReadLaterSections(`## 原文摘录\n摘录\n\n## 我的总结\n总结\n\n## 我的评论\n评论`),
    ).toEqual({
      articleExcerpt: '摘录',
      summary: '总结',
      commentary: '评论',
    })
  })

  it('treats plain markdown as the editable excerpt section', () => {
    expect(getEditableReadLaterSections('# 原始正文\n\n第二段')).toEqual({
      articleExcerpt: '# 原始正文\n\n第二段',
      summary: '',
      commentary: '',
    })
  })

  it('falls back to unread for invalid reading_status values', () => {
    const item = parseReadLaterItem({
      path: 'source/read-later-items/invalid.md',
      sha: 'sha-invalid',
      content: readLaterContent.replace('reading_status: done', 'reading_status: later'),
    })

    expect(item.frontmatter.reading_status).toBe('unread')
  })

  it('decodes reader annotations from frontmatter', () => {
    const encodedAnnotation = encodeURIComponent(JSON.stringify(annotation))
    const item = parseReadLaterItem({
      path: 'source/read-later-items/annotated.md',
      sha: 'sha-annotated',
      content: readLaterContent.replace(
        'tags:\n  - 设计\n  - 系统',
        `reader_annotations:\n  - ${encodedAnnotation}\ntags:\n  - 设计\n  - 系统`,
      ),
    })

    expect(item.annotations).toEqual([annotation])
    expect(item.frontmatter.reader_annotations).toEqual([encodedAnnotation])
  })
})
