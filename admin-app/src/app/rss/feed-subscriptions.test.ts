import { describe, expect, it } from 'vitest'
import { parseFeedSubscriptions, serializeFeedSubscriptions, sortFeedSubscriptions } from './feed-subscriptions'

describe('feed subscriptions store', () => {
  it('parses valid feed subscriptions', () => {
    const subscriptions = parseFeedSubscriptions(JSON.stringify({
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

    expect(subscriptions).toEqual([
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
      ]),
    ).toContain('"id": "claude-blog"')
  })

  it('sorts subscriptions by read-later count first, then updatedAt desc', () => {
    const sorted = sortFeedSubscriptions([
      {
        id: 'feed-a',
        title: 'Feed A',
        url: 'https://example.com/a.xml',
        description: '',
        category: '',
        sourceType: 'manual',
        articleCount: 10,
        readLaterCount: 0,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '',
      },
      {
        id: 'feed-b',
        title: 'Feed B',
        url: 'https://example.com/b.xml',
        description: '',
        category: '',
        sourceType: 'manual',
        articleCount: 10,
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
        articleCount: 10,
        readLaterCount: 1,
        createdAt: '2026-06-04T10:00:00.000Z',
        updatedAt: '2026-06-04T12:00:00.000Z',
      },
    ])

    expect(sorted.map((subscription) => subscription.id)).toEqual(['feed-c', 'feed-b', 'feed-a'])
  })
})
