export type PostValidationErrors = Partial<Record<'title' | 'date' | 'desc' | 'permalink', string>>

export type PostIndexItem = {
  path: string
  sha: string
  title: string
  date: string
  desc: string
  published: boolean
  hasExplicitPublished: boolean
  categories: string[]
  tags: string[]
  permalink: string | null
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
