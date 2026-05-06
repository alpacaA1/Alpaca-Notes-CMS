import type { ReadingStatus } from './parse-post'

export type PostValidationErrors = Partial<Record<'title' | 'date' | 'desc' | 'permalink' | 'external_url', string>>
export type ContentType = 'post' | 'diary' | 'read-later' | 'knowledge'
export type KnowledgeSourceType = 'post' | 'read-later' | 'diary'

export type PostIndexItem = {
  path: string
  sha: string
  title: string
  date: string
  desc: string
  published: boolean
  pinned?: boolean
  hasExplicitPublished: boolean
  categories: string[]
  tags: string[]
  permalink: string | null
  cover: string | null
  searchText?: string
  contentType?: ContentType
  externalUrl?: string | null
  sourceName?: string | null
  readingStatus?: ReadingStatus
  sourceType?: KnowledgeSourceType | null
  sourcePath?: string | null
  sourceTitle?: string | null
  sourceUrl?: string | null
}

export type PostPublishState = 'all' | 'draft' | 'published'
export type PostSort = 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc'

export type PostIndexView = {
  query: string
  publishState: PostPublishState
  category: string | null
  tag: string | null
  sort: PostSort
}
