import { GitHubAuthError } from '../github-client'
import { READ_LATER_IMPORT_URL } from '../config'
import type { SessionState } from '../session'

export type ImportedReadLaterArticle = {
  title: string
  desc: string
  sourceName: string
  markdown: string
  requestedUrl: string
  finalUrl: string
}

type ImportResponse = Partial<ImportedReadLaterArticle> & {
  message?: string
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const message = (payload as ImportResponse).message
  return typeof message === 'string' ? message : ''
}

export async function importReadLaterFromUrl(session: SessionState, url: string): Promise<ImportedReadLaterArticle> {
  const response = await fetch(`${READ_LATER_IMPORT_URL}?url=${encodeURIComponent(url)}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${session.token}`,
    },
  })

  let payload: ImportResponse | null = null
  try {
    payload = (await response.json()) as ImportResponse
  } catch {
    payload = null
  }

  if (response.status === 401) {
    throw new GitHubAuthError(readErrorMessage(payload) || 'GitHub 会话已过期，请重新登录。')
  }

  if (!response.ok) {
    throw new Error(readErrorMessage(payload) || '导入正文失败。')
  }

  const title = typeof payload?.title === 'string' ? payload.title : ''
  const desc = typeof payload?.desc === 'string' ? payload.desc : ''
  const sourceName = typeof payload?.sourceName === 'string' ? payload.sourceName : ''
  const markdown = typeof payload?.markdown === 'string' ? payload.markdown.trim() : ''
  const requestedUrl = typeof payload?.requestedUrl === 'string' ? payload.requestedUrl : ''
  const finalUrl = typeof payload?.finalUrl === 'string' ? payload.finalUrl : ''

  if (!markdown) {
    throw new Error('导入结果不完整，请稍后重试。')
  }

  return {
    title,
    desc,
    sourceName,
    markdown,
    requestedUrl,
    finalUrl,
  }
}
