import { describe, expect, it, vi } from 'vitest'
import {
  mergeBooksData,
  parseBooksLibrary,
  serializeBooksLibrary,
  syncBooksWithGitHub,
} from './book-sync'
import type { BookAnnotation, RemoteBookItem, StoredBookMeta } from './book-types'

vi.mock('./book-store', () => ({
  listBookMetas: vi.fn(),
  listAllBookAnnotations: vi.fn(),
  putBookMeta: vi.fn(),
  putBookAnnotation: vi.fn(),
}))

vi.mock('../github-client', () => ({
  fetchTextFile: vi.fn(),
  saveTextFile: vi.fn(),
}))

describe('book-sync', () => {
  it('parses and serializes books library correctly', () => {
    const rawJson = JSON.stringify({
      version: 1,
      updatedAt: '2026-08-25T10:00:00.000Z',
      books: [
        {
          id: 'book-1',
          title: '测试书籍',
          creator: '测试作者',
          format: 'epub',
          coverSeed: 12345,
          addedAt: '2026-08-20T10:00:00.000Z',
          lastOpenedAt: '2026-08-25T08:00:00.000Z',
          progressFraction: 0.42,
          progressCfi: 'epubcfi(/6/2[chapter1]!/4/1:0)',
          annotations: [
            {
              id: 'ann-1',
              bookId: 'book-1',
              value: 'cfi-val',
              color: '#D4A574',
              quote: '划线内容',
              note: '笔记心得',
              chapter: '第一章',
              createdAt: '2026-08-25T08:10:00.000Z',
              updatedAt: '2026-08-25T08:10:00.000Z',
            },
          ],
        },
      ],
    })

    const parsed = parseBooksLibrary(rawJson)
    expect(parsed.version).toBe(1)
    expect(parsed.books).toHaveLength(1)
    expect(parsed.books[0].title).toBe('测试书籍')
    expect(parsed.books[0].annotations).toHaveLength(1)

    const serialized = serializeBooksLibrary(parsed)
    expect(serialized).toContain('测试书籍')
    expect(serialized).toContain('epubcfi')
  })

  it('handles invalid json gracefully by throwing descriptive error', () => {
    expect(() => parseBooksLibrary('invalid-json{')).toThrow('云端书库数据格式错误')
  })

  it('merges local and remote books and annotations seamlessly', () => {
    const localBooks: Array<{ meta: StoredBookMeta; annotations: BookAnnotation[] }> = [
      {
        meta: {
          id: 'local-only-book',
          title: '本地专有书',
          creator: '作者 A',
          format: 'epub',
          coverBlob: null,
          coverSeed: 111,
          addedAt: '2026-08-01T00:00:00.000Z',
          lastOpenedAt: '2026-08-01T10:00:00.000Z',
          progressFraction: 0.1,
          progressCfi: 'cfi-1',
        },
        annotations: [],
      },
      {
        meta: {
          id: 'shared-book',
          title: '共享书籍',
          creator: '作者 B',
          format: 'pdf',
          coverBlob: null,
          coverSeed: 222,
          addedAt: '2026-08-01T00:00:00.000Z',
          lastOpenedAt: '2026-08-20T10:00:00.000Z',
          progressFraction: 0.3,
          progressCfi: null,
          progressPage: 15,
          pageCount: 100,
        },
        annotations: [
          {
            id: 'ann-local',
            bookId: 'shared-book',
            value: 'page-10',
            color: '#D4A574',
            quote: '本地划线',
            note: '本地想法',
            chapter: '第1节',
            createdAt: '2026-08-10T00:00:00.000Z',
            updatedAt: '2026-08-10T00:00:00.000Z',
          },
          {
            id: 'ann-conflict',
            bookId: 'shared-book',
            value: 'page-12',
            color: '#D4A574',
            quote: '冲突划线',
            note: '旧笔记',
            chapter: '第2节',
            createdAt: '2026-08-10T00:00:00.000Z',
            updatedAt: '2026-08-10T00:00:00.000Z',
          },
        ],
      },
    ]

    const remoteBooks: RemoteBookItem[] = [
      {
        id: 'remote-only-book',
        title: '云端专有书',
        creator: '作者 C',
        format: 'epub',
        coverSeed: 333,
        addedAt: '2026-08-05T00:00:00.000Z',
        lastOpenedAt: '2026-08-05T12:00:00.000Z',
        progressFraction: 0.5,
        progressCfi: 'cfi-remote',
        annotations: [],
      },
      {
        id: 'shared-book',
        title: '共享书籍',
        creator: '作者 B',
        format: 'pdf',
        coverSeed: 222,
        addedAt: '2026-08-01T00:00:00.000Z',
        // Remote is newer: 2026-08-25 vs local 2026-08-20
        lastOpenedAt: '2026-08-25T10:00:00.000Z',
        progressFraction: 0.8,
        progressCfi: null,
        progressPage: 80,
        pageCount: 100,
        annotations: [
          {
            id: 'ann-remote-only',
            bookId: 'shared-book',
            value: 'page-50',
            color: '#D4A574',
            quote: '云端新增划线',
            note: '云端想法',
            chapter: '第5节',
            createdAt: '2026-08-24T00:00:00.000Z',
            updatedAt: '2026-08-24T00:00:00.000Z',
          },
          {
            id: 'ann-conflict',
            bookId: 'shared-book',
            value: 'page-12',
            color: '#D4A574',
            quote: '冲突划线',
            note: '新修改的笔记',
            chapter: '第2节',
            createdAt: '2026-08-10T00:00:00.000Z',
            updatedAt: '2026-08-25T00:00:00.000Z',
          },
        ],
      },
    ]

    const result = mergeBooksData(localBooks, remoteBooks)

    // Should contain all 3 books
    expect(result.mergedRemoteBooks).toHaveLength(3)
    expect(result.mergedLocalItems).toHaveLength(3)

    // Check shared book progress took the newer remote one
    const sharedRemote = result.mergedRemoteBooks.find((b) => b.id === 'shared-book')
    expect(sharedRemote?.progressFraction).toBe(0.8)
    expect(sharedRemote?.progressPage).toBe(80)

    // Check merged annotations (should have ann-local, ann-remote-only, and newer ann-conflict)
    expect(sharedRemote?.annotations).toHaveLength(3)
    const conflictAnn = sharedRemote?.annotations.find((a) => a.id === 'ann-conflict')
    expect(conflictAnn?.note).toBe('新修改的笔记')

    // Local items should also have the remote-only book
    const remoteOnlyInLocal = result.mergedLocalItems.find((item) => item.meta.id === 'remote-only-book')
    expect(remoteOnlyInLocal).toBeDefined()
    expect(remoteOnlyInLocal?.meta.title).toBe('云端专有书')
  })

  it('runs syncBooksWithGitHub end-to-end', async () => {
    const { listBookMetas, listAllBookAnnotations, putBookMeta, putBookAnnotation } = await import(
      './book-store'
    )
    const { fetchTextFile, saveTextFile } = await import('../github-client')

    vi.mocked(listBookMetas).mockResolvedValue([
      {
        id: 'book-1',
        title: '测试一',
        creator: '作者一',
        format: 'epub',
        coverBlob: null,
        coverSeed: 1,
        addedAt: '2026-08-01T00:00:00.000Z',
        lastOpenedAt: '2026-08-01T00:00:00.000Z',
        progressFraction: 0.1,
        progressCfi: null,
      },
    ])
    vi.mocked(listAllBookAnnotations).mockResolvedValue([])

    vi.mocked(fetchTextFile).mockResolvedValue({
      path: 'source/_data/books-library.json',
      sha: 'test-sha',
      content: JSON.stringify({
        version: 1,
        updatedAt: '2026-08-01T00:00:00.000Z',
        books: [],
      }),
    })

    vi.mocked(saveTextFile).mockResolvedValue({
      path: 'source/_data/books-library.json',
      sha: 'new-sha',
      content: '',
    })

    const syncResult = await syncBooksWithGitHub({
      token: 'test-token',
      login: 'alpacaA1',
      name: 'Alpaca',
      avatarUrl: '',
    })

    expect(syncResult.syncedCount).toBe(1)
    expect(putBookMeta).toHaveBeenCalled()
    expect(saveTextFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        path: 'source/_data/books-library.json',
        sha: 'test-sha',
      }),
    )
  })
})
