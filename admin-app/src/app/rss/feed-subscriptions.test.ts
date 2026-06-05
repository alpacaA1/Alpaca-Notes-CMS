import { describe, expect, it } from 'vitest'
import { parseFeedSubscriptions, parseFeedSubscriptionsFile, serializeFeedSubscriptions, sortFeedSubscriptions } from './feed-subscriptions'

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
