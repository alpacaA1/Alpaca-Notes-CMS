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

const diaryPosts: PostIndexItem[] = [
  {
    path: 'source/diary/20260505010101.md',
    sha: 'sha-diary-1',
    title: '五月第一则日记',
    date: '2026-05-05 01:01:01',
    desc: '写完四月月报',
    published: false,
    hasExplicitPublished: true,
    categories: [],
    tags: ['复盘'],
    permalink: null,
    cover: null,
    contentType: 'diary',
  },
  {
    path: 'source/diary/20260430120000.md',
    sha: 'sha-diary-2',
    title: '四月最后一则日记',
    date: '2026-04-30 12:00:00',
    desc: '继续开发后台',
    published: false,
    hasExplicitPublished: true,
    categories: [],
    tags: ['开发'],
    permalink: null,
    cover: null,
    contentType: 'diary',
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

  it('preserves paragraph and list structure in knowledge cards', () => {
    window.localStorage.setItem('alpaca-dashboard-view-mode', 'list')

    render(
      <PostDashboard
        posts={[
          {
            ...knowledgePosts[0],
            desc: '先判断风险和后悔成本。\n\n1. 能不能承受失败\n2. 会不会留下遗憾\n\n答案清楚后再执行。',
          },
        ]}
        search=""
        isIndexing={false}
        contentType="knowledge"
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    )

    const content = document.querySelector('.post-dashboard__knowledge-card-content')

    expect(content?.querySelectorAll('p')).toHaveLength(2)
    expect(content?.querySelectorAll('ol li')).toHaveLength(2)
    expect(screen.getByText('先判断风险和后悔成本。')).toBeTruthy()
    expect(screen.getByText('能不能承受失败')).toBeTruthy()
    expect(screen.getByText('会不会留下遗憾')).toBeTruthy()
    expect(screen.getByText('答案清楚后再执行。')).toBeTruthy()
  })

  it('switches knowledge cards with the pager controls', () => {
    window.localStorage.setItem('alpaca-dashboard-view-mode', 'list')
    const { container } = render(
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

    expect(screen.getByText('1/2')).toBeTruthy()
    expect(container.querySelectorAll('.post-dashboard__card--knowledge.is-active')).toHaveLength(1)
    expect(container.querySelector('.post-dashboard__card--knowledge.is-active')?.textContent).toContain('关于系统复用的知识点。')

    fireEvent.click(screen.getByRole('button', { name: '下一条知识点' }))

    expect(screen.getByText('2/2')).toBeTruthy()
    expect(container.querySelectorAll('.post-dashboard__card--knowledge.is-active')).toHaveLength(1)
    expect(container.querySelector('.post-dashboard__card--knowledge.is-active')?.textContent).toContain('关于抽象边界的知识点。')
  })

  it('groups diary entries by month and supports selecting entries for material organization', () => {
    window.localStorage.setItem('alpaca-dashboard-view-mode', 'grid')
    const onOrganizeDiaryMaterials = vi.fn()

    render(
      <PostDashboard
        posts={diaryPosts}
        search=""
        isIndexing={false}
        contentType="diary"
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
        onTogglePinned={vi.fn()}
        onOrganizeDiaryMaterials={onOrganizeDiaryMaterials}
      />,
    )

    expect(screen.getByText('2026 年 05 月')).toBeTruthy()
    expect(screen.getByText('2026 年 04 月')).toBeTruthy()
    expect(screen.queryByText('写完四月月报')).toBeNull()
    expect(screen.queryByText('继续开发后台')).toBeNull()
    expect(screen.queryByRole('button', { name: '网格视图' })).toBeNull()
    expect(screen.queryByRole('button', { name: '列表视图' })).toBeNull()

    fireEvent.click(screen.getByLabelText('选择日记 五月第一则日记'))
    expect(screen.getByText('已选 1 篇')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '整理选中日记' }))
    expect(onOrganizeDiaryMaterials).toHaveBeenCalledWith([diaryPosts[0]])
  })

  it('selects all diary entries in a month and renders the material result', () => {
    const onOrganizeDiaryMaterials = vi.fn()

    render(
      <PostDashboard
        posts={diaryPosts}
        search=""
        isIndexing={false}
        contentType="diary"
        diaryMaterialResult="# 日记素材整理\n\n## 高频主题\n- 博客开发"
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
        onTogglePinned={vi.fn()}
        onOrganizeDiaryMaterials={onOrganizeDiaryMaterials}
      />,
    )

    fireEvent.click(screen.getByLabelText('选择 2026 年 04 月 全部日记'))
    fireEvent.click(screen.getByRole('button', { name: '整理选中日记' }))

    expect(onOrganizeDiaryMaterials).toHaveBeenCalledWith([diaryPosts[1]])
    expect(screen.getByText('整理结果')).toBeTruthy()
    expect(screen.getByText(/博客开发/)).toBeTruthy()
  })
})
