import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useRssState } from './use-rss-state'

vi.mock('../rss/feed-subscriptions', () => ({
  readFeedSubscriptions: vi.fn().mockResolvedValue({ path: 'test', folders: [], subscriptions: [] }),
  saveFeedSubscriptions: vi.fn().mockResolvedValue({ path: 'test', folders: [], subscriptions: [] }),
}))

describe('useRssState hook', () => {
  it('initializes with null feedState', () => {
    const setError = vi.fn()
    const setSuccess = vi.fn()
    const { result } = renderHook(() => useRssState(null, 'feed', setError, setSuccess))

    expect(result.current.feedState).toBeNull()
    expect(result.current.isFeedLoading).toBe(false)
  })
})
