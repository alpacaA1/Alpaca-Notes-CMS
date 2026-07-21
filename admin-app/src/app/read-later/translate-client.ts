import { TRANSLATE_READ_LATER_URL } from '../config'
import { GitHubAuthError } from '../github-client'
import type { SessionState } from '../session'

export type TranslateReadLaterPayload = {
  title?: string
  text: string
  targetLang?: string
}

export type TranslateReadLaterResult = {
  translatedText: string
  model?: string
}

type TranslateReadLaterResponse = Partial<TranslateReadLaterResult> & {
  message?: string
}

function readErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return ''
  }

  const message = (payload as TranslateReadLaterResponse).message
  return typeof message === 'string' ? message : ''
}

export async function translateReadLaterContent(
  session: SessionState,
  payloadData: TranslateReadLaterPayload,
): Promise<TranslateReadLaterResult> {
  let response: Response
  try {
    response = await fetch(TRANSLATE_READ_LATER_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payloadData),
    })
  } catch {
    throw new Error('网络连接失败，无法连接翻译服务。')
  }

  let payload: TranslateReadLaterResponse | null = null
  try {
    payload = (await response.json()) as TranslateReadLaterResponse
  } catch {
    payload = null
  }

  if (response.status === 401) {
    throw new GitHubAuthError(readErrorMessage(payload) || 'GitHub 会话已过期，请重新登录。')
  }

  if (response.status === 404) {
    throw new Error('翻译服务接口未部署或返回 404，请确认 Vercel 部署。')
  }

  if (!response.ok) {
    throw new Error(readErrorMessage(payload) || '翻译失败，请重试。')
  }

  const translatedText = typeof payload?.translatedText === 'string' ? payload.translatedText.trim() : ''
  if (!translatedText) {
    throw new Error('翻译结果为空，请稍后重试。')
  }

  return {
    translatedText,
    ...(typeof payload?.model === 'string' && payload.model ? { model: payload.model } : {}),
  }
}
