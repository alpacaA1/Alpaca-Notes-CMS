import { useCallback, useEffect, useState } from 'react'

type ColorMode = 'light' | 'dark'

const STORAGE_KEY = 'admin-color-mode'

function getSystemPreference(): ColorMode {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredMode(): ColorMode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  } catch {
    // localStorage may not be available
  }

  return null
}

function persistMode(mode: ColorMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    // Ignore
  }
}

export function useColorMode() {
  const [mode, setMode] = useState<ColorMode>(() => readStoredMode() ?? getSystemPreference())

  useEffect(() => {
    const stored = readStoredMode()
    if (stored) {
      setMode(stored)
    }
  }, [])

  const toggle = useCallback(() => {
    setMode((current) => {
      const next = current === 'light' ? 'dark' : 'light'
      persistMode(next)
      return next
    })
  }, [])

  const isDark = mode === 'dark'

  return { mode, isDark, toggle }
}
