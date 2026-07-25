import type { ReadLaterAnnotationIndexItem } from '../read-later/annotation-index'
import { listBookAnnotations } from './book-store'
import type { StoredBookMeta } from './book-types'

function normalizeSearchText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function getTimestamp(value: string) {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export async function buildBookAnnotationIndex(books: StoredBookMeta[]): Promise<ReadLaterAnnotationIndexItem[]> {
  const groups = await Promise.all(
    books.map(async (book) => {
      const annotations = await listBookAnnotations(book.id)
      const format = book.format || 'epub'

      return annotations.map<ReadLaterAnnotationIndexItem>((annotation) => ({
        id: `${book.id}::${annotation.id}`,
        sourceType: 'book',
        annotationId: annotation.id,
        postPath: `book:${book.id}`,
        postTitle: book.title || '未命名电子书',
        postDate: book.addedAt || '',
        sourceName: format.toUpperCase(),
        externalUrl: null,
        tags: ['电子书', format.toUpperCase()],
        readingStatus: 'reading',
        sectionKey: 'articleExcerpt',
        sectionLabel: annotation.chapter || '电子书批注',
        quote: annotation.quote,
        prefix: '',
        suffix: '',
        note: annotation.note,
        createdAt: annotation.createdAt,
        updatedAt: annotation.updatedAt,
        searchText: normalizeSearchText([
          book.title,
          book.creator,
          format,
          annotation.chapter,
          annotation.quote,
          annotation.note,
        ].join('\n')),
        bookId: book.id,
        bookFormat: format,
      }))
    }),
  )

  return groups
    .flat()
    .sort((left, right) => {
      const rightTimestamp = Math.max(getTimestamp(right.updatedAt), getTimestamp(right.createdAt), getTimestamp(right.postDate))
      const leftTimestamp = Math.max(getTimestamp(left.updatedAt), getTimestamp(left.createdAt), getTimestamp(left.postDate))
      return rightTimestamp - leftTimestamp
    })
}
