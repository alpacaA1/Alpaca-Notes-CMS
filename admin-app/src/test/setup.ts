import { beforeEach, vi } from 'vitest'
import { FEED_SUBSCRIPTIONS_PATH } from '../app/config'
import * as feedSubscriptionsModule from '../app/rss/feed-subscriptions'

beforeEach(() => {
  vi.spyOn(feedSubscriptionsModule, 'readFeedSubscriptions').mockResolvedValue({
    path: FEED_SUBSCRIPTIONS_PATH,
    folders: [],
    subscriptions: [],
  })
})
