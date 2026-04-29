import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PostListPane from './post-list-pane'
import TopBar from './top-bar'
import type { ParsedPost } from '../posts/parse-post'
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
  {
    path: 'source/read-later-items/unread-article.md',
    sha: 'sha-rl-2',
    title: '还没开始读的文章',
    date: '2026-04-03 09:00:00',
    desc: '稍后处理。',
    published: false,
    hasExplicitPublished: false,
    categories: [],
    tags: ['待看'],
    permalink: 'read-later/unread-article/',
    contentType: 'read-later',
    externalUrl: 'https://example.com/unread',
    sourceName: 'Unread Source',
    readingStatus: 'unread',
    cover: null,
  },
  {
    path: 'source/read-later-items/done-article.md',
    sha: 'sha-rl-3',
    title: '已经读完的文章',
    date: '2026-04-04 10:00:00',
    desc: '已读完。',
    published: false,
    hasExplicitPublished: false,
    categories: [],
    tags: ['复盘'],
    permalink: 'read-later/done-article/',
    contentType: 'read-later',
    externalUrl: 'https://example.com/done',
    sourceName: 'Done Source',
    readingStatus: 'done',
    cover: null,
  },
]

const readLaterDocument: ParsedPost = {
  path: 'source/read-later-items/saved-article.md',
  sha: 'sha-rl-1',
  body: `## 原文摘录\n# 第一部分\n\n正文\n\n## 我的总结\n总结内容\n\n## 我的评论\n评论内容`,
  hasExplicitPublished: false,
  hasExplicitPermalink: true,
  contentType: 'read-later',
  frontmatter: {
    title: '值得回看的设计文章',
    date: '2026-04-02 08:30:00',
    desc: '一篇关于系统设计取舍的长文。',
    categories: [],
    tags: ['设计'],
    permalink: 'read-later/saved-article/',
    external_url: 'https://example.com/design',
    source_name: 'Example Design',
    reading_status: 'reading',
    read_later: true,
    nav_exclude: true,
    layout: 'read-later-item',
  },
}

describe('management layout components', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders normalized metadata and opens a post on click', () => {
    const onOpenPost = vi.fn()
    render(
      <PostListPane
        posts={posts}
        hidden={false}
        contentType="post"
        onOpenPost={onOpenPost}
        onDeletePost={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    )

    expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    expect(screen.getByText('已发布')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /为什么先把博客搭起来/i }))
    expect(onOpenPost).toHaveBeenCalledWith(posts[0])
  })

  it('hides the pane in immersive mode', () => {
    render(
      <PostListPane
        posts={posts}
        hidden
        contentType="post"
        onOpenPost={vi.fn()}
        onDeletePost={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    )
    expect(screen.queryByText('为什么先把博客搭起来')).toBeNull()
  })

  it('triggers delete callback from the delete button', () => {
    const onDeletePost = vi.fn()
    render(
      <PostListPane
        posts={posts}
        hidden={false}
        contentType="post"
        onOpenPost={vi.fn()}
        onDeletePost={onDeletePost}
        onTogglePinned={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '删除文章' }))

    expect(onDeletePost).toHaveBeenCalledWith(posts[0])
  })

  it('shows pinned state and triggers pin callback from the side button', () => {
    const pinnedPost = { ...posts[0], pinned: true }
    const onTogglePinned = vi.fn()
    render(
      <PostListPane
        posts={[pinnedPost]}
        hidden={false}
        contentType="post"
        onOpenPost={vi.fn()}
        onDeletePost={vi.fn()}
        onTogglePinned={onTogglePinned}
      />,
    )

    expect(screen.getByText('置顶')).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消置顶文章' })).toBeTruthy()
    expect(screen.getByText('已置顶')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '取消置顶文章' }))

    expect(onTogglePinned).toHaveBeenCalledWith(pinnedPost)
  })

  it('renders read-later metadata with source and status', () => {
    const onOpenPost = vi.fn()
    render(
      <PostListPane
        posts={readLaterPosts}
        hidden={false}
        contentType="read-later"
        onOpenPost={onOpenPost}
        onDeletePost={vi.fn()}
        onTogglePinned={vi.fn()}
      />,
    )

    expect(screen.getByText('待读归档')).toBeTruthy()
    expect(screen.getByText('在读')).toBeTruthy()
    expect(screen.getByText('未读')).toBeTruthy()
    expect(screen.getByText('已读')).toBeTruthy()
    expect(screen.getByText('Example Design')).toBeTruthy()
    expect(screen.getByText('https://example.com/design')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '置顶文章' })).toBeNull()

    const badges = screen.getAllByText(/未读|在读|已读/)
    expect(badges[0].className).toContain('post-status-badge--reading')
    expect(badges[1].className).toContain('post-status-badge--unread')
    expect(badges[2].className).toContain('post-status-badge--done')

    fireEvent.click(screen.getByRole('button', { name: /值得回看的设计文章/i }))
    expect(onOpenPost).toHaveBeenCalledWith(readLaterPosts[0])
  })

  it('replaces the read-later list with a reader outline when a document is open', () => {
    const onBackToList = vi.fn()
    const onToggleTopBar = vi.fn()
    render(
      <PostListPane
        posts={readLaterPosts}
        hidden={false}
        contentType="read-later"
        document={readLaterDocument}
        onOpenPost={vi.fn()}
        onDeletePost={vi.fn()}
        onTogglePinned={vi.fn()}
        onBackToList={onBackToList}
        onToggleTopBar={onToggleTopBar}
      />,
    )

    expect(screen.getByText('内容目录')).toBeTruthy()
    expect(screen.queryByText('阅读导航')).toBeNull()
    expect(screen.getByRole('button', { name: '← 返回归档' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '隐藏顶部栏' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '文章目录' })).toBeTruthy()
    expect(screen.queryByText('阅读面板')).toBeNull()
    expect(screen.queryByRole('link', { name: '阅读原文 ↗' })).toBeNull()
    expect(screen.queryByRole('link', { name: '原文摘录' })).toBeNull()
    expect(screen.getByRole('link', { name: '回到顶部' }).getAttribute('href')).toBe('#read-later-content')
    expect(screen.getByRole('link', { name: '第一部分' }).getAttribute('href')).toBe('#read-later-article-excerpt-第一部分')
    expect(screen.getByRole('link', { name: '我的总结' }).getAttribute('href')).toBe('#read-later-summary')
    expect(screen.queryByText('待读归档')).toBeNull()
    expect(screen.queryByRole('button', { name: '删除待读条目' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '隐藏顶部栏' }))
    expect(onToggleTopBar).toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '← 返回归档' }))
    expect(onBackToList).toHaveBeenCalled()
  })

  it('shows the top bar controls without unused filter and sort buttons', () => {
    render(
      <TopBar
        search=""
        onSearchChange={vi.fn()}
        onNewPost={vi.fn()}
        onSave={vi.fn()}
        onTogglePreview={vi.fn()}
        onLogout={vi.fn()}
        onContentTypeChange={vi.fn()}
        contentType="post"
        isPreviewing={false}
        hasActiveDocument={false}
        saveLabel="保存"
        isSaveDisabled
        isSaveQuiet={false}
        status="已就绪"
        onToggleColorMode={vi.fn()}
        adminView="editor"
        isDarkMode={false}
      />,
    )

    expect(screen.getByText('内容编辑台')).toBeTruthy()
    expect(screen.getByRole('button', { name: /新建文章/ })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '搜索' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '文章' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '待读' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '筛选' })).toBeNull()
    expect(screen.queryByRole('button', { name: '排序' })).toBeNull()
    const saveButton = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)
    expect(screen.getByRole('button', { name: '预览' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '退出登录' })).toBeTruthy()
    expect(screen.getByText('已就绪')).toBeTruthy()
  })

  it('hides the preview toggle for read-later editor mode', () => {
    render(
      <TopBar
        search=""
        onSearchChange={vi.fn()}
        onNewPost={vi.fn()}
        onSave={vi.fn()}
        onTogglePreview={vi.fn()}
        onLogout={vi.fn()}
        onContentTypeChange={vi.fn()}
        contentType="read-later"
        isPreviewing={true}
        hasActiveDocument={true}
        saveLabel="保存"
        isSaveDisabled={false}
        isSaveQuiet={false}
        status="已就绪"
        onToggleColorMode={vi.fn()}
        adminView="editor"
        isDarkMode={false}
      />,
    )

    expect(screen.queryByRole('button', { name: '阅读视图' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Markdown' })).toBeNull()
  })

  it('switches content type via the redesigned radio cards', () => {
    const onContentTypeChange = vi.fn()
    render(
      <TopBar
        search=""
        onSearchChange={vi.fn()}
        onNewPost={vi.fn()}
        onSave={vi.fn()}
        onTogglePreview={vi.fn()}
        onLogout={vi.fn()}
        onContentTypeChange={onContentTypeChange}
        contentType="post"
        isPreviewing={false}
        hasActiveDocument={true}
        saveLabel="保存"
        isSaveDisabled={false}
        isSaveQuiet={false}
        status="已就绪"
        onToggleColorMode={vi.fn()}
        adminView="dashboard"
        isDarkMode={false}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))

    expect(onContentTypeChange).toHaveBeenCalledWith('read-later')
    expect(screen.getByRole('button', { name: /新建文章/ })).toBeTruthy()
  })
})
