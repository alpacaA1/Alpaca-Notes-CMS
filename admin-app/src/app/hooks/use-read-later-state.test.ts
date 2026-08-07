import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReadLaterState } from './use-read-later-state'

vi.mock('../read-later/import-client', () => ({
  importReadLaterFromUrl: vi.fn().mockResolvedValue({ title: '测试文章', body: '测试内容' }),
}))

describe('useReadLaterState hook', () => {
  it('initializes with default values', () => {
    const setError = vi.fn()
    const setSuccess = vi.fn()
    const { result } = renderHook(() => useReadLaterState(null, setError, setSuccess))

    expect(result.current.isImportingReadLater).toBe(false)
    expect(result.current.importedArticle).toBeNull()
  })
})
