import { afterEach, describe, expect, it, vi } from 'vitest'
import { READ_LATER_IMPORT_URL } from '../config'
import { GitHubAuthError } from '../github-client'
import { importReadLaterFromUrl } from './import-client'

describe('importReadLaterFromUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns imported article payload', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        title: '导入标题',
        desc: '导入摘要',
        sourceName: '来源站点',
        markdown: '  正文内容  ',
        requestedUrl: 'https://example.com/requested',
        finalUrl: 'https://example.com/final',
      }),
    } as Response)

    const result = await importReadLaterFromUrl({ token: 'token-1' }, 'https://example.com/requested')

    expect(result).toEqual({
      title: '导入标题',
      desc: '导入摘要',
      sourceName: '来源站点',
      markdown: '正文内容',
      requestedUrl: 'https://example.com/requested',
      finalUrl: 'https://example.com/final',
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      `${READ_LATER_IMPORT_URL}?url=${encodeURIComponent('https://example.com/requested')}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer token-1',
        },
      },
    )
  })

  it('throws GitHubAuthError on 401 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'GitHub 会话已过期，请重新登录。' }),
    } as Response)

    await expect(importReadLaterFromUrl({ token: 'token-1' }, 'https://example.com/requested')).rejects.toEqual(
      expect.objectContaining({
        message: 'GitHub 会话已过期，请重新登录。',
        name: 'GitHubAuthError',
      }),
    )
  })

  it('throws a fallback error when the response body is invalid', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid json')
      },
    } as Response)

    await expect(importReadLaterFromUrl({ token: 'token-1' }, 'https://example.com/requested')).rejects.toThrow('导入正文失败。')
  })

  it('throws when markdown is missing from a successful response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        title: '导入标题',
      }),
    } as Response)

    await expect(importReadLaterFromUrl({ token: 'token-1' }, 'https://example.com/requested')).rejects.toThrow('导入结果不完整，请稍后重试。')
  })
})
