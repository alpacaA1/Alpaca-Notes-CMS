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
  external_url: string
  source_name: string
  reading_status: ReadingStatus
  read_later: true
  nav_exclude: true
  layout: 'read-later-item'
}

export type ParsedReadLaterItem = ParsedPost & {
  frontmatter: ReadLaterFrontmatter
  hasExplicitPublished: false
  hasExplicitPermalink: true
  contentType: 'read-later'
}

export type ReadLaterSections = {
  articleExcerpt: string
  summary: string
  commentary: string
}
