import { useCallback, useEffect, useState } from 'react'
import type { SessionState } from '../session'
import {
  readFeedSubscriptions,
  saveFeedSubscriptions,
  type FeedFolder,
  type FeedSubscription,
  type FeedSubscriptionsState,
} from '../rss/feed-subscriptions'

export function useRssState(
  session: SessionState | null,
  adminView: string,
  setError: (msg: string | null) => void,
  setSuccessMessage: (msg: string | null) => void,
) {
  const [feedState, setFeedState] = useState<FeedSubscriptionsState | null>(null)
  const [isFeedLoading, setIsFeedLoading] = useState(false)
  const [isSavingFeed, setIsSavingFeed] = useState(false)

  const reloadFeedSubscriptions = useCallback(async () => {
    if (!session) {
      return
    }

    setIsFeedLoading(true)
    try {
      const loaded = await readFeedSubscriptions(session)
      setFeedState(loaded)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取 RSS 订阅设置失败。')
    } finally {
      setIsFeedLoading(false)
    }
  }, [session, setError])

  useEffect(() => {
    if (session && adminView === 'feed' && !feedState && !isFeedLoading) {
      void reloadFeedSubscriptions()
    }
  }, [session, adminView, feedState, isFeedLoading, reloadFeedSubscriptions])

  const persistFeedSubscriptions = async (nextSubscriptions: FeedSubscription[], nextFolders: FeedFolder[]) => {
    if (!session || !feedState) {
      return
    }

    setIsSavingFeed(true)
    setError(null)
    try {
      const saved = await saveFeedSubscriptions(session, {
        ...feedState,
        subscriptions: nextSubscriptions,
        folders: nextFolders,
      })
      setFeedState(saved)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存 RSS 订阅设置失败。')
      throw saveError
    } finally {
      setIsSavingFeed(false)
    }
  }

  return {
    feedState,
    setFeedState,
    isFeedLoading,
    isSavingFeed,
    reloadFeedSubscriptions,
    persistFeedSubscriptions,
  }
}
