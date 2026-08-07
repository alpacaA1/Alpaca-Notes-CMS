import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useKnowledgeState } from './use-knowledge-state'

describe('useKnowledgeState hook', () => {
  it('initializes with default category and empty node map', () => {
    const { result } = renderHook(() => useKnowledgeState([]))

    expect(result.current.selectedTopicCategory).toBe('all')
    expect(result.current.topicNodeMap.size).toBe(0)
  })
})
