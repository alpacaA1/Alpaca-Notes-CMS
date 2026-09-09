import { describe, expect, it, vi } from 'vitest'
import { buildBookAnnotationIndex, cleanBookChapterTitle } from './book-annotation-index'
import * as bookStoreModule from './book-store'
import type { BookAnnotation, StoredBookMeta } from './book-types'

vi.mock('./book-store', () => ({
  listBookAnnotations: vi.fn(),
}))

describe('book-annotation-index', () => {
  it('cleans fallback placeholder chapter names and preserves real chapter names', () => {
    expect(cleanBookChapterTitle('划线片段')).toBeNull()
    expect(cleanBookChapterTitle('读书想法')).toBeNull()
    expect(cleanBookChapterTitle('未知章节')).toBeNull()
    expect(cleanBookChapterTitle('未知页码')).toBeNull()
    expect(cleanBookChapterTitle('电子书章节')).toBeNull()
    expect(cleanBookChapterTitle('')).toBeNull()
    expect(cleanBookChapterTitle('   ')).toBeNull()
    expect(cleanBookChapterTitle(null)).toBeNull()
    expect(cleanBookChapterTitle(undefined)).toBeNull()

    expect(cleanBookChapterTitle('第一章 神经症的文化含义')).toBe('第一章 神经症的文化含义')
    expect(cleanBookChapterTitle(' 第 3 节 关键理论  ')).toBe('第 3 节 关键理论')
    expect(cleanBookChapterTitle('Chapter 4: The Mind')).toBe('Chapter 4: The Mind')
  })

  it('builds book annotation index with proper chapterTitle and search text', async () => {
    const mockBooks: StoredBookMeta[] = [
      {
        id: 'book-weread-1',
        title: '我们时代的神经营症人格',
        creator: '卡伦·霍妮',
        format: 'epub',
        addedAt: '2026-05-01T10:00:00.000Z',
      },
    ]

    const mockAnnotations: BookAnnotation[] = [
      {
        id: 'ann-1',
        bookId: 'book-weread-1',
        value: 'val-1',
        color: '#D4A574',
        quote: '每个人都会在一定程度上受到焦虑的影响。',
        note: '值得深思',
        chapter: '第一章 神经症的文化含义',
        createdAt: '2026-05-01T10:05:00.000Z',
        updatedAt: '2026-05-01T10:05:00.000Z',
      },
      {
        id: 'ann-2',
        bookId: 'book-weread-1',
        value: 'val-2',
        color: '#D4A574',
        quote: '另一段无章节划线。',
        note: '',
        chapter: '划线片段',
        createdAt: '2026-05-01T10:00:00.000Z',
        updatedAt: '2026-05-01T10:00:00.000Z',
      },
    ]

    vi.spyOn(bookStoreModule, 'listBookAnnotations').mockResolvedValue(mockAnnotations)

    const indexItems = await buildBookAnnotationIndex(mockBooks)

    expect(indexItems).toHaveLength(2)
    expect(indexItems[0].chapterTitle).toBe('第一章 神经症的文化含义')
    expect(indexItems[0].searchText).toContain('第一章 神经症的文化含义')
    expect(indexItems[0].postTitle).toBe('我们时代的神经营症人格')

    expect(indexItems[1].chapterTitle).toBeNull()
    expect(indexItems[1].sectionLabel).toBe('电子书章节')
  })
})
