import { useCallback, useEffect, useState } from 'react'

export const READING_FONT_SIZE_MIN = 14
export const READING_FONT_SIZE_MAX = 24
export const READING_FONT_SIZE_DEFAULT = 16

export type ReadingFontWeight = {
  label: string
  value: number
}

export const READING_FONT_WEIGHTS: readonly ReadingFontWeight[] = [
  { label: '细体', value: 300 },
  { label: '常规', value: 400 },
  { label: '中等', value: 500 },
  { label: '半粗', value: 600 },
  { label: '粗体', value: 700 },
] as const

export const READING_FONT_WEIGHT_DEFAULT = 400

const FONT_SIZE_STORAGE_KEY = 'admin-preview-reading-font-size'
const FONT_WEIGHT_STORAGE_KEY = 'admin-preview-reading-font-weight'

function clampFontSize(value: number) {
  if (!Number.isFinite(value)) {
    return READING_FONT_SIZE_DEFAULT
  }

  return Math.min(READING_FONT_SIZE_MAX, Math.max(READING_FONT_SIZE_MIN, Math.round(value)))
}

function readStoredFontSize(): number | null {
  try {
    const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY)
    if (!stored) {
      return null
    }

    const parsed = Number.parseInt(stored, 10)
    if (!Number.isFinite(parsed)) {
      return null
    }

    return clampFontSize(parsed)
  } catch {
    return null
  }
}

function readStoredFontWeightIndex(): number | null {
  try {
    const stored = localStorage.getItem(FONT_WEIGHT_STORAGE_KEY)
    if (!stored) {
      return null
    }

    const parsed = Number.parseInt(stored, 10)
    const index = READING_FONT_WEIGHTS.findIndex((option) => option.value === parsed)
    if (index < 0) {
      return null
    }

    return index
  } catch {
    return null
  }
}

function persistFontSize(value: number) {
  try {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(value))
  } catch {
    // Ignore
  }
}

function persistFontWeightIndex(index: number) {
  try {
    localStorage.setItem(FONT_WEIGHT_STORAGE_KEY, String(READING_FONT_WEIGHTS[index]?.value ?? READING_FONT_WEIGHT_DEFAULT))
  } catch {
    // Ignore
  }
}

export type ReadingFontState = {
  fontSize: number
  fontWeightIndex: number
  fontWeight: number
  fontWeightLabel: string
  setFontSize: (next: number) => void
  setFontWeightIndex: (next: number) => void
}

export function useReadingFont(): ReadingFontState {
  const [fontSize, setFontSizeState] = useState<number>(() => readStoredFontSize() ?? READING_FONT_SIZE_DEFAULT)
  const [fontWeightIndex, setFontWeightIndexState] = useState<number>(() => readStoredFontWeightIndex() ?? 1)

  useEffect(() => {
    const storedSize = readStoredFontSize()
    if (storedSize !== null) {
      setFontSizeState(storedSize)
    }

    const storedWeightIndex = readStoredFontWeightIndex()
    if (storedWeightIndex !== null) {
      setFontWeightIndexState(storedWeightIndex)
    }
  }, [])

  const setFontSize = useCallback((next: number) => {
    setFontSizeState(clampFontSize(next))
  }, [])

  const setFontWeightIndex = useCallback((next: number) => {
    const clampedIndex = Math.min(READING_FONT_WEIGHTS.length - 1, Math.max(0, Math.round(next)))
    setFontWeightIndexState(clampedIndex)
  }, [])

  useEffect(() => {
    persistFontSize(fontSize)
  }, [fontSize])

  useEffect(() => {
    persistFontWeightIndex(fontWeightIndex)
  }, [fontWeightIndex])

  const fontWeight = READING_FONT_WEIGHTS[fontWeightIndex]?.value ?? READING_FONT_WEIGHT_DEFAULT
  const fontWeightLabel = READING_FONT_WEIGHTS[fontWeightIndex]?.label ?? '常规'

  return {
    fontSize,
    fontWeightIndex,
    fontWeight,
    fontWeightLabel,
    setFontSize,
    setFontWeightIndex,
  }
}