import { WEREAD_PROXY_URL } from '../config'
import { listBookAnnotations, putBookAnnotation, putBookMeta } from './book-store'
import type { BookAnnotation, StoredBookMeta } from './book-types'

const WEREAD_GATEWAY_URL = 'https://i.weread.qq.com/api/agent/gateway'
const SKILL_VERSION = '1.0.3'
const WEREAD_API_KEY_STORAGE = 'alpaca-admin:weread-api-key'
const WEREAD_LAST_SYNCED_STORAGE = 'alpaca-admin:weread-last-synced-at'

export interface WeReadNotebookItem {
  bookId: string
  book: {
    bookId?: string
    title: string
    author: string
    cover?: string
    format?: string
  }
  bookmarkCount?: number
  thoughtCount?: number
}

export interface WeReadBookmarkItem {
  bookmarkId: string
  chapterUid?: number
  chapterTitle?: string
  markText: string
  range?: string
  createTime: number
  style?: number
}

export interface WeReadThoughtItem {
  thought: {
    thoughtId: string
    chapterUid?: number
    chapterTitle?: string
    content: string
    abstract?: string
    range?: string
    createTime: number
  }
}

export function getStoredWeReadApiKey(): string {
  try {
    return (typeof window !== 'undefined' ? localStorage.getItem(WEREAD_API_KEY_STORAGE) : '') || ''
  } catch {
    return ''
  }
}

export function setStoredWeReadApiKey(key: string): void {
  try {
    if (typeof window !== 'undefined') {
      if (key.trim()) {
        localStorage.setItem(WEREAD_API_KEY_STORAGE, key.trim())
      } else {
        localStorage.removeItem(WEREAD_API_KEY_STORAGE)
      }
    }
  } catch {
    // Ignore localStorage errors
  }
}

export function getStoredWeReadLastSyncedAt(): string {
  try {
    return (typeof window !== 'undefined' ? localStorage.getItem(WEREAD_LAST_SYNCED_STORAGE) : '') || ''
  } catch {
    return ''
  }
}

export function setStoredWeReadLastSyncedAt(timeIso: string): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(WEREAD_LAST_SYNCED_STORAGE, timeIso)
    }
  } catch {
    // Ignore localStorage errors
  }
}

export function maskWeReadApiKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (!trimmed) {
    return ''
  }
  if (trimmed.length <= 8) {
    return 'wrk-******'
  }
  const prefix = trimmed.slice(0, 4)
  const suffix = trimmed.slice(-4)
  return `${prefix}******${suffix}`
}

function computeHashSeed(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

export async function requestWeReadGateway<T>(
  apiKey: string,
  apiName: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const cleanKey = apiKey.trim()
  if (!cleanKey) {
    throw new Error('请先提供微信读书 API Key (以 wrk- 开头)。')
  }

  const requestBody = JSON.stringify({
    api_name: apiName,
    skill_version: SKILL_VERSION,
    ...payload,
  })

  let response: Response | null = null
  let lastError: Error | null = null

  // 1. Try serverless / dev proxy first to bypass browser CORS
  try {
    response = await fetch(WEREAD_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
      },
      body: requestBody,
    })
  } catch (err) {
    // 2. Fallback to direct gateway (e.g. if testing in Node/CLI or if proxy is not found)
    try {
      response = await fetch(WEREAD_GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cleanKey}`,
        },
        body: requestBody,
      })
    } catch (directErr) {
      lastError =
        directErr instanceof TypeError
          ? new Error('微信读书接口请求受阻（浏览器跨域限制，需配置 /api/weread 代理服务）。')
          : directErr instanceof Error
            ? directErr
            : new Error('网络请求失败')
    }
  }

  if (!response) {
    throw lastError || new Error('微信读书接口请求失败 (网络或跨域限制)')
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('微信读书 API Key 无效或未授权，请前往 weread.qq.com/r/weread-skills 重新获取。')
    }
    throw new Error('微信读书服务连接失败，请检查网络或稍后重试。')
  }

  return (await response.json()) as T
}

export async function fetchWeReadNotebooks(apiKey: string): Promise<WeReadNotebookItem[]> {
  const data = await requestWeReadGateway<{ books?: WeReadNotebookItem[] } | WeReadNotebookItem[]>(
    apiKey,
    '/user/notebooks',
    { count: 200 },
  )

  if (Array.isArray(data)) {
    return data
  }
  if (data && Array.isArray(data.books)) {
    return data.books
  }
  return []
}

export async function fetchWeReadBookmarks(apiKey: string, bookId: string): Promise<WeReadBookmarkItem[]> {
  const data = await requestWeReadGateway<{
    updated?: WeReadBookmarkItem[]
    bookmarks?: WeReadBookmarkItem[]
  } | WeReadBookmarkItem[]>(apiKey, '/book/bookmarklist', { bookId })

  if (Array.isArray(data)) {
    return data
  }
  if (data && Array.isArray(data.updated)) {
    return data.updated
  }
  if (data && Array.isArray(data.bookmarks)) {
    return data.bookmarks
  }
  return []
}

export async function fetchWeReadThoughts(apiKey: string, bookId: string): Promise<WeReadThoughtItem[]> {
  const data = await requestWeReadGateway<{
    thoughts?: WeReadThoughtItem[]
  } | WeReadThoughtItem[]>(apiKey, '/book/thoughtlist', { bookId })

  if (Array.isArray(data)) {
    return data
  }
  if (data && Array.isArray(data.thoughts)) {
    return data.thoughts
  }
  return []
}

export interface WeReadChapterItem {
  chapterUid?: number | string
  chapterId?: number | string
  title?: string
  chapterTitle?: string
  chapterIdx?: number
  level?: number
}

export async function fetchWeReadChapters(apiKey: string, bookId: string): Promise<Record<number, string>> {
  try {
    const data = await requestWeReadGateway<{
      data?: WeReadChapterItem[]
      chapters?: WeReadChapterItem[]
      item?: WeReadChapterItem[]
    } | WeReadChapterItem[]>(apiKey, '/book/chapterinfo', { bookId })

    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.chapters)
          ? data.chapters
          : Array.isArray(data?.item)
            ? data.item
            : []

    const map: Record<number, string> = {}
    for (const item of list) {
      if (!item) continue
      const rawUid = item.chapterUid ?? item.chapterId
      const uid = rawUid !== undefined && rawUid !== null ? Number(rawUid) : NaN
      const title = (item.title || item.chapterTitle || '').trim()
      if (!Number.isNaN(uid) && title) {
        map[uid] = title
      }
    }
    return map
  } catch {
    return {}
  }
}

export function transformWeReadBookData(
  notebook: WeReadNotebookItem,
  bookmarks: WeReadBookmarkItem[],
  thoughts: WeReadThoughtItem[],
  chapterMap: Record<number, string> = {},
): { meta: StoredBookMeta; annotations: BookAnnotation[] } {
  const rawBook = notebook.book || { title: '未命名微信读书', author: '未知作者' }
  const bookId = `weread-${notebook.bookId || rawBook.bookId || computeHashSeed(rawBook.title)}`
  const title = rawBook.title || '未命名微信读书'
  const creator = rawBook.author || '未知作者'
  const coverUrl = (rawBook.cover || notebook.book?.cover || '').trim() || null
  const coverSeed = computeHashSeed(`${title}-${creator}`)

  const annotationsMap = new Map<string, BookAnnotation>()
  let latestTime = new Date(0).toISOString()

  // 1. Process Bookmarks (Highlights)
  for (const bm of bookmarks) {
    if (!bm || !bm.markText?.trim()) {
      continue
    }

    const createdTimeIso = bm.createTime
      ? new Date(bm.createTime * 1000).toISOString()
      : new Date().toISOString()
    if (createdTimeIso > latestTime) {
      latestTime = createdTimeIso
    }

    const bmUid = bm.chapterUid !== undefined && bm.chapterUid !== null ? Number(bm.chapterUid) : NaN
    const resolvedChapter =
      (!Number.isNaN(bmUid) && chapterMap[bmUid])
        ? chapterMap[bmUid]
        : (bm.chapterTitle?.trim() || '')

    const annId = `wr-bm-${bm.bookmarkId || computeHashSeed(bm.markText)}`
    const ann: BookAnnotation = {
      id: annId,
      bookId,
      value: bm.range || bm.bookmarkId || '',
      color: '#D4A574',
      quote: bm.markText.trim(),
      note: '',
      chapter: resolvedChapter,
      createdAt: createdTimeIso,
      updatedAt: createdTimeIso,
    }
    annotationsMap.set(annId, ann)
  }

  // 2. Process Thoughts (Notes/Comments) & Combine with Bookmarks if same abstract
  for (const th of thoughts) {
    const thoughtData = th.thought || th
    if (!thoughtData || (!thoughtData.content?.trim() && !thoughtData.abstract?.trim())) {
      continue
    }

    const createdTimeIso = thoughtData.createTime
      ? new Date(thoughtData.createTime * 1000).toISOString()
      : new Date().toISOString()
    if (createdTimeIso > latestTime) {
      latestTime = createdTimeIso
    }

    const thoughtAbstract = (thoughtData.abstract || '').trim()
    const thoughtContent = (thoughtData.content || '').trim()
    const thUid = thoughtData.chapterUid !== undefined && thoughtData.chapterUid !== null ? Number(thoughtData.chapterUid) : NaN
    const resolvedThoughtChapter =
      (!Number.isNaN(thUid) && chapterMap[thUid])
        ? chapterMap[thUid]
        : (thoughtData.chapterTitle?.trim() || '')

    // Check if there is an existing bookmark with the exact same quote/abstract
    let matchedBookmark: BookAnnotation | null = null
    if (thoughtAbstract) {
      for (const existing of annotationsMap.values()) {
        if (existing.quote && existing.quote === thoughtAbstract && !existing.note) {
          matchedBookmark = existing
          break
        }
      }
    }

    if (matchedBookmark) {
      // Attach note to the existing highlight
      matchedBookmark.note = thoughtContent
      matchedBookmark.updatedAt = createdTimeIso
      if (!matchedBookmark.chapter && resolvedThoughtChapter) {
        matchedBookmark.chapter = resolvedThoughtChapter
      }
    } else {
      // Create new annotation entry
      const annId = `wr-th-${thoughtData.thoughtId || computeHashSeed(thoughtContent + thoughtAbstract)}`
      const ann: BookAnnotation = {
        id: annId,
        bookId,
        value: thoughtData.range || thoughtData.thoughtId || '',
        color: '#D4A574',
        quote: thoughtAbstract,
        note: thoughtContent,
        chapter: resolvedThoughtChapter,
        createdAt: createdTimeIso,
        updatedAt: createdTimeIso,
      }
      annotationsMap.set(annId, ann)
    }
  }

  const annotations = Array.from(annotationsMap.values()).sort((a, b) =>
    (a.createdAt || '').localeCompare(b.createdAt || ''),
  )

  const nowIso = new Date().toISOString()
  const meta: StoredBookMeta = {
    id: bookId,
    title,
    creator,
    format: 'epub',
    coverBlob: null,
    coverUrl,
    coverSeed,
    addedAt: nowIso,
    lastOpenedAt: latestTime !== new Date(0).toISOString() ? latestTime : nowIso,
    progressFraction: 0,
    progressCfi: null,
  }

  return { meta, annotations }
}

export async function syncSelectedWeReadNotebooks(
  apiKey: string,
  notebooks: WeReadNotebookItem[],
  onProgress?: (message: string, current: number, total: number) => void,
): Promise<{ booksCount: number; annotationsCount: number }> {
  if (notebooks.length === 0) {
    return { booksCount: 0, annotationsCount: 0 }
  }

  let totalAnnotationsCount = 0
  const totalBooks = notebooks.length

  for (let i = 0; i < notebooks.length; i++) {
    const notebook = notebooks[i]
    const bookTitle = notebook.book?.title || `书籍 ${i + 1}`
    const weReadBookId = notebook.bookId || notebook.book?.bookId || ''
    onProgress?.(`正在拉取《${bookTitle}》的划线与想法 (${i + 1}/${totalBooks})…`, i + 1, totalBooks)

    try {
      const [bookmarks, thoughts, chapterMap] = await Promise.all([
        fetchWeReadBookmarks(apiKey, weReadBookId).catch(() => []),
        fetchWeReadThoughts(apiKey, weReadBookId).catch(() => []),
        fetchWeReadChapters(apiKey, weReadBookId).catch(() => ({})),
      ])

      const { meta, annotations } = transformWeReadBookData(notebook, bookmarks, thoughts, chapterMap)

      // Save to local IndexedDB
      await putBookMeta(meta)
      for (const ann of annotations) {
        await putBookAnnotation(ann)
      }

      totalAnnotationsCount += annotations.length
    } catch {
      // Continue next book on individual error
    }
  }

  setStoredWeReadLastSyncedAt(new Date().toISOString())

  return {
    booksCount: totalBooks,
    annotationsCount: totalAnnotationsCount,
  }
}

export async function enrichExistingWeReadAnnotations(
  apiKey: string,
  books: StoredBookMeta[],
  onProgress?: (message: string, current: number, total: number) => void,
): Promise<number> {
  const wereadBooks = books.filter((b) => b.id.startsWith('weread-'))
  if (wereadBooks.length === 0) {
    return 0
  }

  let updatedCount = 0

  for (let i = 0; i < wereadBooks.length; i++) {
    const book = wereadBooks[i]
    const annotations = await listBookAnnotations(book.id)

    // Check if any annotation lacks a meaningful chapter title
    const needsEnrichment = annotations.some((ann) => {
      const ch = (ann.chapter || '').trim()
      return !ch || ch === '划线片段' || ch === '读书想法' || ch === '未知章节' || ch === '电子书章节'
    })

    if (!needsEnrichment) {
      continue
    }

    const rawBookId = book.id.replace(/^weread-/, '')
    onProgress?.(`正在补全《${book.title}》章节信息 (${i + 1}/${wereadBooks.length})…`, i + 1, wereadBooks.length)

    try {
      const [bookmarks, thoughts, chapterMap] = await Promise.all([
        fetchWeReadBookmarks(apiKey, rawBookId).catch(() => []),
        fetchWeReadThoughts(apiKey, rawBookId).catch(() => []),
        fetchWeReadChapters(apiKey, rawBookId).catch(() => ({})),
      ])

      if (Object.keys(chapterMap).length === 0 && bookmarks.length === 0 && thoughts.length === 0) {
        continue
      }

      const quoteToChapter = new Map<string, string>()
      const idToChapter = new Map<string, string>()

      for (const bm of bookmarks) {
        if (!bm) continue
        const bmUid = bm.chapterUid !== undefined && bm.chapterUid !== null ? Number(bm.chapterUid) : NaN
        const chapter =
          (!Number.isNaN(bmUid) && chapterMap[bmUid])
            ? chapterMap[bmUid]
            : (bm.chapterTitle?.trim() || '')

        if (chapter) {
          if (bm.markText?.trim()) {
            quoteToChapter.set(bm.markText.trim(), chapter)
          }
          if (bm.bookmarkId) {
            idToChapter.set(`wr-bm-${bm.bookmarkId}`, chapter)
          }
        }
      }

      for (const th of thoughts) {
        const thoughtData = th.thought || th
        if (!thoughtData) continue
        const thUid = thoughtData.chapterUid !== undefined && thoughtData.chapterUid !== null ? Number(thoughtData.chapterUid) : NaN
        const chapter =
          (!Number.isNaN(thUid) && chapterMap[thUid])
            ? chapterMap[thUid]
            : (thoughtData.chapterTitle?.trim() || '')

        if (chapter) {
          if (thoughtData.abstract?.trim()) {
            quoteToChapter.set(thoughtData.abstract.trim(), chapter)
          }
          if (thoughtData.thoughtId) {
            idToChapter.set(`wr-th-${thoughtData.thoughtId}`, chapter)
          }
        }
      }

      const nowIso = new Date().toISOString()
      for (const ann of annotations) {
        const currentCh = (ann.chapter || '').trim()
        const isPlaceholder =
          !currentCh ||
          currentCh === '划线片段' ||
          currentCh === '读书想法' ||
          currentCh === '未知章节' ||
          currentCh === '电子书章节'

        if (isPlaceholder) {
          const resolved =
            idToChapter.get(ann.id) ||
            (ann.quote ? quoteToChapter.get(ann.quote.trim()) : undefined)

          if (resolved) {
            ann.chapter = resolved
            ann.updatedAt = nowIso
            await putBookAnnotation(ann)
            updatedCount++
          }
        }
      }
    } catch {
      // Continue next book
    }
  }

  return updatedCount
}

export async function syncAllWeReadNotebooks(
  apiKey: string,
  onProgress?: (message: string, current: number, total: number) => void,
): Promise<{ booksCount: number; annotationsCount: number }> {
  onProgress?.('正在连接微信读书网关拉取书单…', 0, 0)
  const notebooks = await fetchWeReadNotebooks(apiKey)
  return syncSelectedWeReadNotebooks(apiKey, notebooks, onProgress)
}
