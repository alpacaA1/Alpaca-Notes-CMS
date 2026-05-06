import { afterEach, describe, expect, it, vi } from 'vitest'
import { DIARY_AI_URL } from '../config'
import { organizeDiaryMaterials } from './diary-ai-client'

describe('organizeDiaryMaterials', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts selected diary entries to the diary ai endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        materialMarkdown: '  # 日记素材整理\n\n- 素材  ',
        model: 'test-model',
      }),
    } as Response)

    const result = await organizeDiaryMaterials(
      { token: 'token-1' },
      [
        {
          path: 'source/diary/20260505010101.md',
          title: '五月日记',
          date: '2026-05-05 01:01:01',
          body: '今天继续整理素材。',
        },
      ],
    )

    expect(result).toEqual({
      materialMarkdown: '# 日记素材整理\n\n- 素材',
      model: 'test-model',
    })
    expect(fetchSpy).toHaveBeenCalledWith(DIARY_AI_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer token-1',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        entries: [
          {
            path: 'source/diary/20260505010101.md',
            title: '五月日记',
            date: '2026-05-05 01:01:01',
            body: '今天继续整理素材。',
          },
        ],
      }),
    })
  })

  it('throws GitHubAuthError on 401 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'GitHub 会话已过期，请重新登录。' }),
    } as Response)

    await expect(organizeDiaryMaterials({ token: 'token-1' }, [])).rejects.toEqual(
      expect.objectContaining({
        name: 'GitHubAuthError',
        message: 'GitHub 会话已过期，请重新登录。',
      }),
    )
  })

  it('throws when the successful response has no material markdown', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ materialMarkdown: '' }),
    } as Response)

    await expect(organizeDiaryMaterials({ token: 'token-1' }, [])).rejects.toThrow('素材整理结果为空，请稍后重试。')
  })
})
