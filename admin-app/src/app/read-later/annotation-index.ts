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

function resolveSortTimestamp(annotation: Pick<ReadLaterAnnotationIndexItem, 'updatedAt' | 'createdAt' | 'postDate'>) {
  const timestampCandidates = [annotation.updatedAt, annotation.createdAt, annotation.postDate]

  for (const value of timestampCandidates) {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) {
      return parsed
    }
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
          quote: annotation.quote,
          prefix,
          suffix,
          note: annotation.note,
          createdAt: annotation.createdAt,
          updatedAt: annotation.updatedAt,
          searchText: normalizeSearchText([
            item.frontmatter.title,
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
    .sort((left, right) => resolveSortTimestamp(right) - resolveSortTimestamp(left))
}
