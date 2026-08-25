import { findTodayDiaryPost } from '../diary/diary-quote'
import { fetchMarkdownFile, saveMarkdownFile } from '../github-client'
import { buildDiaryIndex } from '../posts/index-posts'
import { createNewDiaryEntry } from '../posts/new-post'
import { parsePost } from '../posts/parse-post'
import type { PostIndexItem } from '../posts/post-types'
import { serializePost } from '../posts/serialize-post'
import type { SessionState } from '../session'
import {
  appendObservationToDiaryBody,
  formatSelfObservationBlock,
  hasObservationId,
} from './self-observation-format'
import type {
  SelfObservationOutboxItem,
  SelfObservationRecord,
} from './self-observation-types'

const OUTBOX_STORAGE_KEY = 'alpaca_self_observation_outbox_v1'

export function readObservationOutbox(): SelfObservationOutboxItem[] {
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeObservationOutbox(items: SelfObservationOutboxItem[]): void {
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(items))
  } catch (error) {
    console.error('Failed to write self-observation outbox to localStorage:', error)
  }
}

export function enqueueObservation(record: SelfObservationRecord): SelfObservationOutboxItem {
  const items = readObservationOutbox()
  const existing = items.find((item) => item.id === record.id)
  if (existing) {
    return existing
  }

  const newItem: SelfObservationOutboxItem = {
    id: record.id,
    record,
    createdAt: new Date().toISOString(),
    status: 'pending',
  }

  writeObservationOutbox([...items, newItem])
  return newItem
}

export function removeObservationFromOutbox(id: string): void {
  const items = readObservationOutbox()
  const next = items.filter((item) => item.id !== id)
  writeObservationOutbox(next)
}

export function clearObservationOutbox(): void {
  try {
    localStorage.removeItem(OUTBOX_STORAGE_KEY)
  } catch (error) {
    console.error('Failed to clear self-observation outbox:', error)
  }
}

export function getPendingObservationCount(): number {
  return readObservationOutbox().length
}

export interface SyncObservationOptions {
  diaryPosts?: PostIndexItem[]
  onDiaryUpdated?: (updatedPost: PostIndexItem) => void
}

export interface SyncObservationResult {
  syncedCount: number
  remainingCount: number
  error?: string
}

export async function syncObservationOutbox(
  session: SessionState,
  options: SyncObservationOptions = {},
): Promise<SyncObservationResult> {
  const items = readObservationOutbox()
  if (items.length === 0) {
    return { syncedCount: 0, remainingCount: 0 }
  }

  try {
    const now = new Date()
    const currentDiaryPosts =
      options.diaryPosts !== undefined ? options.diaryPosts : await buildDiaryIndex(session)
    const todayPost = findTodayDiaryPost(currentDiaryPosts, now)

    let targetDiary = todayPost
      ? parsePost(await fetchMarkdownFile(session, todayPost.path))
      : createNewDiaryEntry(now)

    let updatedBody = targetDiary.body
    let anyAppended = false
    const processedItemIds: string[] = []

    for (const item of items) {
      if (!hasObservationId(updatedBody, item.record.id)) {
        const block = formatSelfObservationBlock(item.record)
        updatedBody = appendObservationToDiaryBody(updatedBody, block)
        anyAppended = true
      }
      processedItemIds.push(item.id)
    }

    if (anyAppended) {
      targetDiary.body = updatedBody
      const savedContent = serializePost(targetDiary)
      const savedFile = await saveMarkdownFile(session, {
        path: targetDiary.path,
        sha: targetDiary.sha || undefined,
        content: savedContent,
      })

      if (options.onDiaryUpdated) {
        options.onDiaryUpdated({
          path: savedFile.path,
          sha: savedFile.sha,
          title: targetDiary.frontmatter.title,
          date: targetDiary.frontmatter.date,
          published: targetDiary.frontmatter.published ?? false,
          hasExplicitPublished: true,
          categories: targetDiary.frontmatter.categories || [],
          tags: targetDiary.frontmatter.tags || [],
          contentType: 'diary',
        })
      }
    }

    // Remove only after save succeeds
    for (const id of processedItemIds) {
      removeObservationFromOutbox(id)
    }

    const remaining = readObservationOutbox().length
    return {
      syncedCount: items.length - remaining,
      remainingCount: remaining,
    }
  } catch (error) {
    console.error('Failed to sync self-observation outbox:', error)
    return {
      syncedCount: 0,
      remainingCount: readObservationOutbox().length,
      error: error instanceof Error ? error.message : '同步失败，请检查网络或重新登录。',
    }
  }
}
