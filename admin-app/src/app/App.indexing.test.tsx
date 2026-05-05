import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { PostIndexItem } from './posts/post-types'
import * as githubClientModule from './github-client'
import { GitHubAuthError } from './github-client'
import * as postsModule from './posts/index-posts'
import * as readLaterIndexModule from './read-later/index-items'
import * as sessionModule from './session'

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

const openedPostContent = `---
title: 为什么先把博客搭起来
permalink: why-start-this-blog/
date: 2026-04-01 20:10:00
published: true
categories:
  - 思考
tags:
  - 记录
desc: desc
---

Original body.`

const readLaterIndexedPosts: PostIndexItem[] = [
  {
    path: 'source/read-later-items/saved-article.md',
    sha: 'sha-read-later-1',
    title: '待读里的文章',
    date: '2026-04-02 09:00:00',
    desc: 'read later desc',
    published: false,
    hasExplicitPublished: false,
    categories: [],
    tags: ['阅读'],
    permalink: 'read-later/saved-article/',
    cover: null,
    contentType: 'read-later',
    externalUrl: 'https://example.com/article',
    sourceName: 'Example',
    readingStatus: 'unread',
  },
]

const diaryIndexedPosts: PostIndexItem[] = [
  {
    path: 'source/diary/20260505010101.md',
    sha: 'sha-diary-1',
    title: '五月第一则日记',
    date: '2026-05-05 01:01:01',
    desc: '记录最近的状态',
    published: false,
    hasExplicitPublished: true,
    categories: [],
    tags: ['记录'],
    permalink: null,
    cover: null,
    contentType: 'diary',
  },
]

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })

  return { promise, resolve }
}

describe('App indexing flow', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    githubClientModule.clearMarkdownFileCache()
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('loads indexed posts after session hydration', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue(indexedPosts)

    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    })
  })

  it('keeps cached list visible while switching back and revalidating in the background', async () => {
    const refreshedPosts: PostIndexItem[] = [
      {
        ...indexedPosts[0],
        sha: 'sha-refreshed',
        title: '刷新后的文章列表',
      },
    ]
    const revalidation = createDeferred<PostIndexItem[]>()

    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    const buildPostIndex = vi.spyOn(postsModule, 'buildPostIndex')
      .mockResolvedValueOnce(indexedPosts)
      .mockReturnValueOnce(revalidation.promise)
    vi.spyOn(readLaterIndexModule, 'buildReadLaterIndex').mockResolvedValue(readLaterIndexedPosts)

    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('radio', { name: '待读' }))
    await waitFor(() => {
      expect(screen.getByText('待读里的文章')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('radio', { name: '文章' }))

    expect(buildPostIndex).toHaveBeenCalledTimes(2)
    expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    expect(screen.queryByText('正在加载文章…')).toBeNull()

    revalidation.resolve(refreshedPosts)

    await waitFor(() => {
      expect(screen.getByText('刷新后的文章列表')).toBeTruthy()
    })
  })

  it('opens indexed posts directly from the warmed markdown cache', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue(indexedPosts)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'file',
        path: indexedPosts[0].path,
        sha: indexedPosts[0].sha,
        encoding: 'base64',
        content: Buffer.from(openedPostContent, 'utf8').toString('base64'),
      }),
    } as Response)
    await githubClientModule.fetchPostFile({ token: 'persisted-token' }, indexedPosts[0].path)

    const fetchMarkdownFile = vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: indexedPosts[0].path,
      sha: indexedPosts[0].sha,
      content: openedPostContent,
    })

    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /为什么先把博客搭起来/i }))

    const editor = (await screen.findByLabelText('Markdown 编辑器')) as HTMLTextAreaElement
    expect(editor.value).toContain('Original body.')
    expect(fetchMarkdownFile).not.toHaveBeenCalled()
  })

  it('loads diary entries after switching content type', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue(indexedPosts)
    vi.spyOn(postsModule, 'buildDiaryIndex').mockResolvedValue(diaryIndexedPosts)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('radio', { name: '日记' }))

    await waitFor(() => {
      expect(screen.getByText('五月第一则日记')).toBeTruthy()
    })
  })

  it('toggles pinned from the dashboard list without opening the editor', async () => {
    window.localStorage.setItem('alpaca-dashboard-view-mode', 'list')
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue(indexedPosts)
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: indexedPosts[0].path,
      sha: indexedPosts[0].sha,
      content: openedPostContent,
    })
    const saveMarkdownFile = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockImplementation(async (_session, file) => ({
      path: file.path,
      sha: 'sha-2',
    }))

    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    })

    fireEvent.click((container.querySelector('.post-list-item__pin-btn') as HTMLButtonElement))

    await waitFor(() => {
      expect(saveMarkdownFile).toHaveBeenCalledTimes(1)
    })

    expect(saveMarkdownFile.mock.calls[0]?.[1]?.content).toContain('pinned: true')
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
    expect(await screen.findByText('已置顶《为什么先把博客搭起来》。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消置顶文章' })).toBeTruthy()
  })

  it('toggles pinned from the list and syncs the open document when clean', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue(indexedPosts)
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: indexedPosts[0].path,
      sha: indexedPosts[0].sha,
      content: openedPostContent,
    })
    const saveMarkdownFile = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockImplementation(async (_session, file) => ({
      path: file.path,
      sha: 'sha-2',
    }))

    const { container } = render(<App />)

    await waitFor(() => {
      expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /为什么先把博客搭起来/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: '置顶' }) as HTMLInputElement).checked).toBe(false)

    fireEvent.click((container.querySelector('.post-list-item__pin-btn') as HTMLButtonElement))

    await waitFor(() => {
      expect(saveMarkdownFile).toHaveBeenCalledTimes(1)
    })

    expect(saveMarkdownFile.mock.calls[0]?.[1]?.content).toContain('pinned: true')

    await waitFor(() => {
      expect((screen.getByRole('checkbox', { name: '置顶' }) as HTMLInputElement).checked).toBe(true)
    })

    expect(screen.getAllByRole('button', { name: '取消置顶文章' }).length).toBeGreaterThan(0)
  })

  it('disables quick pinning for the active dirty document', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue(indexedPosts)
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: indexedPosts[0].path,
      sha: indexedPosts[0].sha,
      content: openedPostContent,
    })
    const saveMarkdownFile = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: indexedPosts[0].path,
      sha: 'sha-2',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /为什么先把博客搭起来/i }))

    const editor = (await screen.findByLabelText('Markdown 编辑器')) as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: 'Changed body.' } })

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: '置顶文章' }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
    })

    expect(saveMarkdownFile).not.toHaveBeenCalled()
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

  it('revokes existing preview image object URLs when open post hits auth expiry', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:open-preview-image')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(global.URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURL,
    })
    Object.defineProperty(global.URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURL,
    })

    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue(indexedPosts)
    vi.spyOn(githubClientModule, 'uploadImageFile').mockResolvedValue({
      path: 'source/images/2026/04/example-cover.png',
      sha: 'sha-image',
    })
    vi.spyOn(githubClientModule, 'fetchMarkdownFile')
      .mockResolvedValueOnce({
        path: indexedPosts[0].path,
        sha: indexedPosts[0].sha,
        content: openedPostContent,
      })
      .mockRejectedValueOnce(new GitHubAuthError())

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('为什么先把博客搭起来')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /为什么先把博客搭起来/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    const file = new File(['image'], 'cover.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('上传图片文件'), { target: { files: [file] } })

    await waitFor(() => {
      expect((screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement).value).toContain('![cover](')
    })

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: /为什么先把博客搭起来/i }))

    expect(await screen.findByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(screen.getByText('GitHub 会话已过期，请重新登录。')).toBeTruthy()
    expect(confirmSpy).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:open-preview-image')
  })
})
