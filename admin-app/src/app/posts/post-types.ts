import type { ReadingStatus } from './parse-post'

export type PostValidationErrors = Partial<Record<'title' | 'date' | 'desc' | 'permalink' | 'external_url', string>>

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
  contentType?: 'post' | 'read-later'
  externalUrl?: string | null
  sourceName?: string | null
  readingStatus?: ReadingStatus
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
