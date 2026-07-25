import type { StoredBookMeta } from './book-types'
import {
  createBookId,
  formatContributor,
  formatLanguageMap,
  isEpubFile,
  isPdfFile,
} from './book-utils'

export type ImportedBook = {
  meta: StoredBookMeta
  file: File
}

export async function importEpubFile(file: File): Promise<ImportedBook> {
  if (!isEpubFile(file)) {
    throw new Error('目前仅支持导入 EPUB 格式的电子书。')
  }

  const { makeBook } = await import('foliate-js/view.js')

  let book: {
    metadata?: Record<string, unknown>
    getCover?: () => Promise<Blob | null>
  }
  try {
    book = await makeBook(file)
  } catch {
    throw new Error('解析 EPUB 文件失败，请确认文件完整且未加密。')
  }

  const title = formatLanguageMap(book.metadata?.title) || file.name.replace(/\.epub$/i, '')
  const creator = formatContributor(book.metadata?.author) || '未知作者'

  let coverBlob: Blob | null = null
  try {
    coverBlob = (await book.getCover?.()) ?? null
  } catch {
    coverBlob = null
  }

  const now = new Date().toISOString()
  return {
    file,
    meta: {
      id: createBookId(),
      title,
      creator,
      coverBlob,
      coverSeed: title.length + creator.length,
      addedAt: now,
      lastOpenedAt: now,
      progressFraction: 0,
      progressCfi: null,
      progressPage: null,
      pageCount: null,
      format: 'epub',
    },
  }
}

export async function importBookFile(file: File): Promise<ImportedBook> {
  if (isEpubFile(file)) {
    return importEpubFile(file)
  }

  if (!isPdfFile(file)) {
    throw new Error('目前支持导入 EPUB 和 PDF 格式的电子书。')
  }

  const title = file.name.replace(/\.pdf$/i, '').trim() || file.name
  const now = new Date().toISOString()
  return {
    file,
    meta: {
      id: createBookId(),
      format: 'pdf',
      title,
      creator: '未知作者',
      coverBlob: null,
      coverSeed: title.length,
      addedAt: now,
      lastOpenedAt: now,
      progressFraction: 0,
      progressCfi: null,
      progressPage: 1,
      pageCount: null,
    },
  }
}
