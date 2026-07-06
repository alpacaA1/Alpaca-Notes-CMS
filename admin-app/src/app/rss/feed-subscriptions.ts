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
  latestItemKeys?: string[]
  unreadItemKeys?: string[]
  lastFetchedAt?: string
  lastSuccessfulFetchAt?: string
  lastError?: string | null
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

type FeedItemKeyInput = {
  id?: string
  title?: string
  url?: string
  publishedAt?: string
}

type ImportedFeedLike = {
  title?: string
  description?: string
  items: FeedItemKeyInput[]
}

const MAX_LATEST_ITEM_KEYS = 50
const MAX_UNREAD_ITEM_KEYS = 200

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

function normalizeStringList(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) {
    return undefined
  }

  const items = Array.from(
    new Set(value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim())),
  )

  return items.slice(0, maxItems)
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

  const subscription: FeedSubscription = {
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
  const latestItemKeys = normalizeStringList(candidate.latestItemKeys, MAX_LATEST_ITEM_KEYS)
  const unreadItemKeys = normalizeStringList(candidate.unreadItemKeys, MAX_UNREAD_ITEM_KEYS)
  if (latestItemKeys) {
    subscription.latestItemKeys = latestItemKeys
  }
  if (unreadItemKeys) {
    subscription.unreadItemKeys = unreadItemKeys
  }
  if (typeof candidate.lastFetchedAt === 'string') {
    subscription.lastFetchedAt = candidate.lastFetchedAt
  }
  if (typeof candidate.lastSuccessfulFetchAt === 'string') {
    subscription.lastSuccessfulFetchAt = candidate.lastSuccessfulFetchAt
  }
  if (typeof candidate.lastError === 'string' || candidate.lastError === null) {
    subscription.lastError = candidate.lastError
  }

  return subscription
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
      const leftUnreadCount = Array.isArray(left.subscription.unreadItemKeys)
        ? left.subscription.unreadItemKeys.length
        : left.subscription.articleCount
      const rightUnreadCount = Array.isArray(right.subscription.unreadItemKeys)
        ? right.subscription.unreadItemKeys.length
        : right.subscription.articleCount
      const leftHasReadLater = leftUnreadCount > 0
      const rightHasReadLater = rightUnreadCount > 0

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

export function normalizeFeedItemUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  try {
    const url = new URL(trimmed)
    url.hash = ''
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/'
    return `${url.protocol}//${url.host.toLowerCase()}${normalizedPath}${url.search}`
  } catch {
    return trimmed.toLowerCase()
  }
}

function normalizeFeedItemIdentifier(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return normalizeFeedItemUrl(trimmed)
  }

  return trimmed.toLowerCase()
}

function hashFeedItemFallback(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createFeedItemKey(item: FeedItemKeyInput) {
  const normalizedId = item.id ? normalizeFeedItemIdentifier(item.id) : ''
  if (normalizedId) {
    return `guid:${normalizedId}`
  }

  const normalizedUrl = item.url ? normalizeFeedItemUrl(item.url) : ''
  if (normalizedUrl) {
    return `url:${normalizedUrl}`
  }

  const fallback = [item.title || '', item.url || '', item.publishedAt || ''].join('|').trim()
  return fallback ? `hash:${hashFeedItemFallback(fallback)}` : ''
}

function uniqueFeedItemKeys(items: FeedItemKeyInput[], maxItems = MAX_LATEST_ITEM_KEYS) {
  return Array.from(new Set(items.map((item) => createFeedItemKey(item)).filter(Boolean))).slice(0, maxItems)
}

function areStringListsEqual(left: string[] | undefined, right: string[] | undefined) {
  const leftItems = left || []
  const rightItems = right || []
  return leftItems.length === rightItems.length && leftItems.every((item, index) => item === rightItems[index])
}

export function applyFeedRefreshSuccessToSubscription(
  subscription: FeedSubscription,
  importedFeed: ImportedFeedLike,
  timestamp: string,
) {
  const latestItemKeys = uniqueFeedItemKeys(importedFeed.items)
  const latestItemKeySet = new Set(latestItemKeys)
  const hasExistingBaseline = Array.isArray(subscription.latestItemKeys)
  const previousKnownKeySet = new Set(subscription.latestItemKeys || [])
  const newItemKeys = hasExistingBaseline
    ? latestItemKeys.filter((itemKey) => !previousKnownKeySet.has(itemKey))
    : []
  const unreadItemKeys = Array.from(new Set([...(subscription.unreadItemKeys || []), ...newItemKeys]))
    .filter((itemKey) => latestItemKeySet.has(itemKey))
    .slice(0, MAX_UNREAD_ITEM_KEYS)
  const nextTitle = importedFeed.title?.trim() || subscription.title
  const nextDescription = importedFeed.description?.trim() || subscription.description
  const nextSubscription: FeedSubscription = {
    ...subscription,
    title: nextTitle,
    description: nextDescription,
    articleCount: importedFeed.items.length,
    latestItemKeys,
    unreadItemKeys,
    lastFetchedAt: timestamp,
    lastSuccessfulFetchAt: timestamp,
    lastError: null,
    updatedAt: timestamp,
  }
  const shouldUpdate =
    subscription.title !== nextTitle
    || subscription.description !== nextDescription
    || subscription.articleCount !== importedFeed.items.length
    || !areStringListsEqual(subscription.latestItemKeys, latestItemKeys)
    || !areStringListsEqual(subscription.unreadItemKeys, unreadItemKeys)
    || subscription.lastError
    || !subscription.lastSuccessfulFetchAt

  return shouldUpdate ? nextSubscription : null
}

export function applyFeedRefreshErrorToSubscription(
  subscription: FeedSubscription,
  message: string,
  timestamp: string,
) {
  const nextError = message.trim() || 'RSS 抓取失败。'
  if (subscription.lastError === nextError) {
    return null
  }

  return {
    ...subscription,
    lastFetchedAt: timestamp,
    lastError: nextError,
    updatedAt: timestamp,
  }
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
