import { describe, expect, it, vi } from 'vitest'
import {
  enrichExistingWeReadAnnotations,
  fetchWeReadBookmarks,
  fetchWeReadChapters,
  fetchWeReadNotebooks,
  fetchWeReadThoughts,
  maskWeReadApiKey,
  requestWeReadGateway,
  syncAllWeReadNotebooks,
  transformWeReadBookData,
  type WeReadBookmarkItem,
  type WeReadNotebookItem,
  type WeReadThoughtItem,
} from './weread-client'
import { listBookAnnotations, putBookAnnotation } from './book-store'

vi.mock('./book-store', () => ({
  putBookMeta: vi.fn().mockResolvedValue(undefined),
  putBookAnnotation: vi.fn().mockResolvedValue(undefined),
  listBookAnnotations: vi.fn().mockResolvedValue([]),
}))

describe('weread-client', () => {
  it('masks apiKey correctly', () => {
    expect(maskWeReadApiKey('wrk-1234567890abcdef')).toBe('wrk-******cdef')
    expect(maskWeReadApiKey('')).toBe('')
    expect(maskWeReadApiKey('wrk-123')).toBe('wrk-******')
  })

  it('transforms WeRead book, bookmarks, and thoughts into structured annotations', () => {
    const notebook: WeReadNotebookItem = {
      bookId: '1001',
      book: {
        bookId: '1001',
        title: '置身事内',
        author: '兰小欢',
        cover: 'https://example.com/cover.jpg',
      },
      bookmarkCount: 2,
      thoughtCount: 1,
    }

    const bookmarks: WeReadBookmarkItem[] = [
      {
        bookmarkId: 'bm-1',
        chapterTitle: '第一章 微观机制',
        markText: '中国经济发展的一个核心特点是地方政府的主导作用。',
        createTime: 1700000000,
      },
      {
        bookmarkId: 'bm-2',
        chapterTitle: '第二章 土地财政',
        markText: '土地出让收入是地方财政的重要组成部分。',
        createTime: 1700001000,
      },
    ]

    const thoughts: WeReadThoughtItem[] = [
      {
        thought: {
          thoughtId: 'th-1',
          chapterTitle: '第一章 微观机制',
          abstract: '中国经济发展的一个核心特点是地方政府的主导作用。',
          content: '这句话精准概括了地方官员晋升激励与招商引资逻辑。',
          createTime: 1700002000,
        },
      },
      {
        thought: {
          thoughtId: 'th-2',
          chapterTitle: '结语',
          content: '全书总结非常精彩，推荐阅读！',
          createTime: 1700003000,
        },
      },
    ]

    const { meta, annotations } = transformWeReadBookData(notebook, bookmarks, thoughts)

    expect(meta.id).toBe('weread-1001')
    expect(meta.title).toBe('置身事内')
    expect(meta.creator).toBe('兰小欢')
    expect(meta.coverUrl).toBe('https://example.com/cover.jpg')

    // Expect 3 annotations (bm-1 merged with th-1, bm-2 standalone, th-2 standalone)
    expect(annotations).toHaveLength(3)

    // Check merged annotation (bm-1 + th-1)
    const mergedAnn = annotations.find((a) => a.quote.includes('地方政府的主导作用'))
    expect(mergedAnn).toBeDefined()
    expect(mergedAnn?.note).toBe('这句话精准概括了地方官员晋升激励与招商引资逻辑。')
    expect(mergedAnn?.chapter).toBe('第一章 微观机制')

    // Check standalone thought (th-2)
    const standaloneThought = annotations.find((a) => a.note.includes('全书总结非常精彩'))
    expect(standaloneThought).toBeDefined()
    expect(standaloneThought?.chapter).toBe('结语')
  })

  it('handles gateway requests with authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ books: [] }),
    })
    globalThis.fetch = mockFetch as unknown as typeof fetch

    const result = await requestWeReadGateway<{ books: unknown[] }>('wrk-test-key', '/user/notebooks')
    expect(result.books).toEqual([])
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(/(\/api\/weread|weread\.qq\.com)/),
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrk-test-key',
        },
        body: JSON.stringify({
          api_name: '/user/notebooks',
          skill_version: '1.0.3',
        }),
      }),
    )
  })

  it('throws friendly error on 401/403 authorization failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'Invalid token',
    }) as unknown as typeof fetch

    await expect(requestWeReadGateway('wrk-expired', '/user/notebooks')).rejects.toThrow(
      '微信读书 API Key 无效或未授权',
    )
  })

  it('runs syncAllWeReadNotebooks end-to-end', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (_, init) => {
      const body = JSON.parse(init?.body as string)
      if (body.api_name === '/user/notebooks') {
        return {
          ok: true,
          json: async () => ({
            books: [
              {
                bookId: 'book-42',
                book: { title: '思考，快与慢', author: '丹尼尔·卡尼曼' },
              },
            ],
          }),
        }
      }
      if (body.api_name === '/book/bookmarklist') {
        return {
          ok: true,
          json: async () => ({
            updated: [
              {
                bookmarkId: 'bm-42-1',
                chapterTitle: '系统1与系统2',
                markText: '系统1是自主运行的，无意识且快速。',
                createTime: 1690000000,
              },
            ],
          }),
        }
      }
      if (body.api_name === '/book/thoughtlist') {
        return {
          ok: true,
          json: async () => ({ thoughts: [] }),
        }
      }
      return { ok: true, json: async () => ({}) }
    }) as unknown as typeof fetch

    const progressLogs: string[] = []
    const result = await syncAllWeReadNotebooks('wrk-valid-key', (msg) => {
      progressLogs.push(msg)
    })

    expect(result.booksCount).toBe(1)
    expect(result.annotationsCount).toBe(1)
    expect(progressLogs.length).toBeGreaterThan(0)
  })

  it('fetches and parses chapter information correctly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { chapterUid: 1, title: '引言' },
          { chapterUid: 2, title: '第一章 认知偏差' },
          { chapterUid: 3, title: '第二章 启发式思考' },
        ],
      }),
    }) as unknown as typeof fetch

    const chapters = await fetchWeReadChapters('wrk-key', 'book-123')
    expect(chapters).toEqual({
      1: '引言',
      2: '第一章 认知偏差',
      3: '第二章 启发式思考',
    })
  })

  it('resolves chapter from chapterMap via chapterUid when chapterTitle is missing', () => {
    const notebook: WeReadNotebookItem = {
      bookId: '1002',
      book: { title: '思考，快与慢', author: '卡尼曼' },
    }

    const bookmarks: WeReadBookmarkItem[] = [
      {
        bookmarkId: 'bm-no-title',
        chapterUid: 2,
        markText: '大脑有两种主要的思考机制。',
        createTime: 1700000000,
      },
    ]

    const thoughts: WeReadThoughtItem[] = [
      {
        thought: {
          thoughtId: 'th-no-title',
          chapterUid: 3,
          abstract: '过度自信是人类认知最根本的偏见。',
          content: '非常发人深省。',
          createTime: 1700001000,
        },
      },
    ]

    const chapterMap = {
      2: '第一章 系统1与系统2',
      3: '第二章 启发法与偏见',
    }

    const { annotations } = transformWeReadBookData(notebook, bookmarks, thoughts, chapterMap)
    expect(annotations).toHaveLength(2)

    const bmAnn = annotations.find((a) => a.quote.includes('大脑有两种主要的思考机制'))
    expect(bmAnn?.chapter).toBe('第一章 系统1与系统2')

    const thAnn = annotations.find((a) => a.quote.includes('过度自信'))
    expect(thAnn?.chapter).toBe('第二章 启发法与偏见')
  })

  it('enriches existing annotations that lack chapter names', async () => {
    const mockAnnotations = [
      {
        id: 'wr-bm-101',
        bookId: 'weread-999',
        value: '',
        color: '#D4A574',
        quote: '人类的非理性行为具有普遍性。',
        note: '',
        chapter: '划线片段',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ]

    vi.mocked(listBookAnnotations).mockResolvedValueOnce(mockAnnotations as any)

    globalThis.fetch = vi.fn().mockImplementation(async (_, init) => {
      const body = JSON.parse(init?.body as string)
      if (body.api_name === '/book/bookmarklist') {
        return {
          ok: true,
          json: async () => ({
            updated: [
              {
                bookmarkId: '101',
                chapterUid: 5,
                markText: '人类的非理性行为具有普遍性。',
              },
            ],
          }),
        }
      }
      if (body.api_name === '/book/chapterinfo') {
        return {
          ok: true,
          json: async () => ({
            data: [{ chapterUid: 5, title: '第五章 行为经济学基础' }],
          }),
        }
      }
      return { ok: true, json: async () => ({}) }
    }) as unknown as typeof fetch

    const books = [
      {
        id: 'weread-999',
        title: '怪诞行为学',
        creator: '丹·艾瑞里',
        format: 'epub' as const,
        addedAt: '2024-01-01T00:00:00.000Z',
      },
    ]

    const enrichedCount = await enrichExistingWeReadAnnotations('wrk-key', books)
    expect(enrichedCount).toBe(1)
    expect(putBookAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'wr-bm-101',
        chapter: '第五章 行为经济学基础',
      }),
    )
  })
})
