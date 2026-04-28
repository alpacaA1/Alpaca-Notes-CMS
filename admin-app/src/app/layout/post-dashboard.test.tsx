import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PostDashboard from './post-dashboard'
import type { PostIndexItem } from '../posts/post-types'

const posts: PostIndexItem[] = [
  {
    path: 'source/_posts/hello-world.md',
    sha: 'sha-1',
    title: '为什么先把博客搭起来',
    date: '2026-04-01 20:10:00',
    desc: 'desc',
    published: true,
    pinned: false,
    hasExplicitPublished: true,
    categories: ['思考'],
    tags: ['记录'],
    permalink: 'why-start-this-blog/',
  },
]

const readLaterPosts: PostIndexItem[] = [
  {
    path: 'source/read-later-items/saved-article.md',
    sha: 'sha-rl-1',
    title: '值得回看的设计文章',
    date: '2026-04-02 08:30:00',
    desc: '一篇关于系统设计取舍的长文。',
    published: false,
    hasExplicitPublished: false,
    categories: [],
    tags: ['设计'],
    permalink: 'read-later/saved-article/',
    contentType: 'read-later',
    externalUrl: 'https://example.com/design',
    sourceName: 'Example Design',
    readingStatus: 'reading',
    cover: null,
  },
]

describe('post dashboard', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('renders dashboard quick actions and does not open the post when pin or delete is clicked', () => {
    window.localStorage.setItem('alpaca-dashboard-view-mode', 'list')
    const onOpenPost = vi.fn()
    const onDeletePost = vi.fn()
    const onTogglePinned = vi.fn()

    render(
      <PostDashboard
        posts={posts}
        search=""
        isIndexing={false}
        contentType="post"
        onOpenPost={onOpenPost}
        onNewPost={vi.fn()}
        onDeletePost={onDeletePost}
        onTogglePinned={onTogglePinned}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '置顶文章' }))
    expect(onTogglePinned).toHaveBeenCalledWith(posts[0])
    expect(onOpenPost).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '删除文章' }))
    expect(onDeletePost).toHaveBeenCalledWith(posts[0])
    expect(onOpenPost).not.toHaveBeenCalled()
  })

  it('does not render pin actions for read-later items', () => {
    window.localStorage.setItem('alpaca-dashboard-view-mode', 'list')

    render(
      <PostDashboard
        posts={readLaterPosts}
        search=""
        isIndexing={false}
        contentType="read-later"
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '置顶文章' })).toBeNull()
    expect(screen.queryByRole('button', { name: '删除文章' })).toBeNull()
  })
})
