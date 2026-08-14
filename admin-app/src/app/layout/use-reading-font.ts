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

export type ReadingFontFamilyOption = {
  id: string
  label: string
  value: string
}

export const READING_FONT_FAMILIES: readonly ReadingFontFamilyOption[] = [
  {
    id: 'sans',
    label: '黑体',
    value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif',
  },
  {
    id: 'serif',
    label: '宋体',
    value: '"New York", "Charter", "Georgia", "Songti SC", "Noto Serif SC", "Source Han Serif SC", "STSong", serif',
  },
  {
    id: 'kaiti',
    label: '楷体',
    value: '"Kaiti SC", "STKaiti", "KaiTi", "Noto Serif SC", serif',
  },
  {
    id: 'mono',
    label: '等宽',
    value: '"JetBrains Mono", "SF Mono", "Fira Code", "Cascadia Code", Consolas, "PingFang SC", monospace',
  },
] as const

export const READING_FONT_FAMILY_DEFAULT = 'sans'

const FONT_SIZE_STORAGE_KEY = 'admin-preview-reading-font-size'
const FONT_WEIGHT_STORAGE_KEY = 'admin-preview-reading-font-weight'
const FONT_FAMILY_STORAGE_KEY = 'admin-preview-reading-font-family'

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

function readStoredFontFamilyId(): string | null {
  try {
    const stored = localStorage.getItem(FONT_FAMILY_STORAGE_KEY)
    if (!stored) {
      return null
    }

    const matched = READING_FONT_FAMILIES.find((option) => option.id === stored)
    return matched ? matched.id : null
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

function persistFontFamilyId(id: string) {
  try {
    localStorage.setItem(FONT_FAMILY_STORAGE_KEY, id)
  } catch {
    // Ignore
  }
}

export type ReadingFontState = {
  fontSize: number
  fontWeightIndex: number
  fontWeight: number
  fontWeightLabel: string
  fontFamilyId: string
  fontFamily: string
  setFontSize: (next: number) => void
  setFontWeightIndex: (next: number) => void
  setFontFamilyId: (id: string) => void
}

export function useReadingFont(): ReadingFontState {
  const [fontSize, setFontSizeState] = useState<number>(() => readStoredFontSize() ?? READING_FONT_SIZE_DEFAULT)
  const [fontWeightIndex, setFontWeightIndexState] = useState<number>(() => readStoredFontWeightIndex() ?? 1)
  const [fontFamilyId, setFontFamilyIdState] = useState<string>(() => readStoredFontFamilyId() ?? READING_FONT_FAMILY_DEFAULT)

  useEffect(() => {
    const storedSize = readStoredFontSize()
    if (storedSize !== null) {
      setFontSizeState(storedSize)
    }

    const storedWeightIndex = readStoredFontWeightIndex()
    if (storedWeightIndex !== null) {
      setFontWeightIndexState(storedWeightIndex)
    }

    const storedFamilyId = readStoredFontFamilyId()
    if (storedFamilyId !== null) {
      setFontFamilyIdState(storedFamilyId)
    }
  }, [])

  const setFontSize = useCallback((next: number) => {
    setFontSizeState(clampFontSize(next))
  }, [])

  const setFontWeightIndex = useCallback((next: number) => {
    const clampedIndex = Math.min(READING_FONT_WEIGHTS.length - 1, Math.max(0, Math.round(next)))
    setFontWeightIndexState(clampedIndex)
  }, [])

  const setFontFamilyId = useCallback((id: string) => {
    const matched = READING_FONT_FAMILIES.find((option) => option.id === id)
    if (matched) {
      setFontFamilyIdState(matched.id)
    }
  }, [])

  useEffect(() => {
    persistFontSize(fontSize)
  }, [fontSize])

  useEffect(() => {
    persistFontWeightIndex(fontWeightIndex)
  }, [fontWeightIndex])

  useEffect(() => {
    persistFontFamilyId(fontFamilyId)
  }, [fontFamilyId])

  const fontWeight = READING_FONT_WEIGHTS[fontWeightIndex]?.value ?? READING_FONT_WEIGHT_DEFAULT
  const fontWeightLabel = READING_FONT_WEIGHTS[fontWeightIndex]?.label ?? '常规'
  const fontFamily = READING_FONT_FAMILIES.find((option) => option.id === fontFamilyId)?.value ?? READING_FONT_FAMILIES[0].value

  return {
    fontSize,
    fontWeightIndex,
    fontWeight,
    fontWeightLabel,
    fontFamilyId,
    fontFamily,
    setFontSize,
    setFontWeightIndex,
    setFontFamilyId,
  }
}