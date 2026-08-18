import { describe, expect, it } from 'vitest'
import { createNewPitch, createPostFromPitch } from './new-item'
import type { ParsedPost } from '../posts/parse-post'

describe('pitches/new-item', () => {
  it('creates a new pitch document with correct defaults', () => {
    const date = new Date(2026, 7, 18, 11, 30, 0)
    const pitch = createNewPitch(date)

    expect(pitch.path).toBe('source/_pitches/20260818113000.md')
    expect(pitch.contentType).toBe('pitch')
    expect(pitch.frontmatter.pitch).toBe(true)
    expect(pitch.frontmatter.pitch_status).toBe('open')
    expect(pitch.frontmatter.published).toBe(false)
    expect(pitch.frontmatter.nav_exclude).toBe(true)
    expect(pitch.body).toBe('')
  })

  it('creates an article post from a pitch', () => {
    const date = new Date(2026, 7, 18, 12, 0, 0)
    const pitch: ParsedPost = {
      path: 'source/_pitches/20260818113000.md',
      sha: 'sha-pitch',
      contentType: 'pitch',
      hasExplicitPublished: true,
      hasExplicitPermalink: false,
      frontmatter: {
        title: '为什么我们总是高估一年能做的事',
        date: '2026-08-18 11:30:00',
        desc: '',
        published: false,
        pinned: false,
        categories: [],
        tags: ['思考', '认知'],
        pitch: true,
        pitch_status: 'collecting',
        pitch_inspiration: '读书笔记',
      },
      body: '核心观点是复利的力量。',
    }

    const post = createPostFromPitch(pitch, [], date)

    expect(post.contentType).toBeUndefined()
    expect(post.frontmatter.title).toBe('为什么我们总是高估一年能做的事')
    expect(post.frontmatter.tags).toEqual(['思考', '认知'])
    expect(post.frontmatter.permalink).toBe('1/')
    expect(post.body).toContain('<!-- 选题核心想法 -->')
    expect(post.body).toContain('核心观点是复利的力量。')
    expect(post.body).toContain('---')
  })

  it('handles empty pitch body when converting to post', () => {
    const pitch = createNewPitch()
    pitch.frontmatter.title = '测试标题'
    const post = createPostFromPitch(pitch, [])

    expect(post.frontmatter.title).toBe('测试标题')
    expect(post.body).toBe('')
  })
})
