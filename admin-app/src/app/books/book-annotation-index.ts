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

const FALLBACK_CHAPTER_NAMES = new Set(['划线片段', '读书想法', '未知章节', '未知页码', '电子书章节'])

export function cleanBookChapterTitle(chapter?: string | null): string | null {
  if (!chapter) return null
  const trimmed = chapter.trim()
  if (!trimmed || FALLBACK_CHAPTER_NAMES.has(trimmed)) {
    return null
  }
  return trimmed
}

export async function buildBookAnnotationIndex(books: StoredBookMeta[]): Promise<ReadLaterAnnotationIndexItem[]> {
  const groups = await Promise.all(
    books.map(async (book) => {
      const annotations = await listBookAnnotations(book.id)
      const format = book.format || 'epub'

      return annotations.map<ReadLaterAnnotationIndexItem>((annotation) => {
        const chapterTitle =
          cleanBookChapterTitle(annotation.chapter) ||
          (annotation.target?.pageNumber ? `第 ${annotation.target.pageNumber} 页` : null)

        return {
          id: `${book.id}::${annotation.id}`,
          sourceType: 'book',
          annotationId: annotation.id,
          postPath: `book:${book.id}`,
          postTitle: book.title || '未命名电子书',
          postDate: book.addedAt || '',
          sourceName: book.creator ? `${book.creator} · ${format.toUpperCase()}` : format.toUpperCase(),
          externalUrl: null,
          tags: ['电子书', format.toUpperCase()],
          readingStatus: 'reading',
          sectionKey: 'articleExcerpt',
          sectionLabel: chapterTitle || '电子书章节',
          chapterTitle,
          quote: annotation.quote,
          prefix: '',
          suffix: '',
          note: annotation.note || '',
          createdAt: annotation.createdAt,
          updatedAt: annotation.updatedAt,
          searchText: normalizeSearchText([
            book.title,
            book.creator,
            format,
            chapterTitle || '',
            annotation.chapter,
            annotation.quote,
            annotation.note,
          ].join('\n')),
          bookId: book.id,
          bookFormat: format,
        }
      })
    }),
  )

  return groups
    .flat()
    .sort((left, right) => {
      const rightCreated = getTimestamp(right.createdAt)
      const leftCreated = getTimestamp(left.createdAt)
      const rightUpdated = right.note?.trim() ? getTimestamp(right.updatedAt) : 0
      const leftUpdated = left.note?.trim() ? getTimestamp(left.updatedAt) : 0
      const rightTime = rightUpdated || rightCreated || getTimestamp(right.postDate)
      const leftTime = leftUpdated || leftCreated || getTimestamp(left.postDate)

      if (rightTime !== leftTime) {
        return rightTime - leftTime
      }
      if (rightCreated !== leftCreated) {
        return rightCreated - leftCreated
      }
      return (right.annotationId || '').localeCompare(left.annotationId || '')
    })
}
