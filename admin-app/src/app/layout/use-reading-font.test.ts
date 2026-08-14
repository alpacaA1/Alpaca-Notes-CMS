import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import {
  useReadingFont,
  READING_FONT_FAMILIES,
  READING_FONT_FAMILY_DEFAULT,
  READING_FONT_SIZE_DEFAULT,
  READING_FONT_WEIGHT_DEFAULT,
} from './use-reading-font'

describe('useReadingFont', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('provides default font state', () => {
    const { result } = renderHook(() => useReadingFont())

    expect(result.current.fontSize).toBe(READING_FONT_SIZE_DEFAULT)
    expect(result.current.fontWeight).toBe(READING_FONT_WEIGHT_DEFAULT)
    expect(result.current.fontFamilyId).toBe(READING_FONT_FAMILY_DEFAULT)
    expect(result.current.fontFamily).toBe(READING_FONT_FAMILIES[0].value)
  })

  it('updates font family and persists to localStorage', () => {
    const { result } = renderHook(() => useReadingFont())

    act(() => {
      result.current.setFontFamilyId('serif')
    })

    expect(result.current.fontFamilyId).toBe('serif')
    expect(result.current.fontFamily).toContain('Songti SC')
    expect(localStorage.getItem('admin-preview-reading-font-family')).toBe('serif')
  })

  it('restores persisted font family from localStorage', () => {
    localStorage.setItem('admin-preview-reading-font-family', 'kaiti')

    const { result } = renderHook(() => useReadingFont())

    expect(result.current.fontFamilyId).toBe('kaiti')
    expect(result.current.fontFamily).toContain('Kaiti SC')
  })
})
