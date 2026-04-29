import type { ParsedPost, PostFrontmatter, ReadingStatus } from '../posts/parse-post'
import type { PostIndexItem, PostValidationErrors } from '../posts/post-types'

export type ReadLaterValidationErrors = Pick<
  PostValidationErrors,
  'title' | 'date' | 'desc' | 'external_url'
>

export type ReadLaterIndexItem = PostIndexItem & {
  published: false
  hasExplicitPublished: false
  categories: string[]
  contentType: 'read-later'
  externalUrl: string | null
  sourceName: string | null
  readingStatus: ReadingStatus
}

export type ReadLaterFrontmatter = PostFrontmatter & {
  categories: string[]
  permalink: string
  cover?: string
  pinned?: boolean
  external_url: string
  source_name: string
  reading_status: ReadingStatus
  read_later: true
  nav_exclude: true
  layout: 'read-later-item'
}

export type ReadLaterAnnotation = {
  id: string
  sectionKey: keyof ReadLaterSections
  quote: string
  prefix: string
  suffix: string
  note: string
  createdAt: string
  updatedAt: string
}

export type ParsedReadLaterItem = ParsedPost & {
  frontmatter: ReadLaterFrontmatter
  annotations: ReadLaterAnnotation[]
  hasExplicitPublished: false
  hasExplicitPermalink: true
  contentType: 'read-later'
}

export type ReadLaterSections = {
  articleExcerpt: string
  summary: string
  commentary: string
}

export type ReadLaterOutlineItem = {
  id: string
  label: string
  level: number
  kind: 'section' | 'heading'
}

function isReadLaterAnnotation(value: unknown): value is ReadLaterAnnotation {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    (candidate.sectionKey === 'articleExcerpt' || candidate.sectionKey === 'summary' || candidate.sectionKey === 'commentary') &&
    typeof candidate.quote === 'string' &&
    typeof candidate.prefix === 'string' &&
    typeof candidate.suffix === 'string' &&
    typeof candidate.note === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string'
  )
}

export function encodeReadLaterAnnotations(annotations: ReadLaterAnnotation[]) {
  return annotations.map((annotation) => encodeURIComponent(JSON.stringify(annotation)))
}

export function decodeReadLaterAnnotations(values: string[]) {
  return values.flatMap((value) => {
    try {
      const decoded = JSON.parse(decodeURIComponent(value))
      return isReadLaterAnnotation(decoded) ? [decoded] : []
    } catch {
      return []
    }
  })
}
