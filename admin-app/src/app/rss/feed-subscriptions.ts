import { FEED_SUBSCRIPTIONS_PATH } from '../config'
import { fetchTextFile, saveTextFile } from '../github-client'
import type { SessionState } from '../session'

export type FeedSubscription = {
  id: string
  title: string
  url: string
  description: string
  category: string
  sourceType: 'manual' | 'shared'
  articleCount: number
  createdAt: string
}

type FeedSubscriptionFile = {
  feeds?: unknown
}

export type FeedSubscriptionsState = {
  path: string
  sha?: string
  subscriptions: FeedSubscription[]
}

function normalizeSubscription(record: unknown, index: number): FeedSubscription | null {
  if (!record || typeof record !== 'object') {
    return null
  }

  const candidate = record as Record<string, unknown>
  const url = typeof candidate.url === 'string' ? candidate.url.trim() : ''
  if (!url) {
    return null
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `feed-${index + 1}`,
    title: typeof candidate.title === 'string' ? candidate.title : '',
    url,
    description: typeof candidate.description === 'string' ? candidate.description : '',
    category: typeof candidate.category === 'string' ? candidate.category : '',
    sourceType: candidate.sourceType === 'shared' ? 'shared' : 'manual',
    articleCount: typeof candidate.articleCount === 'number' ? candidate.articleCount : 0,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
  }
}

export function parseFeedSubscriptions(content: string): FeedSubscription[] {
  let payload: FeedSubscriptionFile

  try {
    payload = JSON.parse(content) as FeedSubscriptionFile
  } catch {
    throw new Error('RSS 订阅配置文件格式无效。')
  }

  const feeds = Array.isArray(payload.feeds) ? payload.feeds : []
  return feeds
    .map((record, index) => normalizeSubscription(record, index))
    .filter((record): record is FeedSubscription => Boolean(record))
}

export function serializeFeedSubscriptions(subscriptions: FeedSubscription[]) {
  return `${JSON.stringify({ feeds: subscriptions }, null, 2)}\n`
}

export async function readFeedSubscriptions(session: SessionState): Promise<FeedSubscriptionsState> {
  try {
    const file = await fetchTextFile(session, FEED_SUBSCRIPTIONS_PATH)
    return {
      path: file.path,
      sha: file.sha,
      subscriptions: parseFeedSubscriptions(file.content),
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Not Found') {
      return {
        path: FEED_SUBSCRIPTIONS_PATH,
        subscriptions: [],
      }
    }

    throw error
  }
}

export async function saveFeedSubscriptions(
  session: SessionState,
  state: FeedSubscriptionsState,
): Promise<FeedSubscriptionsState> {
  const nextContent = serializeFeedSubscriptions(state.subscriptions)
  const saved = await saveTextFile(session, {
    path: FEED_SUBSCRIPTIONS_PATH,
    sha: state.sha,
    content: nextContent,
  })

  return {
    path: saved.path,
    sha: saved.sha,
    subscriptions: [...state.subscriptions],
  }
}
