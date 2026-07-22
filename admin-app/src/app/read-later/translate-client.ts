import { TRANSLATE_READ_LATER_URL } from '../config'
import { GitHubAuthError } from '../github-client'
import type { SessionState } from '../session'

export type TranslateReadLaterPayload = {
  title?: string
  text: string
  targetLang?: string
}

export type TranslateReadLaterResult = {
  translatedText: string
  model?: string
}

type TranslateReadLaterResponse = Partial<TranslateReadLaterResult> & {
  message?: string
}

function getStringHash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i)
  }
  return (hash >>> 0).toString(36)
}

const TRANSLATION_CACHE_KEY = 'alpaca-translation-cache'
const TRANSLATION_CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

interface TranslationCacheEntry {
  translatedText: string
  model?: string
  timestamp: number
}

function getCachedTranslation(text: string, title?: string): TranslateReadLaterResult | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }
  try {
    const cachedStr = window.localStorage.getItem(TRANSLATION_CACHE_KEY)
    if (!cachedStr) return null
    const cache = JSON.parse(cachedStr) as Record<string, TranslationCacheEntry>
    const hash = getStringHash(text + '|||' + (title || ''))
    const entry = cache[hash]
    if (entry && Date.now() - entry.timestamp < TRANSLATION_CACHE_EXPIRY_MS) {
      return {
        translatedText: entry.translatedText,
        ...(entry.model ? { model: entry.model } : {}),
      }
    }
  } catch {
    // Ignore cache errors
  }
  return null
}

function setCachedTranslation(text: string, title: string | undefined, result: TranslateReadLaterResult): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  try {
    const cachedStr = window.localStorage.getItem(TRANSLATION_CACHE_KEY)
    const cache = cachedStr ? (JSON.parse(cachedStr) as Record<string, TranslationCacheEntry>) : {}
    const hash = getStringHash(text + '|||' + (title || ''))
    
    const now = Date.now()
    const cleanedCache: Record<string, TranslationCacheEntry> = {}
    // Evict expired entries
    for (const [key, value] of Object.entries(cache)) {
      if (now - value.timestamp < TRANSLATION_CACHE_EXPIRY_MS) {
        cleanedCache[key] = value
      }
    }
    
    cleanedCache[hash] = {
      translatedText: result.translatedText,
      model: result.model,
      timestamp: now,
    }
    window.localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(cleanedCache))
  } catch {
    // Ignore cache errors
  }
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const message = (payload as TranslateReadLaterResponse).message
  return typeof message === 'string' ? message : ''
}

export async function translateReadLaterContent(
  session: SessionState,
  payloadData: TranslateReadLaterPayload,
): Promise<TranslateReadLaterResult> {
  const cached = getCachedTranslation(payloadData.text, payloadData.title)
  if (cached !== null) {
    return cached
  }

  let response: Response
  try {
    response = await fetch(TRANSLATE_READ_LATER_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payloadData),
    })
  } catch {
    throw new Error('无法连接翻译接口（接口未部署或 404 预检失败），请检查 Vercel 部署。')
  }

  let payload: TranslateReadLaterResponse | null = null
  try {
    payload = (await response.json()) as TranslateReadLaterResponse
  } catch {
    payload = null
  }

  if (response.status === 401) {
    throw new GitHubAuthError(readErrorMessage(payload) || 'GitHub 会话已过期，请重新登录。')
  }

  if (response.status === 404) {
    throw new Error('翻译服务接口未部署或返回 404，请确认 Vercel 部署。')
  }

  if (!response.ok) {
    throw new Error(readErrorMessage(payload) || '翻译失败，请重试。')
  }

  const translatedText = typeof payload?.translatedText === 'string' ? payload.translatedText.trim() : ''
  if (!translatedText) {
    throw new Error('翻译结果为空，请稍后重试。')
  }

  const result: TranslateReadLaterResult = {
    translatedText,
    ...(typeof payload?.model === 'string' && payload.model ? { model: payload.model } : {}),
  }
  setCachedTranslation(payloadData.text, payloadData.title, result)
  return result
}

