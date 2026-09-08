import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchMusicOnline } from './music-search-client'

describe('music-search-client', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns empty array for empty query', async () => {
    const results = await searchMusicOnline('   ')
    expect(results).toEqual([])
  })

  it('parses LRCLIB search results and deduplicates', async () => {
    const mockLrclibData = [
      { id: 1, trackName: '晴天', artistName: '周杰伦', albumName: '叶惠美' },
      { id: 2, trackName: '晴天', artistName: '周杰伦', albumName: '单曲' }, // duplicate title+artist
      { id: 3, trackName: '晴天 (Live)', artistName: '周杰伦', albumName: '演唱会' },
    ]

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockLrclibData,
    })

    const results = await searchMusicOnline('晴天 周杰伦')
    expect(results).toHaveLength(2)
    expect(results[0]).toEqual({
      id: 'lrclib-1',
      title: '晴天',
      artist: '周杰伦',
      album: '叶惠美',
    })
    expect(results[1]).toEqual({
      id: 'lrclib-3',
      title: '晴天 (Live)',
      artist: '周杰伦',
      album: '演唱会',
    })
  })

  it('falls back to iTunes if LRCLIB fails', async () => {
    const mockITunesData = {
      results: [
        { trackId: 101, trackName: '平凡之路', artistName: '朴树', collectionName: '猎户星座' },
      ],
    }

    globalThis.fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error on lrclib'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockITunesData,
      })

    const results = await searchMusicOnline('平凡之路')
    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      id: 'itunes-101',
      title: '平凡之路',
      artist: '朴树',
      album: '猎户星座',
    })
  })
})
