import { fetchMarkdownFile, readCachedMarkdownFile } from '../github-client'
import type { ReadingStatus } from '../posts/parse-post'
import type { SessionState } from '../session'
import type { ReadLaterAnnotation } from './item-types'
import { parseReadLaterItem } from './parse-item'

export type ReadLaterAnnotationSourceFile = {
  path: string
  sha: string
}

export type ReadLaterAnnotationIndexItem = {
  id: string
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
  note: string
  createdAt: string
  updatedAt: string
  searchText: string
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

export async function buildReadLaterAnnotationIndex(
  session: SessionState,
  sourceFiles: ReadLaterAnnotationSourceFile[],
): Promise<ReadLaterAnnotationIndexItem[]> {
  const annotationGroups = await Promise.all(
    sourceFiles.map(async (sourceFile) => {
      const file = readCachedMarkdownFile(sourceFile.path, sourceFile.sha) ?? await fetchMarkdownFile(session, sourceFile.path)
      const item = parseReadLaterItem(file)

      return item.annotations.map<ReadLaterAnnotationIndexItem>((annotation) => ({
        id: `${item.path}::${annotation.id}`,
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
          annotation.quote,
          annotation.note,
        ].join('\n')),
      }))
    }),
  )

  return annotationGroups
    .flat()
    .sort((left, right) => resolveSortTimestamp(right) - resolveSortTimestamp(left))
}
