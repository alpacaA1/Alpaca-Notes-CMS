import { DIARY_AI_URL } from '../config'
import { GitHubAuthError } from '../github-client'
import type { SessionState } from '../session'

export type DiaryAiEntry = {
  path: string
  title: string
  date: string
  body: string
}

export type DiaryAiResult = {
  materialMarkdown: string
  model?: string
}

type DiaryAiResponse = Partial<DiaryAiResult> & {
  message?: string
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const message = (payload as DiaryAiResponse).message
  return typeof message === 'string' ? message : ''
}

export async function organizeDiaryMaterials(
  session: SessionState,
  entries: DiaryAiEntry[],
): Promise<DiaryAiResult> {
  const response = await fetch(DIARY_AI_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ entries }),
  })

  let payload: DiaryAiResponse | null = null
  try {
    payload = (await response.json()) as DiaryAiResponse
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
