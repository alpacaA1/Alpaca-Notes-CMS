import { fetchMarkdownFile, readCachedMarkdownFile } from '../github-client'
import type { ReadingStatus } from '../posts/parse-post'
import type { SessionState } from '../session'
import type { ReadLaterAnnotation } from './item-types'
import { getEditableReadLaterSections, parseReadLaterItem } from './parse-item'

export type ReadLaterAnnotationSourceFile = {
  path: string
  sha: string
}

export type ReadLaterAnnotationIndexItem = {
  id: string
  sourceType?: 'read-later' | 'book'
  annotationId: string
  postPath: string
  postTitle: string
  postDate: string
  sourceName: string | null
  externalUrl: string | null
  tags: string[]
  readingStatus: ReadingStatus
  sectionKey: ReadLaterAnnotation['sectionKey']
  sectionLabel: string
  chapterTitle?: string | null
  parentChapterTitle?: string | null
  quote: string
  prefix: string
  suffix: string
  note: string
  createdAt: string
  updatedAt: string
  searchText: string
  bookId?: string
  bookFormat?: 'epub' | 'pdf'
}

const SECTION_LABELS: Record<ReadLaterAnnotation['sectionKey'], string> = {
  articleExcerpt: '原文摘录',
  summary: '我的总结',
  commentary: '我的评论',
}

function normalizeSearchText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function resolveSectionLabel(sectionKey: ReadLaterAnnotation['sectionKey']) {
  return SECTION_LABELS[sectionKey]
}

function resolveReadingStatusLabel(status: ReadingStatus) {
  return status === 'done' ? '已读' : status === 'reading' ? '在读' : '未读'
}

function resolveSortTimestamp(annotation: Pick<ReadLaterAnnotationIndexItem, 'updatedAt' | 'createdAt' | 'postDate'> & { note?: string }) {
  const createdTime = Date.parse(annotation.createdAt)
  const updatedTime = Date.parse(annotation.updatedAt)
  const postTime = Date.parse(annotation.postDate)

  if (annotation.note && annotation.note.trim() && !Number.isNaN(updatedTime) && updatedTime > 0) {
    return updatedTime
  }
  if (!Number.isNaN(createdTime) && createdTime > 0) {
    return createdTime
  }
  if (!Number.isNaN(updatedTime) && updatedTime > 0) {
    return updatedTime
  }
  if (!Number.isNaN(postTime) && postTime > 0) {
    return postTime
  }
  return 0
}

function extractFullAnnotationContext(
  sectionContent: string,
  annotation: ReadLaterAnnotation,
  contextRadius = 180,
): { prefix: string; suffix: string } {
  if (!sectionContent || !annotation.quote) {
    return { prefix: annotation.prefix || '', suffix: annotation.suffix || '' }
  }

  let quoteIndex = -1
  if (annotation.prefix) {
    const combined = annotation.prefix + annotation.quote
    const combinedIndex = sectionContent.indexOf(combined)
    if (combinedIndex !== -1) {
      quoteIndex = combinedIndex + annotation.prefix.length
    }
  }

  if (quoteIndex === -1) {
    quoteIndex = sectionContent.indexOf(annotation.quote)
  }

  if (quoteIndex === -1) {
    return { prefix: annotation.prefix || '', suffix: annotation.suffix || '' }
  }

  const rawPrefix = sectionContent.slice(Math.max(0, quoteIndex - contextRadius), quoteIndex)
  const quoteEnd = quoteIndex + annotation.quote.length
  const rawSuffix = sectionContent.slice(quoteEnd, Math.min(sectionContent.length, quoteEnd + contextRadius))

  return {
    prefix: rawPrefix.length >= (annotation.prefix || '').length ? rawPrefix : (annotation.prefix || rawPrefix),
    suffix: rawSuffix.length >= (annotation.suffix || '').length ? rawSuffix : (annotation.suffix || rawSuffix),
  }
}

export function extractPrecedingHeading(
  content: string,
  quote: string,
  prefix?: string,
): string | null {
  if (!content || !quote) return null
  let quoteIndex = -1
  if (prefix) {
    const combined = prefix + quote
    const combinedIndex = content.indexOf(combined)
    if (combinedIndex !== -1) {
      quoteIndex = combinedIndex + prefix.length
    }
  }

  if (quoteIndex === -1) {
    quoteIndex = content.indexOf(quote)
  }

  if (quoteIndex === -1) return null

  return extractPrecedingHeadings(content, quote, prefix).chapterTitle
}

export function extractPrecedingHeadings(
  content: string,
  quote: string,
  prefix?: string,
): { chapterTitle: string | null; parentChapterTitle: string | null } {
  let quoteIndex = -1
  if (prefix) {
    const combined = prefix + quote
    const combinedIndex = content.indexOf(combined)
    if (combinedIndex !== -1) {
      quoteIndex = combinedIndex + prefix.length
    }
  }

  if (quoteIndex === -1) {
    quoteIndex = content.indexOf(quote)
  }

  if (quoteIndex === -1) return { chapterTitle: null, parentChapterTitle: null }

  const textBefore = content.slice(0, quoteIndex)
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  let lastHeading: string | null = null
  let lastParentHeading: string | null = null
  let match: RegExpExecArray | null

  while ((match = headingRegex.exec(textBefore)) !== null) {
    const level = match[1].length
    const rawHeading = match[2] || ''
    const cleaned = rawHeading
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`#]/g, '')
      .trim()
    if (!cleaned) continue

    if (level <= 2) {
      lastParentHeading = cleaned
      lastHeading = cleaned
    } else {
      lastHeading = cleaned
    }
  }

  const parentChapterTitle =
    lastParentHeading && lastHeading && lastParentHeading !== lastHeading ? lastParentHeading : null

  return { chapterTitle: lastHeading, parentChapterTitle }
}

export async function buildReadLaterAnnotationIndex(
  session: SessionState,
  sourceFiles: ReadLaterAnnotationSourceFile[],
): Promise<ReadLaterAnnotationIndexItem[]> {
  const annotationGroups = await Promise.all(
    sourceFiles.map(async (sourceFile) => {
      const file = readCachedMarkdownFile(sourceFile.path, sourceFile.sha) ?? await fetchMarkdownFile(session, sourceFile.path)
      const item = parseReadLaterItem(file)

      const sections = getEditableReadLaterSections(item.body)

      return item.annotations.map<ReadLaterAnnotationIndexItem>((annotation) => {
        const sectionText = sections[annotation.sectionKey] || item.body || ''
        const { prefix, suffix } = extractFullAnnotationContext(sectionText, annotation)
        const { chapterTitle, parentChapterTitle } = extractPrecedingHeadings(sectionText, annotation.quote, prefix)

        return {
          id: `${item.path}::${annotation.id}`,
          sourceType: 'read-later',
          annotationId: annotation.id,
          postPath: item.path,
          postTitle: item.frontmatter.title.trim() || '未命名待读',
          postDate: item.frontmatter.date || '',
          sourceName: item.frontmatter.source_name?.trim() || null,
          externalUrl: item.frontmatter.external_url?.trim() || null,
          tags: item.frontmatter.tags,
          readingStatus: item.frontmatter.reading_status,
          sectionKey: annotation.sectionKey,
          sectionLabel: resolveSectionLabel(annotation.sectionKey),
          chapterTitle,
          parentChapterTitle,
          quote: annotation.quote,
          prefix,
          suffix,
          note: annotation.note,
          createdAt: annotation.createdAt,
          updatedAt: annotation.updatedAt,
          searchText: normalizeSearchText([
            item.frontmatter.title,
            chapterTitle || '',
            parentChapterTitle || '',
            item.frontmatter.source_name || '',
            item.frontmatter.external_url || '',
            ...item.frontmatter.tags,
            resolveReadingStatusLabel(item.frontmatter.reading_status),
            resolveSectionLabel(annotation.sectionKey),
            prefix,
            annotation.quote,
            suffix,
            annotation.note,
          ].join('\n')),
        }
      })
    }),
  )

  return annotationGroups
    .flat()
    .sort((left, right) => {
      const timeDiff = resolveSortTimestamp(right) - resolveSortTimestamp(left)
      if (timeDiff !== 0) {
        return timeDiff
      }
      const rightCreated = Date.parse(right.createdAt) || 0
      const leftCreated = Date.parse(left.createdAt) || 0
      if (rightCreated !== leftCreated) {
        return rightCreated - leftCreated
      }
      return (right.annotationId || right.id).localeCompare(left.annotationId || left.id)
    })
}
