import { afterEach, describe, expect, it, vi } from 'vitest'
import { TRANSLATE_READ_LATER_URL } from '../config'
import { translateReadLaterContent } from './translate-client'

describe('translateReadLaterContent', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts text payload to translate-read-later endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        translatedText: '# 译文标题\n\n正文译文',
        model: 'test-translate-model',
      }),
    } as Response)

    const result = await translateReadLaterContent(
      { token: 'token-xyz' },
      {
        title: 'Original Title',
        text: '# Original Title\n\nOriginal body',
      },
    )

    expect(result).toEqual({
      translatedText: '# 译文标题\n\n正文译文',
      model: 'test-translate-model',
    })

    expect(fetchSpy).toHaveBeenCalledWith(TRANSLATE_READ_LATER_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer token-xyz',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Original Title',
        text: '# Original Title\n\nOriginal body',
      }),
    })
  })

  it('throws error when response is not ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        message: '未配置 AI 翻译模型密钥。',
      }),
    } as Response)

    await expect(
      translateReadLaterContent(
        { token: 'token-xyz' },
        { text: 'Sample' },
      ),
    ).rejects.toThrow('未配置 AI 翻译模型密钥。')
  })
})
