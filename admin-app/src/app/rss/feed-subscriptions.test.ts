import { describe, expect, it } from 'vitest'
import { parseFeedSubscriptions, serializeFeedSubscriptions } from './feed-subscriptions'

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
          createdAt: '2026-06-04T10:00:00.000Z',
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
        createdAt: '2026-06-04T10:00:00.000Z',
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
          createdAt: '2026-06-04T10:00:00.000Z',
        },
      ]),
    ).toContain('"id": "claude-blog"')
  })
})
