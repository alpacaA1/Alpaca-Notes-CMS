import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { GitHubAuthError, GitHubConflictError } from './github-client'
import * as githubClientModule from './github-client'
import * as indexPostsModule from './posts/index-posts'
import * as sessionModule from './session'

const existingPost = {
  path: 'source/_posts/save-flow.md',
  sha: 'sha-existing',
  title: 'Save flow post',
  date: '2026-04-03 12:00:00',
  desc: 'desc',
  published: false,
  hasExplicitPublished: true,
  categories: ['专业'],
  tags: ['产品'],
  permalink: 'save-flow-post/',
}

const existingContent = `---
title: Save flow post
permalink: save-flow-post/
date: 2026-04-03 12:00:00
published: false
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Original body.`

const otherPost = {
  path: 'source/_posts/other-post.md',
  sha: 'sha-other',
  title: 'Other post',
  date: '2026-04-04 12:00:00',
  desc: 'other desc',
  published: true,
  hasExplicitPublished: true,
  categories: ['生活'],
  tags: ['记录'],
  permalink: 'other-post/',
}

const otherContent = `---
title: Other post
permalink: other-post/
date: 2026-04-04 12:00:00
published: true
categories:
  - 生活
tags:
  - 记录
desc: other desc
---

Other body.`

const topicPost = {
  path: 'source/_posts/influence-topic.md',
  sha: 'sha-topic',
  title: '影响力',
  date: '2026-05-05 09:00:00',
  desc: '关于《影响力》的主题页',
  published: false,
  hasExplicitPublished: true,
  categories: ['读书'],
  tags: ['说服'],
  permalink: 'influence/',
  contentType: 'post' as const,
  isTopic: true,
  topicType: 'book' as const,
  nodeKey: 'book/影响力',
  aliases: ['《影响力》'],
}

const linkingContent = `---
title: Save flow post
permalink: save-flow-post/
date: 2026-04-03 12:00:00
published: false
categories:
  - 专业
tags:
  - 产品
desc: desc
---

今天又想到 [[book/影响力|《影响力》]] 里讲的互惠原则。`

const topicContent = `---
title: 影响力
permalink: influence/
topic: true
topic_type: book
node_key: book/影响力
aliases:
  - 《影响力》
date: 2026-05-05 09:00:00
published: false
categories:
  - 读书
tags:
  - 说服
desc: 关于《影响力》的主题页
---

这是一个主题文章。`

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

describe('App save flow', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    githubClientModule.clearMarkdownFileCache()
    window.sessionStorage.clear()
    window.localStorage.clear()
  })

  it('shows 已保存 for a clean opened document, 保存 for dirty state, 保存中… while saving, and returns to 已保存 after success', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    const deferredSave = createDeferredPromise<{ path: string; sha: string; content: string }>()
    const saveMarkdownFile = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockReturnValue(deferredSave.promise)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    // In dashboard mode, the save button is not visible until a post is opened
    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    const cleanSaveButton = screen.getByRole('button', { name: '已保存' }) as HTMLButtonElement
    expect(cleanSaveButton.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Updated title' } })

    const dirtySaveButton = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement
    expect(dirtySaveButton.disabled).toBe(false)

    fireEvent.click(dirtySaveButton)

    await waitFor(() => {
      expect(saveMarkdownFile).toHaveBeenCalledTimes(1)
    })

    const savingButton = screen.getByRole('button', { name: '保存中…' }) as HTMLButtonElement
    expect(savingButton.disabled).toBe(true)

    deferredSave.resolve({
      path: existingPost.path,
      sha: 'sha-updated',
      content: 'serialized',
    })

    const savedButton = (await screen.findByRole('button', { name: '已保存' })) as HTMLButtonElement
    expect(savedButton.disabled).toBe(true)
    expect(await screen.findByText('已保存。')).toBeTruthy()
  })

  it('clears the save success message after the next edit following a successful save', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: 'sha-updated',
      content: 'serialized',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Updated title' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    const savedButton = (await screen.findByRole('button', { name: '已保存' })) as HTMLButtonElement
    expect(savedButton.disabled).toBe(true)
    expect(await screen.findByText('已保存。')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: 'Edited again after save' } })

    await waitFor(() => {
      expect(screen.queryByText('已保存。')).toBeNull()
    })

    const dirtySaveButton = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement
    expect(dirtySaveButton.disabled).toBe(false)
    expect(screen.getByText(/未保存修改/)).toBeTruthy()
  })

  it('does not resurface the previous save success message after reverting back to the saved content', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: 'sha-updated',
      content: 'serialized',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Updated title' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('已保存。')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: 'Edited again after save' } })

    await waitFor(() => {
      expect(screen.queryByText('已保存。')).toBeNull()
    })

    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: 'desc' } })

    const revertedSaveButton = (await screen.findByRole('button', { name: '已保存' })) as HTMLButtonElement
    expect(revertedSaveButton.disabled).toBe(true)
    expect(screen.queryByText('已保存。')).toBeNull()
  })

  it('keeps invalid dirty documents actionable, shows validation errors, and does not call saveMarkdownFile', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    const saveMarkdownFile = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: 'sha-updated',
      content: 'serialized',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: '' } })

    const saveButton = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement
    expect(saveButton.disabled).toBe(false)

    fireEvent.click(saveButton)

    expect(await screen.findByText('请填写标题。')).toBeTruthy()
    expect(saveMarkdownFile).not.toHaveBeenCalled()

    const stillActionableSaveButton = screen.getByRole('button', { name: '保存' }) as HTMLButtonElement
    expect(stillActionableSaveButton.disabled).toBe(false)
  })

  it('saves serialized markdown with the current sha and updates list metadata without rebuilding the full index', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    const buildPostIndex = vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    const saveMarkdownFile = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: 'sha-updated',
      content: 'serialized',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Updated title' } })
    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: 'Updated desc' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(saveMarkdownFile).toHaveBeenCalledTimes(1)
    })

    expect(saveMarkdownFile).toHaveBeenCalledWith(
      { token: 'persisted-token' },
      expect.objectContaining({
        path: existingPost.path,
        sha: 'sha-existing',
        content: expect.stringContaining('title: Updated title'),
      }),
    )
    expect(saveMarkdownFile.mock.calls[0]?.[1]?.content).toContain('desc: Updated desc')

    await waitFor(() => {
      expect(buildPostIndex).toHaveBeenCalledTimes(1)
    })
  })

  it('updates linked topic documents after saving a backlink source post', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost, topicPost])
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([])
    vi.spyOn(indexPostsModule, 'buildKnowledgeIndex').mockResolvedValue([])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockImplementation(async (_session, path) => {
      if (path === existingPost.path) {
        return {
          path,
          sha: existingPost.sha,
          content: linkingContent,
        }
      }

      return {
        path,
        sha: topicPost.sha,
        content: topicContent,
      }
    })
    const saveMarkdownFile = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockImplementation(async (_session, file) => {
      if (file.path === existingPost.path) {
        return {
          path: file.path,
          sha: 'sha-linking-updated',
          content: file.content,
        }
      }

      expect(file.content).toContain('## 相关双链摘录')
      expect(file.content).toContain('### Updated source title')
      expect(file.content).toContain('今天又想到 《影响力》 里讲的互惠原则。')

      return {
        path: file.path,
        sha: 'sha-topic-updated',
        content: file.content,
      }
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Updated source title' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(saveMarkdownFile).toHaveBeenCalledTimes(2)
    })

    expect(saveMarkdownFile.mock.calls[0]?.[1]?.path).toBe(existingPost.path)
    expect(saveMarkdownFile.mock.calls[1]?.[1]?.path).toBe(topicPost.path)
    expect(await screen.findByText('已保存。')).toBeTruthy()
  })

  it('keeps saved permalink changes after switching away and reopening the post', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([otherPost, existingPost])
    const fetchMarkdownFile = vi.spyOn(githubClientModule, 'fetchMarkdownFile')
    fetchMarkdownFile
      .mockResolvedValueOnce({
        path: existingPost.path,
        sha: existingPost.sha,
        content: existingContent,
      })
      .mockResolvedValueOnce({
        path: otherPost.path,
        sha: otherPost.sha,
        content: otherContent,
      })
      .mockResolvedValueOnce({
        path: existingPost.path,
        sha: 'sha-updated',
        content: `---
title: Save flow post
permalink: updated-save-flow/
date: 2026-04-03 12:00:00
published: false
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Original body.`,
      })
    vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: 'sha-updated',
      content: 'serialized',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('永久链接'), { target: { value: 'updated-save-flow/' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('已保存。')).toBeTruthy()
    expect((screen.getByLabelText('永久链接') as HTMLInputElement).value).toBe('updated-save-flow/')

    fireEvent.click(screen.getByRole('button', { name: /other post/i }))
    await screen.findByDisplayValue('other-post/')

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByDisplayValue('updated-save-flow/')).toBeTruthy()
  })

  it('allows unpublishing an already-published post and saves published false', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([otherPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: otherPost.path,
      sha: otherPost.sha,
      content: otherContent,
    })
    const saveMarkdownFile = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: otherPost.path,
      sha: 'sha-other-updated',
      content: 'serialized',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Other post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /other post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    const publishedCheckbox = screen.getByRole('checkbox', { name: '已发布' }) as HTMLInputElement
    expect(publishedCheckbox.checked).toBe(true)
    expect(publishedCheckbox.disabled).toBe(false)

    fireEvent.click(publishedCheckbox)
    expect((screen.getByRole('checkbox', { name: '已发布' }) as HTMLInputElement).checked).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => {
      expect(saveMarkdownFile).toHaveBeenCalledTimes(1)
    })

    expect(saveMarkdownFile).toHaveBeenCalledWith(
      { token: 'persisted-token' },
      expect.objectContaining({
        path: otherPost.path,
        sha: otherPost.sha,
        content: expect.stringContaining('published: false'),
      }),
    )
    expect(await screen.findByText('已保存。')).toBeTruthy()
  })

  it('surfaces stale-sha save conflicts and keeps local dirty state', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    vi.spyOn(githubClientModule, 'saveMarkdownFile').mockRejectedValue(new GitHubConflictError())

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Locally changed title' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('检测到远端内容已变更，请先重新加载文章后再覆盖保存。')).toBeTruthy()
    expect(screen.getByDisplayValue('Locally changed title')).toBeTruthy()
    expect(screen.getByText(/未保存修改/)).toBeTruthy()
  })

  it('preserves dirty local state when save fails', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    vi.spyOn(githubClientModule, 'saveMarkdownFile').mockRejectedValue(new Error('save failed'))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Markdown 编辑器'), { target: { value: 'Changed body' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('save failed')).toBeTruthy()
    expect(screen.getByDisplayValue('Changed body')).toBeTruthy()
    expect(screen.getByText(/未保存修改/)).toBeTruthy()
  })

  it('clears the session and returns to login when save hits auth expiry', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    vi.spyOn(githubClientModule, 'saveMarkdownFile').mockRejectedValue(new GitHubAuthError())

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Markdown 编辑器'), { target: { value: 'Changed body' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(screen.getByText('GitHub 会话已过期，请重新登录。')).toBeTruthy()
  })

  it('revokes preview image object URLs when save auth expiry resets the workspace', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:save-preview-image')
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
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    vi.spyOn(githubClientModule, 'uploadImageFile').mockResolvedValue({
      path: 'source/images/2026/04/example-cover.png',
      sha: 'sha-image',
    })
    vi.spyOn(githubClientModule, 'saveMarkdownFile').mockRejectedValue(new GitHubAuthError())

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    const file = new File(['image'], 'cover.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('上传图片文件'), { target: { files: [file] } })

    await waitFor(() => {
      expect((screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement).value).toContain('![cover](')
    })

    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:save-preview-image')
  })

  it('deletes a post directly from the dashboard list', async () => {
    window.localStorage.setItem('alpaca-dashboard-view-mode', 'list')
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([otherPost, existingPost])
    const deleteMarkdownFile = vi.spyOn(githubClientModule, 'deleteMarkdownFile').mockResolvedValue()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByTitle('删除《Save flow post》'))
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(deleteMarkdownFile).toHaveBeenCalledWith(
        { token: 'persisted-token' },
        { path: existingPost.path, sha: existingPost.sha },
      )
    })

    await waitFor(() => {
      expect(screen.queryByText('Save flow post')).toBeNull()
    })
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
  })

  it('deletes a post from the editor list and returns to dashboard when deleting the active post', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([otherPost, existingPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    const deleteMarkdownFile = vi.spyOn(githubClientModule, 'deleteMarkdownFile').mockResolvedValue()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Other post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.click(screen.getByTitle('删除《Save flow post》'))
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(deleteMarkdownFile).toHaveBeenCalledWith(
        { token: 'persisted-token' },
        { path: existingPost.path, sha: existingPost.sha },
      )
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /save flow post/i })).toBeNull()
    })
    expect(screen.getByText('Other post')).toBeTruthy()
  })

  it('asks for extra confirmation before deleting the active post with unsaved changes', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    const deleteMarkdownFile = vi.spyOn(githubClientModule, 'deleteMarkdownFile').mockResolvedValue()
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Locally changed title' } })
    fireEvent.click(screen.getByTitle('删除《Save flow post》'))

    expect(confirmSpy).toHaveBeenCalledWith('当前文章有未保存的修改。删除后无法恢复，确认继续吗？')
    expect(deleteMarkdownFile).not.toHaveBeenCalled()
    expect(screen.queryByText('删除文章')).toBeNull()
  })

  it('keeps a new unsaved draft untouched when deleting another post from the list', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([otherPost, existingPost])
    const deleteMarkdownFile = vi.spyOn(githubClientModule, 'deleteMarkdownFile').mockResolvedValue()

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Other post')).toBeTruthy()
    })

    fireEvent.click(screen.getAllByRole('button', { name: /新建文章/ })[0])
    expect(await screen.findByLabelText('标题')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Temporary draft' } })

    fireEvent.click(screen.getByTitle('删除《Other post》'))
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))

    await waitFor(() => {
      expect(deleteMarkdownFile).toHaveBeenCalledWith(
        { token: 'persisted-token' },
        { path: otherPost.path, sha: otherPost.sha },
      )
    })

    expect(screen.getByDisplayValue('Temporary draft')).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /other post/i })).toBeNull()
    })
  })
})
