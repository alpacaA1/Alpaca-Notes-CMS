import { describe, expect, it } from 'vitest'
import { serializePost } from './serialize-post'
import type { ParsedPost } from './parse-post'

describe('serializePost', () => {
  it('writes back missing published as true on save', () => {
    const output = serializePost({
      path: 'source/_posts/legacy.md',
      sha: 'sha-legacy',
      hasExplicitPublished: false,
      hasExplicitPermalink: false,
      frontmatter: {
        title: 'Legacy',
        date: '2026-03-01 10:00:00',
        desc: 'Legacy desc',
        published: true,
        pinned: true,
        categories: ['生活'],
        tags: ['观察'],
      },
      body: 'Legacy body',
    })

    expect(output).toContain('published: true')
    expect(output).toContain('pinned: true')
    expect(output).not.toContain('permalink:')
  })

  it('preserves markdown body exactly when untouched', () => {
    const post: ParsedPost = {
      path: 'source/_posts/example.md',
      sha: 'sha-1',
      hasExplicitPublished: true,
      hasExplicitPermalink: true,
      frontmatter: {
        title: 'Example',
        permalink: 'example/',
        date: '2026-04-01 20:10:00',
        desc: 'Example desc',
        published: true,
        categories: ['思考'],
        tags: ['记录'],
      },
      body: 'Line 1\n\n- item\n',
    }

    const output = serializePost(post)
    expect(output).toContain('date: 2026-04-01 20:10:00')
    expect(output.endsWith('\n\nLine 1\n\n- item\n')).toBe(true)
  })

  it('serializes an explicit content format when present', () => {
    const post: ParsedPost = {
      path: 'source/_posts/plaintext.md',
      sha: 'sha-plain',
      hasExplicitPublished: true,
      hasExplicitPermalink: false,
      frontmatter: {
        title: 'Plain text',
        format: 'plaintxt',
        date: '2026-04-01 20:10:00',
        desc: 'desc',
        published: true,
        categories: [],
        tags: [],
      },
      body: 'Body',
    }

    expect(serializePost(post)).toContain('format: plaintxt')
  })

  it('serializes diary posts with the diary marker and without permalink or categories', () => {
    const diary: ParsedPost = {
      path: 'source/diary/20260505010101.md',
      sha: '',
      hasExplicitPublished: true,
      hasExplicitPermalink: false,
      contentType: 'diary',
      frontmatter: {
        title: '五月记录',
        date: '2026-05-05 01:01:01',
        desc: '记录一下最近的状态',
        published: false,
        pinned: false,
        categories: [],
        tags: ['月初'],
        diary: true,
      },
      body: '今天先记一笔。',
    }

    const output = serializePost(diary)

    expect(output).toContain('diary: true')
    expect(output).toContain('published: false')
    expect(output).not.toContain('permalink:')
    expect(output).not.toContain('categories:')
  })

  it('serializes knowledge posts with source metadata and categories', () => {
    const knowledge: ParsedPost = {
      path: 'source/_knowledge/20260505010101.md',
      sha: '',
      hasExplicitPublished: true,
      hasExplicitPermalink: false,
      contentType: 'knowledge',
      frontmatter: {
        title: '系统复用',
        date: '2026-05-05 01:01:01',
        desc: '关于系统复用的知识点',
        published: false,
        pinned: true,
        categories: ['随机展示'],
        tags: ['复用'],
        knowledge: true,
        nav_exclude: true,
        source_type: 'read-later',
        source_path: 'source/read-later-items/example.md',
        source_title: '一篇关于系统设计的文章',
        source_url: 'https://example.com/system',
      },
      body: '## 原文摘录\n> 能力来自反复验证的抽象。',
    }

    const output = serializePost(knowledge)

    expect(output).toContain('knowledge: true')
    expect(output).toContain('nav_exclude: true')
    expect(output).toContain('source_type: read-later')
    expect(output).toContain('source_path: source/read-later-items/example.md')
    expect(output).toContain('source_title: 一篇关于系统设计的文章')
    expect(output).toContain('source_url: https://example.com/system')
    expect(output).toContain('pinned: true')
    expect(output).toContain('categories:\n  - 随机展示')
    expect(output).not.toContain('permalink:')
  })

  it('serializes topic-node knowledge metadata when present', () => {
    const topicNode: ParsedPost = {
      path: 'source/_knowledge/topic.md',
      sha: '',
      hasExplicitPublished: true,
      hasExplicitPermalink: false,
      contentType: 'knowledge',
      frontmatter: {
        title: '影响力',
        date: '2026-05-07 10:10:10',
        desc: '',
        published: false,
        pinned: false,
        categories: [],
        tags: ['读书'],
        knowledge: true,
        nav_exclude: true,
        knowledge_kind: 'topic',
        topic_type: 'book',
        node_key: 'book/影响力',
        aliases: ['《影响力》', 'Influence'],
      },
      body: '这是一个主题节点。',
    }

    const output = serializePost(topicNode)

    expect(output).toContain('knowledge_kind: topic')
    expect(output).toContain('topic_type: book')
    expect(output).toContain('node_key: book/影响力')
    expect(output).toContain('aliases:\n  - 《影响力》\n  - Influence')
  })
})
