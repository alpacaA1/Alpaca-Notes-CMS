import { BOOKS_DATA_PATH } from '../config'
import { fetchTextFile, saveTextFile } from '../github-client'
import type { SessionState } from '../session'
import {
  listAllBookAnnotations,
  listBookMetas,
  putBookAnnotation,
  putBookMeta,
} from './book-store'
import type {
  BookAnnotation,
  BooksLibraryData,
  RemoteBookItem,
  StoredBookMeta,
} from './book-types'

export function parseBooksLibrary(content: string): BooksLibraryData {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('云端书库数据格式错误，无法解析。')
  }

  if (!parsed || typeof parsed !== 'object') {
    return { version: 1, updatedAt: new Date().toISOString(), books: [] }
  }

  const candidate = parsed as Partial<BooksLibraryData>
  const rawBooks = Array.isArray(candidate.books) ? candidate.books : []

  const books: RemoteBookItem[] = rawBooks
    .filter((item): item is RemoteBookItem => Boolean(item && typeof item === 'object' && typeof item.id === 'string'))
    .map((item) => ({
      id: item.id,
      title: typeof item.title === 'string' ? item.title : '未命名书籍',
      creator: typeof item.creator === 'string' ? item.creator : '未知作者',
      format: item.format === 'pdf' ? 'pdf' : 'epub',
      coverSeed: typeof item.coverSeed === 'number' ? item.coverSeed : 0,
      addedAt: typeof item.addedAt === 'string' ? item.addedAt : new Date().toISOString(),
      lastOpenedAt: typeof item.lastOpenedAt === 'string' ? item.lastOpenedAt : new Date().toISOString(),
      progressFraction: typeof item.progressFraction === 'number' ? item.progressFraction : 0,
      progressCfi: typeof item.progressCfi === 'string' ? item.progressCfi : null,
      progressPage: typeof item.progressPage === 'number' ? item.progressPage : null,
      pageCount: typeof item.pageCount === 'number' ? item.pageCount : null,
      annotations: Array.isArray(item.annotations)
        ? item.annotations.filter((ann) => ann && typeof ann.id === 'string')
        : [],
    }))

  return {
    version: 1,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
    books,
  }
}

export function serializeBooksLibrary(data: BooksLibraryData): string {
  return `${JSON.stringify(data, null, 2)}\n`
}

export async function fetchRemoteBooksLibrary(
  session: SessionState,
): Promise<{ data: BooksLibraryData; sha: string } | null> {
  try {
    const file = await fetchTextFile(session, BOOKS_DATA_PATH)
    return {
      data: parseBooksLibrary(file.content),
      sha: file.sha,
    }
  } catch (error) {
    if (error instanceof Error && (error.message === 'Not Found' || error.message.toLowerCase().includes('not found'))) {
      return null
    }
    throw error
  }
}

export async function saveRemoteBooksLibrary(
  session: SessionState,
  data: BooksLibraryData,
  sha?: string,
): Promise<{ sha: string }> {
  const content = serializeBooksLibrary(data)
  const saved = await saveTextFile(session, {
    path: BOOKS_DATA_PATH,
    content,
    sha,
  })
  return { sha: saved.sha }
}

function mergeAnnotations(localList: BookAnnotation[], remoteList: BookAnnotation[]): BookAnnotation[] {
  const map = new Map<string, BookAnnotation>()

  for (const ann of localList) {
    map.set(ann.id, { ...ann })
  }

  for (const remoteAnn of remoteList) {
    const existing = map.get(remoteAnn.id)
    if (!existing) {
      map.set(remoteAnn.id, { ...remoteAnn })
      continue
    }

    const localTime = existing.updatedAt || existing.createdAt || ''
    const remoteTime = remoteAnn.updatedAt || remoteAnn.createdAt || ''

    if (remoteTime > localTime) {
      map.set(remoteAnn.id, { ...remoteAnn })
    }
  }

  return Array.from(map.values()).sort((left, right) =>
    (left.createdAt || '').localeCompare(right.createdAt || ''),
  )
}

export interface MergeResult {
  mergedRemoteBooks: RemoteBookItem[]
  mergedLocalItems: Array<{ meta: StoredBookMeta; annotations: BookAnnotation[] }>
}

export function mergeBooksData(
  localBooks: Array<{ meta: StoredBookMeta; annotations: BookAnnotation[] }>,
  remoteBooks: RemoteBookItem[],
): MergeResult {
  const localMap = new Map<string, { meta: StoredBookMeta; annotations: BookAnnotation[] }>()
  for (const item of localBooks) {
    localMap.set(item.meta.id, item)
  }

  const remoteMap = new Map<string, RemoteBookItem>()
  for (const item of remoteBooks) {
    remoteMap.set(item.id, item)
  }

  const allBookIds = Array.from(new Set([...localMap.keys(), ...remoteMap.keys()]))

  const mergedRemoteBooks: RemoteBookItem[] = []
  const mergedLocalItems: Array<{ meta: StoredBookMeta; annotations: BookAnnotation[] }> = []

  for (const id of allBookIds) {
    const local = localMap.get(id)
    const remote = remoteMap.get(id)

    if (local && !remote) {
      // Local only -> sync up to remote
      const remoteItem: RemoteBookItem = {
        id: local.meta.id,
        title: local.meta.title,
        creator: local.meta.creator,
        format: local.meta.format || 'epub',
        coverSeed: local.meta.coverSeed,
        addedAt: local.meta.addedAt,
        lastOpenedAt: local.meta.lastOpenedAt,
        progressFraction: local.meta.progressFraction,
        progressCfi: local.meta.progressCfi,
        progressPage: local.meta.progressPage,
        pageCount: local.meta.pageCount,
        annotations: local.annotations,
      }
      mergedRemoteBooks.push(remoteItem)
      mergedLocalItems.push(local)
    } else if (!local && remote) {
      // Remote only -> sync down to local
      const localMeta: StoredBookMeta = {
        id: remote.id,
        title: remote.title,
        creator: remote.creator,
        format: remote.format,
        coverBlob: null,
        coverSeed: remote.coverSeed,
        addedAt: remote.addedAt,
        lastOpenedAt: remote.lastOpenedAt,
        progressFraction: remote.progressFraction,
        progressCfi: remote.progressCfi,
        progressPage: remote.progressPage,
        pageCount: remote.pageCount,
      }
      mergedLocalItems.push({ meta: localMeta, annotations: remote.annotations })
      mergedRemoteBooks.push(remote)
    } else if (local && remote) {
      // Both exist -> pick newer progress, merge annotations
      const remoteIsNewer = (remote.lastOpenedAt || '') > (local.meta.lastOpenedAt || '')
      const activeMeta = remoteIsNewer
        ? {
            ...local.meta,
            lastOpenedAt: remote.lastOpenedAt,
            progressFraction: remote.progressFraction,
            progressCfi: remote.progressCfi,
            progressPage: remote.progressPage,
            pageCount: remote.pageCount,
          }
        : local.meta

      const mergedAnns = mergeAnnotations(local.annotations, remote.annotations)

      const remoteItem: RemoteBookItem = {
        id: activeMeta.id,
        title: activeMeta.title,
        creator: activeMeta.creator,
        format: activeMeta.format || 'epub',
        coverSeed: activeMeta.coverSeed,
        addedAt: activeMeta.addedAt,
        lastOpenedAt: activeMeta.lastOpenedAt,
        progressFraction: activeMeta.progressFraction,
        progressCfi: activeMeta.progressCfi,
        progressPage: activeMeta.progressPage,
        pageCount: activeMeta.pageCount,
        annotations: mergedAnns,
      }

      mergedRemoteBooks.push(remoteItem)
      mergedLocalItems.push({ meta: activeMeta, annotations: mergedAnns })
    }
  }

  // Sort by lastOpenedAt descending
  mergedRemoteBooks.sort((a, b) => (b.lastOpenedAt || '').localeCompare(a.lastOpenedAt || ''))
  mergedLocalItems.sort((a, b) => (b.meta.lastOpenedAt || '').localeCompare(a.meta.lastOpenedAt || ''))

  return { mergedRemoteBooks, mergedLocalItems }
}

export async function syncBooksWithGitHub(session: SessionState): Promise<{
  syncedCount: number
  hasRemoteChanges: boolean
}> {
  // 1. Gather local data
  const localMetas = await listBookMetas()
  const allAnnotations = await listAllBookAnnotations()

  const annMap = new Map<string, BookAnnotation[]>()
  for (const ann of allAnnotations) {
    const list = annMap.get(ann.bookId) || []
    list.push(ann)
    annMap.set(ann.bookId, list)
  }

  const localBooks = localMetas.map((meta) => ({
    meta,
    annotations: annMap.get(meta.id) || [],
  }))

  // 2. Fetch remote data
  const remoteResult = await fetchRemoteBooksLibrary(session)
  const remoteBooks = remoteResult?.data.books || []
  const remoteSha = remoteResult?.sha

  // 3. Merge
  const { mergedRemoteBooks, mergedLocalItems } = mergeBooksData(localBooks, remoteBooks)

  // 4. Update local IndexedDB
  for (const item of mergedLocalItems) {
    await putBookMeta(item.meta)
    for (const ann of item.annotations) {
      await putBookAnnotation(ann)
    }
  }

  // 5. Save back to remote
  const nextRemoteData: BooksLibraryData = {
    version: 1,
    updatedAt: new Date().toISOString(),
    books: mergedRemoteBooks,
  }

  await saveRemoteBooksLibrary(session, nextRemoteData, remoteSha)

  return {
    syncedCount: mergedRemoteBooks.length,
    hasRemoteChanges: true,
  }
}

export async function deleteBooksFromGitHub(session: SessionState, bookIds: string[]): Promise<void> {
  if (bookIds.length === 0) return
  const remoteResult = await fetchRemoteBooksLibrary(session)
  if (!remoteResult) {
    return
  }

  const idsSet = new Set(bookIds)
  const remainingBooks = remoteResult.data.books.filter((book) => !idsSet.has(book.id))
  if (remainingBooks.length === remoteResult.data.books.length) {
    return
  }

  const nextData: BooksLibraryData = {
    version: 1,
    updatedAt: new Date().toISOString(),
    books: remainingBooks,
  }

  await saveRemoteBooksLibrary(session, nextData, remoteResult.sha)
}

export async function deleteBookFromGitHub(session: SessionState, bookId: string): Promise<void> {
  return deleteBooksFromGitHub(session, [bookId])
}
