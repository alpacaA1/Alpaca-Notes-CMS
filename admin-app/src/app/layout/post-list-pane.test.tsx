import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PostListPane from './post-list-pane'
import TopBar from './top-bar'
import type { PostIndexItem } from '../posts/post-types'

const posts: PostIndexItem[] = [
  {
    path: 'source/_posts/hello-world.md',
    sha: 'sha-1',
    title: '为什么先把博客搭起来',
    date: '2026-04-01 20:10:00',
    desc: 'desc',
    published: true,
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

describe('management layout components', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders normalized metadata and opens a post on click', () => {
    const onOpenPost = vi.fn()
    render(<PostListPane posts={posts} hidden={false} contentType="post" onOpenPost={onOpenPost} onDeletePost={vi.fn()} />)

    expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    expect(screen.getByText('已发布')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /为什么先把博客搭起来/i }))
    expect(onOpenPost).toHaveBeenCalledWith(posts[0])
  })

  it('hides the pane in immersive mode', () => {
    render(<PostListPane posts={posts} hidden contentType="post" onOpenPost={vi.fn()} onDeletePost={vi.fn()} />)
    expect(screen.queryByText('为什么先把博客搭起来')).toBeNull()
  })

  it('triggers delete callback from the delete button', () => {
    const onDeletePost = vi.fn()
    render(<PostListPane posts={posts} hidden={false} contentType="post" onOpenPost={vi.fn()} onDeletePost={onDeletePost} />)

    fireEvent.click(screen.getByRole('button', { name: '删除文章' }))

    expect(onDeletePost).toHaveBeenCalledWith(posts[0])
  })

  it('renders read-later metadata with source and status', () => {
    const onOpenPost = vi.fn()
    render(<PostListPane posts={readLaterPosts} hidden={false} contentType="read-later" onOpenPost={onOpenPost} onDeletePost={vi.fn()} />)

    expect(screen.getByText('待读归档')).toBeTruthy()
    expect(screen.getByText('在读')).toBeTruthy()
    expect(screen.getByText('Example Design')).toBeTruthy()
    expect(screen.getByText('https://example.com/design')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /值得回看的设计文章/i }))
    expect(onOpenPost).toHaveBeenCalledWith(readLaterPosts[0])
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
    expect(screen.getByRole('button', { name: '新建文章' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: '搜索' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '筛选' })).toBeNull()
    expect(screen.queryByRole('button', { name: '排序' })).toBeNull()
    const saveButton = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement
    expect(saveButton.disabled).toBe(true)
    expect(screen.getByRole('button', { name: '预览' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '退出登录' })).toBeTruthy()
    expect(screen.getByText('已就绪')).toBeTruthy()
  })
})
