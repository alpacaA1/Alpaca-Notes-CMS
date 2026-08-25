import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as githubClientModule from '../github-client'
import {
  clearObservationOutbox,
  enqueueObservation,
  getPendingObservationCount,
  readObservationOutbox,
  removeObservationFromOutbox,
  syncObservationOutbox,
} from './self-observation-outbox'
import type { SelfObservationRecord } from './self-observation-types'

describe('self-observation-outbox', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  const sampleRecord: SelfObservationRecord = {
    id: 'so-test-1',
    kind: 'emotion',
    createdAt: '2026-08-25T14:20:00.000Z',
    data: {
      emotions: ['烦', '紧张'],
      event: '沟通不畅',
      intention: '停一下',
    },
  }

  it('enqueues and reads outbox items', () => {
    expect(getPendingObservationCount()).toBe(0)

    enqueueObservation(sampleRecord)
    expect(getPendingObservationCount()).toBe(1)

    const items = readObservationOutbox()
    expect(items.length).toBe(1)
    expect(items[0].id).toBe('so-test-1')
    expect(items[0].record.data).toEqual(sampleRecord.data)

    // Enqueue duplicate does not duplicate
    enqueueObservation(sampleRecord)
    expect(getPendingObservationCount()).toBe(1)
  })

  it('removes and clears outbox items', () => {
    enqueueObservation(sampleRecord)
    expect(getPendingObservationCount()).toBe(1)

    removeObservationFromOutbox('so-test-1')
    expect(getPendingObservationCount()).toBe(0)

    enqueueObservation(sampleRecord)
    clearObservationOutbox()
    expect(getPendingObservationCount()).toBe(0)
  })

  it('syncs outbox items to GitHub and clears outbox on success', async () => {
    enqueueObservation(sampleRecord)

    const saveSpy = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: 'source/diary/20260825000000.md',
      sha: 'sha-saved-1',
      content: 'content',
    })

    const result = await syncObservationOutbox({ token: 'test-token' }, { diaryPosts: [] })
    expect(result.syncedCount).toBe(1)
    expect(result.remainingCount).toBe(0)
    expect(getPendingObservationCount()).toBe(0)
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })
})
