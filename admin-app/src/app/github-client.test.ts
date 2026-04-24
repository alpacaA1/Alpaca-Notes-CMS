import { afterEach, describe, expect, it, vi } from 'vitest'
import { REPO_BRANCH } from './config'
import { deletePostFile, fetchPostFile, uploadImageFile } from './github-client'

const chineseMarkdown = `---
title: 中文标题
categories:
  - 专业
tags:
  - 产品
desc: 中文摘要
---

正文中文内容。`

describe('github client encoding', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('decodes UTF-8 markdown content from GitHub base64 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'file',
        path: 'source/_posts/chinese.md',
        sha: 'sha-1',
        encoding: 'base64',
        content: Buffer.from(chineseMarkdown, 'utf8').toString('base64'),
      }),
    } as Response)

    const file = await fetchPostFile({ token: 'token' }, 'source/_posts/chinese.md')

    expect(file.content).toBe(chineseMarkdown)
  })

  it('bypasses browser caches when fetching a post file after saves', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'file',
        path: 'source/_posts/chinese.md',
        sha: 'sha-1',
        encoding: 'base64',
        content: Buffer.from(chineseMarkdown, 'utf8').toString('base64'),
      }),
    } as Response)

    await fetchPostFile({ token: 'token' }, 'source/_posts/chinese.md')

    const [, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(requestInit.cache).toBe('no-store')
  })

  it('uploads image files with base64 content from binary bytes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        content: {
          path: 'source/images/2026/04/example.png',
          sha: 'image-sha',
        },
      }),
    } as Response)

    const bytes = Uint8Array.of(0x00, 0xff, 0x10, 0x80)
    const file = new File([bytes], 'example.png', {
      type: 'image/png',
    })
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(bytes.buffer),
    })

    const uploaded = await uploadImageFile(
      { token: 'token' },
      { path: 'source/images/2026/04/example.png', file },
    )

    expect(uploaded).toEqual({
      path: 'source/images/2026/04/example.png',
      sha: 'image-sha',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toMatch(
      /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/contents\//,
    )
    expect(requestUrl).toContain('/contents/source/images/2026/04/example.png')
    expect(requestInit.method).toBe('PUT')
    expect(requestInit.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer token',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    })
    expect(JSON.parse(String(requestInit.body))).toEqual({
      message: 'Create source/images/2026/04/example.png',
      content: Buffer.from(bytes).toString('base64'),
      branch: REPO_BRANCH,
    })
  })

  it('deletes post files with sha and branch metadata', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response)

    await deletePostFile({ token: 'token' }, { path: 'source/_posts/delete-me.md', sha: 'delete-sha' })

    const [requestUrl, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(requestUrl).toContain('/contents/source/_posts/delete-me.md')
    expect(requestInit.method).toBe('DELETE')
    expect(requestInit.headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer token',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    })
    expect(JSON.parse(String(requestInit.body))).toEqual({
      message: 'Delete source/_posts/delete-me.md',
      sha: 'delete-sha',
      branch: REPO_BRANCH,
    })
  })
})
