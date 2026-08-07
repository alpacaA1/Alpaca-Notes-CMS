import { useMemo, useState } from 'react'
import type { PostIndexItem } from '../posts/post-types'
import { buildTopicNodeMap } from '../knowledge/wiki-links'

export function useKnowledgeState(posts: PostIndexItem[]) {
  const [selectedTopicCategory, setSelectedTopicCategory] = useState<string>('all')

  const topicNodeMap = useMemo(() => {
    return buildTopicNodeMap(posts)
  }, [posts])

  return {
    selectedTopicCategory,
    setSelectedTopicCategory,
    topicNodeMap,
  }
}
