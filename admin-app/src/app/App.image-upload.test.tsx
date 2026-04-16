import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { GitHubAuthError } from './github-client'
import * as githubClientModule from './github-client'
import { MAX_IMAGE_UPLOAD_BYTES } from './editor/image-upload'
import * as indexPostsModule from './posts/index-posts'
import * as sessionModule from './session'

const existingPost = {
  path: 'source/_posts/image-upload.md',
  sha: 'sha-existing',
  title: 'Image upload post',
  date: '2026-04-03 12:00:00',
  desc: 'desc',
  published: false,
  hasExplicitPublished: true,
  categories: ['专业'],
  tags: ['产品'],
  permalink: 'image-upload-post/',
}

const existingContent = `---
title: Image upload post
permalink: image-upload-post/
date: 2026-04-03 12:00:00
published: false
categories:
  - 专业
tags:
  - 产品
desc: desc
---

Original body.`

describe('App image upload flow', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  async function openPost() {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(indexPostsModule, 'buildPostIndex').mockResolvedValue([existingPost])
    vi.spyOn(githubClientModule, 'fetchPostFile').mockResolvedValue({
      path: existingPost.path,
      sha: existingPost.sha,
      content: existingContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText('Image upload post')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /image upload post/i }))
    return (await screen.findByLabelText('Markdown 编辑器')) as HTMLTextAreaElement
  }

  it('uploads an image, inserts markdown, and previews it immediately with a blob URL', async () => {
    const createObjectURL = vi.fn().mockReturnValue('blob:preview-image')
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
    const uploadImageFile = vi.spyOn(githubClientModule, 'uploadImageFile').mockResolvedValue({
      path: 'source/images/2026/04/example-cover.png',
      sha: 'sha-image',
    })

    const editor = await openPost()
    const file = new File(['image'], 'cover.png', { type: 'image/png' })

    fireEvent.change(screen.getByLabelText('上传图片文件'), { target: { files: [file] } })

    await waitFor(() => {
      expect(editor.value).toMatch(/!\[cover\]\(\/images\/\d{4}\/\d{2}\/\d+-cover\.png\)/)
    })

    expect(uploadImageFile).toHaveBeenCalledWith(
      { token: 'persisted-token' },
      expect.objectContaining({ path: expect.stringMatching(/^source\/images\/\d{4}\/\d{2}\/\d+-cover\.png$/) }),
    )

    fireEvent.click(screen.getByRole('button', { name: '预览' }))

    const image = await screen.findByRole('img', { name: 'cover' })
    expect(image.getAttribute('src')).toBe('blob:preview-image')
  })

  it('shows an error and keeps the draft unchanged for unsupported image types', async () => {
    const uploadImageFile = vi.spyOn(githubClientModule, 'uploadImageFile').mockResolvedValue({
      path: 'unused',
      sha: 'unused',
    })

    const editor = await openPost()
    const originalValue = editor.value
    const file = new File(['<svg />'], 'diagram.svg', { type: 'image/svg+xml' })

    fireEvent.change(screen.getByLabelText('上传图片文件'), { target: { files: [file] } })

    expect(await screen.findByText('仅支持 PNG、JPG、WEBP 或 GIF 图片。')).toBeTruthy()
    expect(editor.value).toBe(originalValue)
    expect(uploadImageFile).not.toHaveBeenCalled()
  })

  it('shows an error and keeps the draft unchanged for oversized images', async () => {
    const uploadImageFile = vi.spyOn(githubClientModule, 'uploadImageFile').mockResolvedValue({
      path: 'unused',
      sha: 'unused',
    })

    const editor = await openPost()
    const originalValue = editor.value
    const file = new File([new Uint8Array(MAX_IMAGE_UPLOAD_BYTES + 1)], 'large.png', { type: 'image/png' })

    fireEvent.change(screen.getByLabelText('上传图片文件'), { target: { files: [file] } })

    expect(await screen.findByText('图片大小不能超过 10 MB。')).toBeTruthy()
    expect(editor.value).toBe(originalValue)
    expect(uploadImageFile).not.toHaveBeenCalled()
  })

  it('shows an error and keeps the draft unchanged when upload fails', async () => {
    vi.spyOn(githubClientModule, 'uploadImageFile').mockRejectedValue(new Error('upload failed'))

    const editor = await openPost()
    const originalValue = editor.value
    const file = new File(['image'], 'cover.png', { type: 'image/png' })

    fireEvent.change(screen.getByLabelText('上传图片文件'), { target: { files: [file] } })

    expect(await screen.findByText('upload failed')).toBeTruthy()
    expect(editor.value).toBe(originalValue)
  })

  it('logs out and returns to the login gate when upload hits auth expiry', async () => {
    vi.spyOn(githubClientModule, 'uploadImageFile').mockRejectedValue(new GitHubAuthError())

    await openPost()
    const file = new File(['image'], 'cover.png', { type: 'image/png' })

    fireEvent.change(screen.getByLabelText('上传图片文件'), { target: { files: [file] } })

    expect(await screen.findByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(screen.getByText('GitHub 会话已过期，请重新登录。')).toBeTruthy()
  })
})
