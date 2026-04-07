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

describe('App save flow', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  it('saves serialized markdown with the current sha and refreshes list metadata', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    const buildPostIndex = vi
      .spyOn(indexPostsModule, 'buildPostIndex')
      .mockResolvedValueOnce([existingPost])
      .mockResolvedValueOnce([
        {
          ...existingPost,
          sha: 'sha-updated',
          title: 'Updated title',
          desc: 'Updated desc',
        },
      ])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    const savePostFile = vi.spyOn(githubClientModule, 'savePostFile').mockResolvedValue({
      path: existingPost.path,
      sha: 'sha-updated',
      content: 'serialized',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Rich editor')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Updated title' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Updated desc' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(savePostFile).toHaveBeenCalledTimes(1)
    })

    expect(savePostFile).toHaveBeenCalledWith(
      { token: 'persisted-token' },
      expect.objectContaining({
        path: existingPost.path,
        sha: 'sha-existing',
        content: expect.stringContaining('title: Updated title'),
      }),
    )
    expect(savePostFile.mock.calls[0]?.[1]?.content).toContain('desc: Updated desc')

    await waitFor(() => {
      expect(buildPostIndex).toHaveBeenCalledTimes(2)
    })
    expect(await screen.findByText('Updated title')).toBeTruthy()
    expect(screen.getByText('Saved.')).toBeTruthy()
  })

  it('surfaces stale-sha save conflicts and keeps local dirty state', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    vi.spyOn(githubClientModule, 'savePostFile').mockRejectedValue(new GitHubConflictError())

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Rich editor')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Locally changed title' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Remote changes detected. Reload the post before overwriting it.')).toBeTruthy()
    expect(screen.getByDisplayValue('Locally changed title')).toBeTruthy()
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy()
  })

  it('preserves dirty local state when save fails', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    vi.spyOn(githubClientModule, 'savePostFile').mockRejectedValue(new Error('save failed'))

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Rich editor')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Rich editor'), { target: { value: 'Changed body' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('save failed')).toBeTruthy()
    expect(screen.getByDisplayValue('Changed body')).toBeTruthy()
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy()
  })

  it('clears the session and returns to login when save hits auth expiry', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })
    vi.spyOn(githubClientModule, 'savePostFile').mockRejectedValue(new GitHubAuthError())

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Save flow post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
    expect(await screen.findByLabelText('Rich editor')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Rich editor'), { target: { value: 'Changed body' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(screen.getByText('GitHub session expired. Please sign in again.')).toBeTruthy()
  })
})
