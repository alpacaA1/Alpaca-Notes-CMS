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
  readLaterCount: number
  createdAt: string
  updatedAt: string
}

export type FeedFolder = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

type FeedSubscriptionFile = {
  folders?: unknown
  feeds?: unknown
}

export type FeedSubscriptionsState = {
  path: string
  sha?: string
  folders: FeedFolder[]
  subscriptions: FeedSubscription[]
}

function createFolderId(name: string, index: number) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  return slug ? `folder-${slug}` : `folder-${index + 1}`
}

function normalizeFolder(record: unknown, index: number): FeedFolder | null {
  if (!record || typeof record !== 'object') {
    return null
  }

  const candidate = record as Record<string, unknown>
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
  if (!name) {
    return null
  }

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : createFolderId(name, index),
    name,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
  }
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
    readLaterCount: typeof candidate.readLaterCount === 'number' ? candidate.readLaterCount : 0,
    createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : '',
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
  }
}

export function parseFeedSubscriptionsFile(content: string): Pick<FeedSubscriptionsState, 'folders' | 'subscriptions'> {
  let payload: FeedSubscriptionFile

  try {
    payload = JSON.parse(content) as FeedSubscriptionFile
  } catch {
    throw new Error('RSS 订阅配置文件格式无效。')
  }

  const folders = Array.isArray(payload.folders) ? payload.folders : []
  const feeds = Array.isArray(payload.feeds) ? payload.feeds : []
  return {
    folders: folders
      .map((record, index) => normalizeFolder(record, index))
      .filter((record): record is FeedFolder => Boolean(record)),
    subscriptions: feeds
      .map((record, index) => normalizeSubscription(record, index))
      .filter((record): record is FeedSubscription => Boolean(record)),
  }
}

export function parseFeedSubscriptions(content: string): FeedSubscription[] {
  return parseFeedSubscriptionsFile(content).subscriptions
}

export function serializeFeedSubscriptions(subscriptions: FeedSubscription[], folders: FeedFolder[] = []) {
  return `${JSON.stringify({ folders, feeds: subscriptions }, null, 2)}\n`
}

export function sortFeedSubscriptions(subscriptions: FeedSubscription[]) {
  return subscriptions
    .map((subscription, index) => ({ subscription, index }))
    .sort((left, right) => {
      const leftHasReadLater = left.subscription.articleCount > 0
      const rightHasReadLater = right.subscription.articleCount > 0

      if (leftHasReadLater !== rightHasReadLater) {
        return leftHasReadLater ? -1 : 1
      }

      const leftUpdatedAt = left.subscription.updatedAt || left.subscription.createdAt
      const rightUpdatedAt = right.subscription.updatedAt || right.subscription.createdAt
      if (leftUpdatedAt !== rightUpdatedAt) {
        return rightUpdatedAt.localeCompare(leftUpdatedAt)
      }

      return left.index - right.index
    })
    .map(({ subscription }) => subscription)
}

export async function readFeedSubscriptions(session: SessionState): Promise<FeedSubscriptionsState> {
  try {
    const file = await fetchTextFile(session, FEED_SUBSCRIPTIONS_PATH)
    const parsed = parseFeedSubscriptionsFile(file.content)
    return {
      path: file.path,
      sha: file.sha,
      folders: parsed.folders,
      subscriptions: parsed.subscriptions,
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'Not Found') {
      return {
        path: FEED_SUBSCRIPTIONS_PATH,
        folders: [],
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
  const nextContent = serializeFeedSubscriptions(state.subscriptions, state.folders || [])
  const saved = await saveTextFile(session, {
    path: FEED_SUBSCRIPTIONS_PATH,
    sha: state.sha,
    content: nextContent,
  })

  return {
    path: saved.path,
    sha: saved.sha,
    folders: [...(state.folders || [])],
    subscriptions: [...state.subscriptions],
  }
}
