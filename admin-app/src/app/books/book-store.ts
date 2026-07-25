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
