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

describe('management layout components', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders normalized metadata and opens a post on click', () => {
    const onOpenPost = vi.fn()
    render(<PostListPane posts={posts} hidden={false} onOpenPost={onOpenPost} />)

    expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    expect(screen.getByText('Published')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /为什么先把博客搭起来/i }))
    expect(onOpenPost).toHaveBeenCalledWith(posts[0])
  })

  it('hides the pane in immersive mode', () => {
    render(<PostListPane posts={posts} hidden onOpenPost={vi.fn()} />)
    expect(screen.queryByText('为什么先把博客搭起来')).toBeNull()
  })

  it('shows the top bar controls', () => {
    render(
      <TopBar
        search=""
        onSearchChange={vi.fn()}
        onNewPost={vi.fn()}
        onSave={vi.fn()}
        onTogglePreview={vi.fn()}
        onToggleImmersive={vi.fn()}
        onLogout={vi.fn()}
        isPreviewing={false}
        isImmersive={false}
        status="Ready"
      />,
    )

    expect(screen.getByRole('button', { name: 'New post' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Search' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sort' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Immersive' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy()
    expect(screen.getByText('Ready')).toBeTruthy()
  })
})
