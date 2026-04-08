import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { PostIndexItem } from './posts/post-types'
import * as postsModule from './posts/index-posts'
import * as sessionModule from './session'
import { GitHubAuthError } from './github-client'

const indexedPosts: PostIndexItem[] = [
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

describe('App indexing flow', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  it('loads indexed posts after session hydration', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue(indexedPosts)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    })
  })

  it('clears the session and returns to the login gate on GitHub auth expiry', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockRejectedValue(new GitHubAuthError())

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
    })

    expect(screen.getByText('GitHub 会话已过期，请重新登录。')).toBeTruthy()
  })
})
