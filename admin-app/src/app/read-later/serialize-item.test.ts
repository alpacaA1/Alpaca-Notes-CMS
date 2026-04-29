import { describe, expect, it } from 'vitest'
import { createNewReadLaterItem } from './new-item'
import { serializeReadLaterItem } from './serialize-item'

const annotation = {
  id: 'annotation-1',
  sectionKey: 'articleExcerpt' as const,
  quote: '高亮内容',
  prefix: '前文',
  suffix: '后文',
  note: '一条批注',
  createdAt: '2026-04-29T08:00:00.000Z',
  updatedAt: '2026-04-29T08:00:00.000Z',
}

describe('serialize read-later item', () => {
  it('serializes required frontmatter fields and body', () => {
    const item = createNewReadLaterItem(new Date(2026, 3, 3, 6, 7, 8))
    item.frontmatter.title = 'Read later article'
    item.frontmatter.desc = '值得回看的文章'
    item.frontmatter.tags = ['设计', '系统']
    item.frontmatter.external_url = 'https://example.com/article'
    item.frontmatter.source_name = 'Example Source'
    item.frontmatter.reading_status = 'reading'
    item.frontmatter.cover = 'https://example.com/cover.png'
    item.body = '## 原文摘录\n摘录\n\n## 我的总结\n总结\n\n## 我的评论\n评论'

    expect(serializeReadLaterItem(item)).toBe(`---
title: Read later article
permalink: read-later/20260403060708/
layout: read-later-item
cover: https://example.com/cover.png
date: 2026-04-03 06:07:08
read_later: true
nav_exclude: true
external_url: https://example.com/article
source_name: Example Source
reading_status: reading
tags:
  - 设计
  - 系统
desc: 值得回看的文章
---

## 原文摘录
摘录

## 我的总结
总结

## 我的评论
评论`)
  })

  it('serializes reader annotations into frontmatter', () => {
    const item = createNewReadLaterItem(new Date(2026, 3, 3, 6, 7, 8))
    item.annotations = [annotation]

    expect(serializeReadLaterItem(item)).toContain(`reader_annotations:\n  - ${encodeURIComponent(JSON.stringify(annotation))}`)
  })
})
