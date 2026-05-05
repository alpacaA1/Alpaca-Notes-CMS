import { describe, expect, it } from 'vitest'
import { createKnowledgeBody, createKnowledgeFromSelection, createNewKnowledgeItem } from './new-item'
import type { ParsedPost } from '../posts/parse-post'

function createSourcePost(): ParsedPost {
  return {
    path: 'source/_posts/source.md',
    sha: 'sha-source',
    hasExplicitPublished: true,
    hasExplicitPermalink: true,
    contentType: 'post',
    frontmatter: {
      title: '来源文章',
      date: '2026-05-05 10:00:00',
      desc: '来源摘要',
      published: true,
      pinned: false,
      categories: ['思考'],
      tags: ['产品', '系统'],
      permalink: 'source/',
    },
    body: 'source body',
  }
}

describe('knowledge item helpers', () => {
  const fixedDate = new Date(2026, 4, 5, 9, 8, 7)

  it('creates knowledge items in the dedicated internal directory', () => {
    const item = createNewKnowledgeItem(fixedDate)

    expect(item.path).toBe('source/_knowledge/20260505090807.md')
    expect(item.contentType).toBe('knowledge')
    expect(item.frontmatter.knowledge).toBe(true)
    expect(item.frontmatter.nav_exclude).toBe(true)
    expect(item.frontmatter.published).toBe(false)
  })

  it('renders selected quote into a readable body structure', () => {
    expect(createKnowledgeBody({ quote: '第一行\n第二行' })).toContain('> 第一行\n> 第二行')
    expect(createKnowledgeBody({ note: '我的理解' })).toContain('## 我的理解\n我的理解')
  })

  it('creates a knowledge draft from a source selection and carries source metadata', () => {
    const draft = createKnowledgeFromSelection(
      createSourcePost(),
      '系统能力不是堆功能，而是稳定地复用关键决策。',
      fixedDate,
    )

    expect(draft.frontmatter.title).toBe('系统能力不是堆功能，而是稳定地复用关键决策。')
    expect(draft.frontmatter.desc).toBe('系统能力不是堆功能，而是稳定地复用关键决策。')
    expect(draft.frontmatter.tags).toEqual(['产品', '系统'])
    expect(draft.frontmatter.source_type).toBe('post')
    expect(draft.frontmatter.source_path).toBe('source/_posts/source.md')
    expect(draft.frontmatter.source_title).toBe('来源文章')
    expect(draft.body).toContain('> 系统能力不是堆功能，而是稳定地复用关键决策。')
  })
})
