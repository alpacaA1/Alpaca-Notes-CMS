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

  it('caches the translation and does not call fetch again for the same text', async () => {
    window.localStorage.clear()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        translatedText: '# 译文内容',
        model: 'test-translate-model',
      }),
    } as Response)

    // First call: calls fetch
    const result1 = await translateReadLaterContent(
      { token: 'token-xyz' },
      { text: 'Hello' }
    )
    expect(result1.translatedText).toBe('# 译文内容')
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Second call: retrieves from cache, does not call fetch
    const result2 = await translateReadLaterContent(
      { token: 'token-xyz' },
      { text: 'Hello' }
    )
    expect(result2.translatedText).toBe('# 译文内容')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('calls fetch again if cache is expired', async () => {
    window.localStorage.clear()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        translatedText: '# 新译文',
        model: 'test-translate-model',
      }),
    } as Response)

    await translateReadLaterContent(
      { token: 'token-xyz' },
      { text: 'Hello' }
    )
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    // Manually modify the timestamp in localStorage to be expired (8 days ago)
    const cachedStr = window.localStorage.getItem('alpaca-translation-cache')
    expect(cachedStr).not.toBeNull()
    const cache = JSON.parse(cachedStr!)
    const keys = Object.keys(cache)
    expect(keys.length).toBe(1)
    const hashKey = keys[0]
    cache[hashKey].timestamp = Date.now() - (8 * 24 * 60 * 60 * 1000)
    window.localStorage.setItem('alpaca-translation-cache', JSON.stringify(cache))

    // Call again: should call fetch again
    const result = await translateReadLaterContent(
      { token: 'token-xyz' },
      { text: 'Hello' }
    )
    expect(result.translatedText).toBe('# 新译文')
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

