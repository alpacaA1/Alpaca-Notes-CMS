import type { BookAnnotation, StoredBookFile, StoredBookMeta } from './book-types'

const DB_NAME = 'alpaca-books'
const DB_VERSION = 1
const BOOK_META_STORE = 'book-meta'
const BOOK_FILE_STORE = 'book-files'
const ANNOTATION_STORE = 'annotations'

let dbPromise: Promise<IDBDatabase> | null = null

function openBookDatabase() {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(BOOK_META_STORE)) {
        db.createObjectStore(BOOK_META_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(BOOK_FILE_STORE)) {
        db.createObjectStore(BOOK_FILE_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(ANNOTATION_STORE)) {
        const store = db.createObjectStore(ANNOTATION_STORE, { keyPath: 'id' })
        store.createIndex('bookId', 'bookId', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开本地书库。'))
  })

  return dbPromise
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('本地书库读写失败。'))
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openBookDatabase()
  const tx = db.transaction(storeName, mode)
  return requestToPromise(action(tx.objectStore(storeName)))
}

export async function listBookMetas() {
  const metas = await withStore(BOOK_META_STORE, 'readonly', (store) => store.getAll() as IDBRequest<StoredBookMeta[]>)
  return metas
    .filter((meta) => meta && typeof meta.id === 'string')
    .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))
}

export function getBookFile(id: string) {
  return withStore(BOOK_FILE_STORE, 'readonly', (store) => store.get(id) as IDBRequest<StoredBookFile | undefined>)
}

export async function hasBookFile(id: string): Promise<boolean> {
  const key = await withStore(BOOK_FILE_STORE, 'readonly', (store) => store.getKey(id))
  return key !== undefined
}

export function putBookFile(id: string, blob: Blob) {
  return withStore(BOOK_FILE_STORE, 'readwrite', (store) =>
    store.put({ id, blob } satisfies StoredBookFile),
  )
}

export async function putBook(meta: StoredBookMeta, blob: Blob) {
  const db = await openBookDatabase()
  const tx = db.transaction([BOOK_META_STORE, BOOK_FILE_STORE], 'readwrite')

  await Promise.all([
    requestToPromise(tx.objectStore(BOOK_META_STORE).put(meta)),
    requestToPromise(tx.objectStore(BOOK_FILE_STORE).put({ id: meta.id, blob } satisfies StoredBookFile)),
  ])
}

export function putBookMeta(meta: StoredBookMeta) {
  return withStore(BOOK_META_STORE, 'readwrite', (store) => store.put(meta))
}

export async function deleteBook(id: string) {
  const db = await openBookDatabase()
  const tx = db.transaction([BOOK_META_STORE, BOOK_FILE_STORE, ANNOTATION_STORE], 'readwrite')

  const annotationStore = tx.objectStore(ANNOTATION_STORE)
  const annotationIndex = annotationStore.index('bookId')
  const annotationKeys = await requestToPromise(annotationIndex.getAllKeys() as IDBRequest<IDBValidKey[]>)

  await Promise.all([
    requestToPromise(tx.objectStore(BOOK_META_STORE).delete(id)),
    requestToPromise(tx.objectStore(BOOK_FILE_STORE).delete(id)),
    ...annotationKeys.map((key) => requestToPromise(annotationStore.delete(key))),
  ])
}

export async function listBookAnnotations(bookId: string) {
  const annotations = await withStore(ANNOTATION_STORE, 'readonly', (store) => (
    store.index('bookId').getAll(bookId) as IDBRequest<BookAnnotation[]>
  ))
  return annotations
    .filter((annotation) => annotation && typeof annotation.id === 'string')
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export function putBookAnnotation(annotation: BookAnnotation) {
  return withStore(ANNOTATION_STORE, 'readwrite', (store) => store.put(annotation))
}

export function deleteBookAnnotation(id: string) {
  return withStore(ANNOTATION_STORE, 'readwrite', (store) => store.delete(id))
}

export async function countBookAnnotations() {
  const db = await openBookDatabase()
  const tx = db.transaction(ANNOTATION_STORE, 'readonly')
  const annotations = await requestToPromise(
    tx.objectStore(ANNOTATION_STORE).getAll() as IDBRequest<BookAnnotation[]>,
  )

  const counts: Record<string, number> = {}
  for (const annotation of annotations) {
    if (!annotation || typeof annotation.bookId !== 'string') {
      continue
    }
    counts[annotation.bookId] = (counts[annotation.bookId] ?? 0) + 1
  }
  return counts
}

export async function listAllBookAnnotations(): Promise<BookAnnotation[]> {
  const annotations = await withStore(ANNOTATION_STORE, 'readonly', (store) =>
    store.getAll() as IDBRequest<BookAnnotation[]>,
  )
  return (annotations || [])
    .filter((annotation) => annotation && typeof annotation.id === 'string')
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export interface BookLibraryBackup {
  version: 1
  exportedAt: string
  books: Array<{
    meta: StoredBookMeta
    annotations: BookAnnotation[]
  }>
}

export async function exportBookLibraryBackup(): Promise<BookLibraryBackup> {
  const books = await listBookMetas()
  const booksData = await Promise.all(
    books.map(async (meta) => {
      const annotations = await listBookAnnotations(meta.id)
      return { meta, annotations }
    }),
  )

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    books: booksData,
  }
}

export async function importBookLibraryBackup(backup: BookLibraryBackup): Promise<number> {
  if (!backup || backup.version !== 1 || !Array.isArray(backup.books)) {
    throw new Error('无效的电子书备份数据格式。')
  }

  let importedCount = 0
  for (const item of backup.books) {
    if (item.meta && item.meta.id) {
      await putBookMeta(item.meta)
      if (Array.isArray(item.annotations)) {
        for (const annotation of item.annotations) {
          if (annotation && annotation.id) {
            await putBookAnnotation(annotation)
          }
        }
      }
      importedCount += 1
    }
  }

  return importedCount
}

export async function exportBookAnnotationsToMarkdown(bookId: string): Promise<string> {
  const metas = await listBookMetas()
  const meta = metas.find((item) => item.id === bookId)

  const title = meta?.title || '未命名电子书'
  const creator = meta?.creator ? `\n- **作者**：${meta.creator}` : ''
  const annotations = await listBookAnnotations(bookId)

  if (!annotations.length) {
    return `# 《${title}》读书笔记\n${creator}\n\n*暂无划线批注*`
  }

  const lines: string[] = [
    `# 《${title}》读书笔记`,
    creator,
    `- **批注总数**：${annotations.length}`,
    `- **导出时间**：${new Date().toLocaleString('zh-CN')}`,
    '',
    '---',
    '',
  ]

  annotations.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.chapter || '章节片段'}`)
    if (item.quote) {
      lines.push(`> ${item.quote.split('\n').join('\n> ')}`)
      lines.push('')
    }
    if (item.note) {
      lines.push(`**笔记/想法**：${item.note}`)
      lines.push('')
    }
    if (item.createdAt) {
      lines.push(`*时间：${item.createdAt}*`)
      lines.push('')
    }
    lines.push('---')
    lines.push('')
  })

  return lines.join('\n').trim()
}

