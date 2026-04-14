import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPostFile } from './github-client'

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
})
