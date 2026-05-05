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
    cover: null,
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

const knowledgePosts: PostIndexItem[] = [
  {
    path: 'source/_knowledge/knowledge-1.md',
    sha: 'sha-k-1',
    title: '系统复用',
    date: '2026-05-05 09:30:00',
    desc: '关于系统复用的知识点。',
    published: false,
    hasExplicitPublished: true,
    categories: [],
    tags: ['复用'],
    permalink: null,
    cover: null,
    contentType: 'knowledge',
    sourceType: 'read-later',
    sourceTitle: '一篇关于系统设计的文章',
    sourcePath: 'source/read-later-items/example.md',
    sourceUrl: 'https://example.com/system',
  },
  {
    path: 'source/_knowledge/knowledge-2.md',
    sha: 'sha-k-2',
    title: '抽象边界',
    date: '2026-05-04 09:30:00',
    desc: '关于抽象边界的知识点。',
    published: false,
    hasExplicitPublished: true,
    categories: [],
    tags: ['抽象'],
    permalink: null,
    cover: null,
    contentType: 'knowledge',
    sourceType: 'post',
    sourceTitle: '写页面时我在意什么',
    sourcePath: 'source/_posts/example.md',
    sourceUrl: null,
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

  it('renders pin and delete actions for read-later items', () => {
    window.localStorage.setItem('alpaca-dashboard-view-mode', 'list')
    const onDeletePost = vi.fn()
    const onTogglePinned = vi.fn()

    render(
      <PostDashboard
        posts={readLaterPosts}
        search=""
        isIndexing={false}
        contentType="read-later"
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={onDeletePost}
        onTogglePinned={onTogglePinned}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '置顶待读' }))
    expect(onTogglePinned).toHaveBeenCalledWith(readLaterPosts[0])

    fireEvent.click(screen.getByRole('button', { name: '删除待读条目' }))
    expect(onDeletePost).toHaveBeenCalledWith(readLaterPosts[0])
  })

  it('renders keyboard hints in the stats row and highlights pinned posts in list view', () => {
    window.localStorage.setItem('alpaca-dashboard-view-mode', 'list')
    const pinnedPost = { ...posts[0], path: 'source/_posts/pinned.md', pinned: true, title: '置顶文章' }
    const { container } = render(
      <PostDashboard
        posts={[pinnedPost]}
        search=""
        isIndexing={false}
        contentType="post"
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    )

    const kbdHints = screen.getByLabelText('快捷键')
    expect(kbdHints.closest('.post-dashboard__stats-bar')).toBeTruthy()

    const pinnedRow = container.querySelector('.post-dashboard__list-row--pinned')
    expect(pinnedRow).toBeTruthy()
    expect(pinnedRow?.querySelector('.post-dashboard__pin-mark')?.textContent).toBe('置顶')
  })

  it('renders knowledge as cards only and exposes the random-display category', () => {
    window.localStorage.setItem('alpaca-dashboard-view-mode', 'list')
    render(
      <PostDashboard
        posts={knowledgePosts}
        search=""
        isIndexing={false}
        contentType="knowledge"
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: '+ 新建知识点' })).toBeTruthy()
    expect(screen.queryByLabelText('今日知识点')).toBeNull()
    expect(screen.queryByRole('button', { name: '网格视图' })).toBeNull()
    expect(screen.queryByRole('button', { name: '列表视图' })).toBeNull()
    expect(screen.getByRole('option', { name: '随机展示' })).toBeTruthy()
    expect(screen.getByText('关于系统复用的知识点。')).toBeTruthy()
    expect(screen.getByText('2026-05-05')).toBeTruthy()
    expect(screen.queryByText('系统复用')).toBeNull()
    expect(screen.queryByText('一篇关于系统设计的文章')).toBeNull()
    expect(screen.getAllByRole('button', { name: '删除知识点' })).toHaveLength(2)
  })

  it('does not open the knowledge card when the delete icon is clicked', () => {
    window.localStorage.setItem('alpaca-dashboard-view-mode', 'list')
    const onOpenPost = vi.fn()
    const onDeletePost = vi.fn()

    render(
      <PostDashboard
        posts={knowledgePosts}
        search=""
        isIndexing={false}
        contentType="knowledge"
        onOpenPost={onOpenPost}
        onNewPost={vi.fn()}
        onDeletePost={onDeletePost}
        onTogglePinned={vi.fn()}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: '删除知识点' })[0])

    expect(onDeletePost).toHaveBeenCalledWith(knowledgePosts[0])
    expect(onOpenPost).not.toHaveBeenCalled()
  })
})
