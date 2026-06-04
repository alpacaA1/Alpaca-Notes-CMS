import { afterEach, describe, expect, it, vi } from 'vitest'
import { FEED_DIRECTORY_URL } from '../config'
import { fetchFeedDirectory } from './feed-directory-client'

describe('fetchFeedDirectory', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns normalized shared feed categories', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        categories: [
          {
            category: 'AI 实验室',
            feeds: [
              {
                id: 1,
                title: 'Claude Blog',
                url: 'https://example.com/feed.xml',
                category: 'AI 实验室',
                articleCount: 158,
                lastSuccessAt: '2026-06-04T06:30:50.355763Z',
                intro: {
                  content: '关注 Claude 产品与工程更新。',
                },
              },
            ],
          },
        ],
      }),
    } as Response)

    const result = await fetchFeedDirectory({ token: 'token-1' })

    expect(result).toEqual([
      {
        category: 'AI 实验室',
        feeds: [
          {
            id: '1',
            title: 'Claude Blog',
            url: 'https://example.com/feed.xml',
            category: 'AI 实验室',
            intro: '关注 Claude 产品与工程更新。',
            articleCount: 158,
            lastSuccessAt: '2026-06-04T06:30:50.355763Z',
          },
        ],
      },
    ])
    expect(fetchSpy).toHaveBeenCalledWith(FEED_DIRECTORY_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer token-1',
      },
    })
  })

  it('throws auth errors on 401 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'GitHub 会话已过期，请重新登录。' }),
    } as Response)

    await expect(fetchFeedDirectory({ token: 'token-1' })).rejects.toEqual(
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

    await expect(fetchFeedDirectory({ token: 'token-1' })).rejects.toThrow('加载共享 RSS 源目录失败。')
  })
})
