import { describe, expect, it } from 'vitest'
import { createNewReadLaterItem, createReadLaterBody } from './new-item'

describe('read-later new item helpers', () => {
  const fixedDate = new Date(2026, 3, 3, 6, 7, 8)

  it('generates timestamp filename and default permalink', () => {
    const item = createNewReadLaterItem(fixedDate)

    expect(item.path).toBe('source/read-later-items/20260403060708.md')
    expect(item.frontmatter.permalink).toBe('read-later/20260403060708/')
    expect(item.contentType).toBe('read-later')
  })

  it('initializes default frontmatter for read-later items', () => {
    const item = createNewReadLaterItem(fixedDate)

    expect(item.frontmatter).toEqual({
      title: '',
      date: '2026-04-03 06:07:08',
      desc: '',
      categories: [],
      tags: [],
      permalink: 'read-later/20260403060708/',
      external_url: '',
      source_name: '',
      reading_status: 'unread',
      read_later: true,
      nav_exclude: true,
      layout: 'read-later-item',
    })
  })

  it('creates structured body sections', () => {
    expect(
      createReadLaterBody({
        articleExcerpt: '摘录',
        summary: '总结',
        commentary: '评论',
      }),
    ).toBe(['## 原文摘录', '摘录', '', '## 我的总结', '总结', '', '## 我的评论', '评论'].join('\n'))
  })
})
