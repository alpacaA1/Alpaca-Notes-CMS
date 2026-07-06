import { describe, expect, it } from 'vitest'
import {
  applyFeedRefreshSuccessToSubscription,
  createFeedItemKey,
  parseFeedSubscriptions,
  parseFeedSubscriptionsFile,
  serializeFeedSubscriptions,
  sortFeedSubscriptions,
  type FeedSubscription,
} from './feed-subscriptions'

function createSubscription(overrides: Partial<FeedSubscription> = {}): FeedSubscription {
  return {
    id: 'feed-a',
    title: 'Feed A',
    url: 'https://example.com/feed.xml',
    description: '',
    category: '',
    sourceType: 'manual',
    articleCount: 0,
    readLaterCount: 0,
    createdAt: '2026-06-04T10:00:00.000Z',
    updatedAt: '',
    ...overrides,
  }
}

describe('feed subscriptions store', () => {
  it('parses valid feed subscriptions', () => {
    const parsed = parseFeedSubscriptionsFile(JSON.stringify({
      folders: [
        {
          id: 'folder-ai',
          name: 'AI 实验室',
          createdAt: '2026-06-04T09:00:00.000Z',
          updatedAt: '',
        },
      ],
      feeds: [
        {
          id: 'claude-blog',
          title: 'Claude Blog',
          url: 'https://example.com/feed.xml',
          description: '最新动态',
          category: 'AI 实验室',
          sourceType: 'shared',
          articleCount: 12,
          readLaterCount: 0,
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
      ],
    }))

    expect(parsed.folders).toEqual([
      {
        id: 'folder-ai',
        name: 'AI 实验室',
        createdAt: '2026-06-04T09:00:00.000Z',
        updatedAt: '',
      },
    ])
    expect(parsed.subscriptions).toEqual([
      {
        id: 'claude-blog',
        title: 'Claude Blog',
        url: 'https://example.com/feed.xml',
        description: '最新动态',
        category: 'AI 实验室',
        sourceType: 'shared',
        articleCount: 12,
        readLaterCount: 0,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '',
      },
    ])
    expect(parseFeedSubscriptions(JSON.stringify({ feeds: [] }))).toEqual([])
  })

  it('serializes subscriptions into a stable json document', () => {
    expect(
      serializeFeedSubscriptions([
        {
          id: 'claude-blog',
          title: 'Claude Blog',
          url: 'https://example.com/feed.xml',
          description: '',
          category: '',
          sourceType: 'manual',
          articleCount: 0,
          readLaterCount: 0,
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedAt: '',
        },
      ], [
        {
          id: 'folder-news',
          name: 'Newspaper',
          createdAt: '2026-06-04T09:00:00.000Z',
          updatedAt: '',
        },
      ]),
    ).toContain('"id": "claude-blog"')
    expect(
      serializeFeedSubscriptions([], [
        {
          id: 'folder-news',
          name: 'Newspaper',
          createdAt: '2026-06-04T09:00:00.000Z',
          updatedAt: '',
        },
      ]),
    ).toContain('"folders"')
  })

  it('preserves persisted unread state fields when parsing subscriptions', () => {
    const parsed = parseFeedSubscriptionsFile(JSON.stringify({
      feeds: [
        {
          id: 'feed-a',
          title: 'Feed A',
          url: 'https://example.com/feed.xml',
          articleCount: 2,
          readLaterCount: 0,
          latestItemKeys: ['url:https://example.com/new', 'url:https://example.com/old'],
          unreadItemKeys: ['url:https://example.com/new'],
          lastFetchedAt: '2026-07-06T10:00:00.000Z',
          lastSuccessfulFetchAt: '2026-07-06T10:00:00.000Z',
          lastError: null,
        },
      ],
    }))

    expect(parsed.subscriptions[0].latestItemKeys).toEqual(['url:https://example.com/new', 'url:https://example.com/old'])
    expect(parsed.subscriptions[0].unreadItemKeys).toEqual(['url:https://example.com/new'])
    expect(parsed.subscriptions[0].lastError).toBeNull()
  })

  it('creates a stable item key from guid before url', () => {
    expect(createFeedItemKey({
      id: 'Item-1',
      url: 'https://Example.com/post/#comments',
      title: 'Post',
      publishedAt: '2026-07-06T10:00:00.000Z',
    })).toBe('guid:item-1')
  })

  it('uses the first refresh as a baseline without creating unread items', () => {
    const updated = applyFeedRefreshSuccessToSubscription(createSubscription(), {
      title: 'Feed A',
      description: '',
      items: [
        { id: 'old-1', title: 'Old 1', url: 'https://example.com/old-1', publishedAt: '2026-07-05T10:00:00.000Z' },
        { id: 'old-2', title: 'Old 2', url: 'https://example.com/old-2', publishedAt: '2026-07-05T11:00:00.000Z' },
      ],
    }, '2026-07-06T10:00:00.000Z')

    expect(updated?.latestItemKeys).toEqual(['guid:old-1', 'guid:old-2'])
    expect(updated?.unreadItemKeys).toEqual([])
  })

  it('marks new item keys unread even when the feed item count stays the same', () => {
    const updated = applyFeedRefreshSuccessToSubscription(createSubscription({
      articleCount: 2,
      latestItemKeys: ['guid:old-1', 'guid:old-2'],
      unreadItemKeys: [],
      lastSuccessfulFetchAt: '2026-07-06T09:00:00.000Z',
    }), {
      title: 'Feed A',
      description: '',
      items: [
        { id: 'new-1', title: 'New 1', url: 'https://example.com/new-1', publishedAt: '2026-07-06T10:00:00.000Z' },
        { id: 'old-1', title: 'Old 1', url: 'https://example.com/old-1', publishedAt: '2026-07-05T10:00:00.000Z' },
      ],
    }, '2026-07-06T10:00:00.000Z')

    expect(updated?.articleCount).toBe(2)
    expect(updated?.latestItemKeys).toEqual(['guid:new-1', 'guid:old-1'])
    expect(updated?.unreadItemKeys).toEqual(['guid:new-1'])
  })

  it('sorts subscriptions by unread count first, then updatedAt desc within each state', () => {
    const sorted = sortFeedSubscriptions([
      {
        id: 'feed-a',
        title: 'Feed A',
        url: 'https://example.com/a.xml',
        description: '',
        category: '',
        sourceType: 'manual',
        articleCount: 0,
        readLaterCount: 0,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '2026-06-04T14:00:00.000Z',
      },
      {
        id: 'feed-b',
        title: 'Feed B',
        url: 'https://example.com/b.xml',
        description: '',
        category: '',
        sourceType: 'manual',
        articleCount: 2,
        readLaterCount: 2,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '2026-06-04T11:00:00.000Z',
      },
      {
        id: 'feed-c',
        title: 'Feed C',
        url: 'https://example.com/c.xml',
        description: '',
        category: '',
        sourceType: 'manual',
        articleCount: 1,
        readLaterCount: 1,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '2026-06-04T12:00:00.000Z',
      },
      {
        id: 'feed-d',
        title: 'Feed D',
        url: 'https://example.com/d.xml',
        description: '',
        category: '',
        sourceType: 'manual',
        articleCount: 0,
        readLaterCount: 0,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '2026-06-04T13:00:00.000Z',
      },
    ])

    expect(sorted.map((subscription) => subscription.id)).toEqual(['feed-c', 'feed-b', 'feed-a', 'feed-d'])
  })
})
