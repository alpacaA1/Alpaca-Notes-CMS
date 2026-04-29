import { afterEach, describe, expect, it, vi } from 'vitest'
import * as githubClientModule from '../github-client'
import { buildReadLaterIndex, parseReadLaterIndexItem } from './index-items'

const firstContent = `---
title: First article
permalink: read-later/first/
date: 2026-04-03 12:00:00
read_later: true
nav_exclude: true
external_url: https://example.com/first
source_name: Source A
reading_status: unread
tags:
  - 设计
desc: First desc
---

Body`

const secondContent = `---
title: Second article
permalink: read-later/second/
date: 2026-04-04 12:00:00
read_later: true
nav_exclude: true
external_url: https://example.com/second
source_name: Source B
reading_status: done
tags:
  - 产品
desc: Second desc
---

Body`

describe('read-later index helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    githubClientModule.clearMarkdownFileCache()
  })

  it('parses index metadata from frontmatter', () => {
    expect(
      parseReadLaterIndexItem({
        path: 'source/read-later-items/first.md',
        sha: 'sha-first',
        content: firstContent,
      }),
    ).toEqual({
      path: 'source/read-later-items/first.md',
      sha: 'sha-first',
      title: 'First article',
      date: '2026-04-03 12:00:00',
      desc: 'First desc',
      published: false,
      hasExplicitPublished: false,
      categories: [],
      tags: ['设计'],
      permalink: 'read-later/first/',
      cover: null,
      contentType: 'read-later',
      externalUrl: 'https://example.com/first',
      sourceName: 'Source A',
      readingStatus: 'unread',
    })
  })

  it('builds a date-desc sorted read-later index', async () => {
    vi.spyOn(githubClientModule, 'listReadLaterFiles').mockResolvedValue([
      { path: 'source/read-later-items/first.md', sha: 'sha-first', name: 'first.md', type: 'file' },
      { path: 'source/read-later-items/second.md', sha: 'sha-second', name: 'second.md', type: 'file' },
    ])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile')
      .mockResolvedValueOnce({ path: 'source/read-later-items/first.md', sha: 'sha-first', content: firstContent })
      .mockResolvedValueOnce({ path: 'source/read-later-items/second.md', sha: 'sha-second', content: secondContent })

    const items = await buildReadLaterIndex({ token: 'token' })

    expect(items.map((item) => item.title)).toEqual(['Second article', 'First article'])
  })

  it('builds the read-later index from sha-matched cached markdown without refetching files', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'file',
        path: 'source/read-later-items/first.md',
        sha: 'sha-first',
        encoding: 'base64',
        content: Buffer.from(firstContent, 'utf8').toString('base64'),
      }),
    } as Response)

    await githubClientModule.fetchMarkdownFile({ token: 'token' }, 'source/read-later-items/first.md')
    fetch.mockClear()

    vi.spyOn(githubClientModule, 'listReadLaterFiles').mockResolvedValue([
      { path: 'source/read-later-items/first.md', sha: 'sha-first', name: 'first.md', type: 'file' },
    ])
    const fetchMarkdownFile = vi.spyOn(githubClientModule, 'fetchMarkdownFile')

    const items = await buildReadLaterIndex({ token: 'token' })

    expect(items.map((item) => item.title)).toEqual(['First article'])
    expect(fetchMarkdownFile).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('refetches a read-later item when the cached sha is stale', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'file',
        path: 'source/read-later-items/first.md',
        sha: 'old-sha',
        encoding: 'base64',
        content: Buffer.from(firstContent, 'utf8').toString('base64'),
      }),
    } as Response)

    await githubClientModule.fetchMarkdownFile({ token: 'token' }, 'source/read-later-items/first.md')

    vi.spyOn(githubClientModule, 'listReadLaterFiles').mockResolvedValue([
      { path: 'source/read-later-items/first.md', sha: 'sha-second', name: 'first.md', type: 'file' },
    ])
    const fetchMarkdownFile = vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: 'source/read-later-items/first.md',
      sha: 'sha-second',
      content: secondContent,
    })

    const items = await buildReadLaterIndex({ token: 'token' })

    expect(fetchMarkdownFile).toHaveBeenCalledWith({ token: 'token' }, 'source/read-later-items/first.md')
    expect(items.map((item) => item.title)).toEqual(['Second article'])
  })
})
