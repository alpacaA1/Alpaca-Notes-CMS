import { DIARY_AI_URL } from '../config'
import { GitHubAuthError } from '../github-client'
import type { ReadingStatus } from '../posts/parse-post'
import type { SessionState } from '../session'

export type MaterialAnnotationNote = {
  sectionLabel: string
  quote: string
  note: string
  updatedAt: string
}

type BaseWritingMaterialEntry = {
  path: string
  title: string
  date: string
  tags: string[]
}

export type DiaryAiEntry = BaseWritingMaterialEntry & {
  sourceType: 'diary'
  body: string
}

export type ReadLaterAiEntry = BaseWritingMaterialEntry & {
  sourceType: 'read-later'
  sourceName: string
  externalUrl: string
  readingStatus: ReadingStatus
  summary: string
  commentary: string
  annotationNotes: MaterialAnnotationNote[]
}

export type WritingMaterialEntry = DiaryAiEntry | ReadLaterAiEntry

export type WritingMaterialAiResult = {
  materialMarkdown: string
  model?: string
}

type WritingMaterialAiResponse = Partial<WritingMaterialAiResult> & {
  message?: string
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const message = (payload as WritingMaterialAiResponse).message
  return typeof message === 'string' ? message : ''
}

export async function organizeWritingMaterials(
  session: SessionState,
  entries: WritingMaterialEntry[],
): Promise<WritingMaterialAiResult> {
  const response = await fetch(DIARY_AI_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ entries }),
  })

  let payload: WritingMaterialAiResponse | null = null
  try {
    payload = (await response.json()) as WritingMaterialAiResponse
  } catch {
    payload = null
  }

  if (response.status === 401) {
    throw new GitHubAuthError(readErrorMessage(payload) || 'GitHub 会话已过期，请重新登录。')
  }

  if (!response.ok) {
    throw new Error(readErrorMessage(payload) || '素材整理失败。')
  }

  const materialMarkdown = typeof payload?.materialMarkdown === 'string' ? payload.materialMarkdown.trim() : ''
  if (!materialMarkdown) {
    throw new Error('素材整理结果为空，请稍后重试。')
  }

  return {
    materialMarkdown,
    ...(typeof payload?.model === 'string' && payload.model ? { model: payload.model } : {}),
  }
}
