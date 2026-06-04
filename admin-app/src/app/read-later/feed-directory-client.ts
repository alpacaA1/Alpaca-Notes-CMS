import { GitHubAuthError } from '../github-client'
import { FEED_DIRECTORY_URL } from '../config'
import type { SessionState } from '../session'

export type SharedFeedSource = {
  id: string
  title: string
  url: string
  category: string
  intro: string
  articleCount: number
  lastSuccessAt: string
}

export type SharedFeedCategory = {
  category: string
  feeds: SharedFeedSource[]
}

type FeedDirectoryResponse = {
  categories?: Array<{
    category?: unknown
    feeds?: Array<{
      id?: unknown
      title?: unknown
      url?: unknown
      category?: unknown
      articleCount?: unknown
      lastSuccessAt?: unknown
      intro?: {
        content?: unknown
      } | null
    }>
  }>
  message?: string
  code?: string
}

export class FeedDirectoryError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode = 400, code = 'feed_directory_error') {
    super(message)
    this.name = 'FeedDirectoryError'
    this.statusCode = statusCode
    this.code = code
  }
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const message = (payload as FeedDirectoryResponse).message
  return typeof message === 'string' ? message : ''
}

function readErrorCode(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const code = (payload as FeedDirectoryResponse).code
  return typeof code === 'string' ? code : ''
}

export async function fetchFeedDirectory(session: SessionState): Promise<SharedFeedCategory[]> {
  const response = await fetch(FEED_DIRECTORY_URL, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${session.token}`,
    },
  })

  let payload: FeedDirectoryResponse | null = null
  try {
    payload = (await response.json()) as FeedDirectoryResponse
  } catch {
    payload = null
  }

  if (response.status === 401) {
    throw new GitHubAuthError(readErrorMessage(payload) || 'GitHub 会话已过期，请重新登录。')
  }

  if (!response.ok) {
    throw new FeedDirectoryError(
      readErrorMessage(payload) || '加载共享 RSS 源目录失败。',
      response.status,
      readErrorCode(payload) || 'feed_directory_error',
    )
  }

  const categories = Array.isArray(payload?.categories) ? payload.categories : []

  return categories
    .map((category) => ({
      category: typeof category?.category === 'string' ? category.category : '未分类',
      feeds: Array.isArray(category?.feeds)
        ? category.feeds
          .map((feed) => ({
            id: typeof feed?.id === 'number' || typeof feed?.id === 'string' ? String(feed.id) : '',
            title: typeof feed?.title === 'string' ? feed.title : '',
            url: typeof feed?.url === 'string' ? feed.url : '',
            category: typeof feed?.category === 'string' ? feed.category : '',
            intro: typeof feed?.intro?.content === 'string' ? feed.intro.content : '',
            articleCount: typeof feed?.articleCount === 'number' ? feed.articleCount : 0,
            lastSuccessAt: typeof feed?.lastSuccessAt === 'string' ? feed.lastSuccessAt : '',
          }))
          .filter((feed) => feed.url.trim())
        : [],
    }))
    .filter((category) => category.feeds.length > 0)
}
