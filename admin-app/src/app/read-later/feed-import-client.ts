import { GitHubAuthError } from '../github-client'
import { FEED_IMPORT_URL } from '../config'
import type { SessionState } from '../session'

export type ImportedFeedItem = {
  id: string
  title: string
  url: string
  summary: string
  publishedAt: string
  sourceName: string
}

export type ImportedFeed = {
  title: string
  description: string
  requestedUrl: string
  finalUrl: string
  items: ImportedFeedItem[]
}

type ImportFeedResponse = Partial<ImportedFeed> & {
  code?: string
  message?: string
}

export class FeedImportError extends Error {
  statusCode: number
  code: string

  constructor(message: string, statusCode = 400, code = 'feed_import_error') {
    super(message)
    this.name = 'FeedImportError'
    this.statusCode = statusCode
    this.code = code
  }
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const message = (payload as ImportFeedResponse).message
  return typeof message === 'string' ? message : ''
}

function readErrorCode(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const code = (payload as ImportFeedResponse).code
  return typeof code === 'string' ? code : ''
}

export async function importFeedFromUrl(session: SessionState, url: string): Promise<ImportedFeed> {
  const params = new URLSearchParams({ url })
  const response = await fetch(`${FEED_IMPORT_URL}?${params.toString()}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${session.token}`,
    },
  })

  let payload: ImportFeedResponse | null = null
  try {
    payload = (await response.json()) as ImportFeedResponse
  } catch {
    payload = null
  }

  if (response.status === 401) {
    throw new GitHubAuthError(readErrorMessage(payload) || 'GitHub 会话已过期，请重新登录。')
  }

  if (!response.ok) {
    throw new FeedImportError(
      readErrorMessage(payload) || '导入 RSS 失败。',
      response.status,
      readErrorCode(payload) || 'feed_import_error',
    )
  }

  const items = Array.isArray(payload?.items)
    ? payload.items
      .map((item) => ({
        id: typeof item?.id === 'string' ? item.id : '',
        title: typeof item?.title === 'string' ? item.title : '',
        url: typeof item?.url === 'string' ? item.url : '',
        summary: typeof item?.summary === 'string' ? item.summary : '',
        publishedAt: typeof item?.publishedAt === 'string' ? item.publishedAt : '',
        sourceName: typeof item?.sourceName === 'string' ? item.sourceName : '',
      }))
      .filter((item) => item.url.trim())
    : []

  if (items.length === 0) {
    throw new FeedImportError('这个 feed 里暂时没有可导入的条目。', 404, 'feed_empty')
  }

  return {
    title: typeof payload?.title === 'string' ? payload.title : '',
    description: typeof payload?.description === 'string' ? payload.description : '',
    requestedUrl: typeof payload?.requestedUrl === 'string' ? payload.requestedUrl : '',
    finalUrl: typeof payload?.finalUrl === 'string' ? payload.finalUrl : '',
    items,
  }
}
