import type { ReadingStatus } from './parse-post'

export type PostValidationErrors = Partial<Record<'title' | 'date' | 'desc' | 'permalink' | 'external_url' | 'node_key', string>>
export type ContentType = 'post' | 'diary' | 'read-later' | 'knowledge'
export type KnowledgeSourceType = 'post' | 'read-later' | 'diary'
export type KnowledgeKind = 'note' | 'topic'
export type TopicNodeType = 'book' | 'movie' | 'person' | 'theme'

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
  body?: string
  searchText?: string
  contentType?: ContentType
  externalUrl?: string | null
  sourceName?: string | null
  readingStatus?: ReadingStatus
  sourceType?: KnowledgeSourceType | null
  sourcePath?: string | null
  sourceTitle?: string | null
  sourceUrl?: string | null
  isTopic?: boolean | null
  knowledgeKind?: KnowledgeKind | null
  topicType?: TopicNodeType | null
  nodeKey?: string | null
  aliases?: string[]
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
