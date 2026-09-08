import { describe, expect, it } from 'vitest'
import {
  cleanHeadingTitle,
  extractMarkdownHeadings,
  getEditableReadLaterSections,
  parseReadLaterItem,
  parseReadLaterSections,
} from './parse-item'

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

  it('preserves a read-later content format from frontmatter', () => {
    const item = parseReadLaterItem({
      path: 'source/read-later-items/plaintext.md',
      sha: 'sha-plain',
      content: readLaterContent.replace('permalink: read-later/read-later-article/', 'format: plaintxt\npermalink: read-later/read-later-article/'),
    })

    expect(item.frontmatter.format).toBe('plaintxt')
  })

  it('parses quoted frontmatter scalars saved after import', () => {
    const item = parseReadLaterItem({
      path: 'source/read-later-items/quoted.md',
      sha: 'sha-quoted',
      content: readLaterContent
        .replace('title: Read later article', 'title: "AI Agent: 从入门到落地"')
        .replace('source_name: Example Source', 'source_name: "产品经理: 方法论"')
        .replace('desc: 一篇值得回看的文章', 'desc: "第一行 第二行 # 不是注释"'),
    })

    expect(item.frontmatter.title).toBe('AI Agent: 从入门到落地')
    expect(item.frontmatter.source_name).toBe('产品经理: 方法论')
    expect(item.frontmatter.desc).toBe('第一行 第二行 # 不是注释')
  })

  it('cleans empty anchor links and headerlinks from heading titles and slugs', () => {
    const raw = '[](https://a-wing.top/self/2026/08/31/on-structural-heartbreak#%E7%BB%93%E6%9E%84%E6%80%A7%E5%A4%B1%E6%81%8B "结构性失恋")结构性失恋'
    expect(cleanHeadingTitle(raw)).toBe('结构性失恋')

    const markdown = [
      '## [](https://a-wing.top/self/2026/08/31/on-structural-heartbreak#%E6%8E%A8%E8%AE%BA%E5%9F%BA%E7%A1%80 "推论基础")推论基础',
      '## [](https://a-wing.top/self/2026/08/31/on-structural-heartbreak#%E5%A6%82%E4%BD%95%E9%9D%A2%E5%AF%B9%E6%82%B2%E4%BC%A4)如何面对悲伤',
      '### [#](https://a-wing.top/post#anchor) 权力不对等',
      '### <a class="headerlink" href="#hope"></a>「希望你变得更好」',
      '### [](https://a-wing.top/post#heartbreak "结构性失恋")结构性失恋',
    ].join('\n')

    const headings = extractMarkdownHeadings(markdown, 'test-prefix')
    expect(headings).toEqual([
      { id: 'test-prefix-推论基础', label: '推论基础', level: 2, kind: 'heading' },
      { id: 'test-prefix-如何面对悲伤', label: '如何面对悲伤', level: 2, kind: 'heading' },
      { id: 'test-prefix-权力不对等', label: '权力不对等', level: 3, kind: 'heading' },
      { id: 'test-prefix-希望你变得更好', label: '「希望你变得更好」', level: 3, kind: 'heading' },
      { id: 'test-prefix-结构性失恋', label: '结构性失恋', level: 3, kind: 'heading' },
    ])
  })
})
