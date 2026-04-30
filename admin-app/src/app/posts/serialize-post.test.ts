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
})
