import { describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBooksState } from './use-books-state'

vi.mock('../books/book-store', () => ({
  listBookMetas: vi.fn().mockResolvedValue([]),
  countBookAnnotations: vi.fn().mockResolvedValue({}),
  getBookFile: vi.fn().mockResolvedValue(null),
  putBook: vi.fn().mockResolvedValue(undefined),
  putBookMeta: vi.fn().mockResolvedValue(undefined),
  deleteBook: vi.fn().mockResolvedValue(undefined),
}))

describe('useBooksState hook', () => {
  it('initializes with empty book metas and state', () => {
    const setError = vi.fn()
    const setSuccess = vi.fn()
    const { result } = renderHook(() => useBooksState(true, 'books', setError, setSuccess))

    expect(result.current.bookMetas).toEqual([])
    expect(result.current.isBooksLoading).toBe(true)
    expect(result.current.isBookReaderOpen).toBe(false)
  })
})
