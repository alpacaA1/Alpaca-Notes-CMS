import { DIARY_PATH, KNOWLEDGE_PATH, POSTS_PATH, READ_LATER_PATH, REPO_BRANCH, REPO_NAME, REPO_OWNER } from './config'
import { isSupportedContentFileName } from './content-format'
import { AuthError, type SessionState } from './session'

const GITHUB_API_BASE = 'https://api.github.com'

type GitHubContentFile = {
  type: 'file'
  path: string
  sha: string
  name: string
  content?: string
  encoding?: string
}

type GitHubDirectoryEntry = {
  type: 'file' | 'dir'
  path: string
  sha: string
  name: string
}

type GitHubSavedContentFile = {
  path: string
  sha: string
}

type MarkdownFile = {
  path: string
  sha: string
  content: string
}

type GitHubSaveFileResponse = {
  content?: GitHubSavedContentFile
}

const markdownFileCache = new Map<string, MarkdownFile>()

export class GitHubAuthError extends AuthError {
  constructor(message = 'GitHub 会话已过期，请重新登录。') {
    super(message)
    this.name = 'GitHubAuthError'
  }
}

export class GitHubConflictError extends Error {
  constructor(message = '检测到远端内容已变更，请先重新加载文章后再覆盖保存。') {
    super(message)
    this.name = 'GitHubConflictError'
  }
}

function createHeaders(session: SessionState) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${session.token}`,
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function encodeBase64Bytes(bytes: Uint8Array) {
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
}

function encodeBase64(value: string) {
  return encodeBase64Bytes(new TextEncoder().encode(value))
}

function decodeBase64(value: string) {
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function cacheMarkdownFile(file: MarkdownFile): MarkdownFile {
  const cachedFile = { ...file }
  markdownFileCache.set(file.path, cachedFile)
  return cachedFile
}

export function readCachedMarkdownFile(path: string, sha?: string): MarkdownFile | null {
  const cachedFile = markdownFileCache.get(path)

  if (!cachedFile) {
    return null
  }

  if (sha && cachedFile.sha !== sha) {
    return null
  }

  return { ...cachedFile }
}

export function clearMarkdownFileCache() {
  markdownFileCache.clear()
}

function removeCachedMarkdownFile(path: string) {
  markdownFileCache.delete(path)
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

function resolveGitHubForbiddenMessage(response: Response, message?: string) {
  const normalizedMessage = String(message || '').trim()
  const remaining = response.headers.get('x-ratelimit-remaining')

  if (remaining === '0' || /rate limit/i.test(normalizedMessage)) {
    return 'GitHub API 请求已触发频率限制，请稍后重试。'
  }

  return normalizedMessage || 'GitHub 请求被拒绝。'
}

async function requestGitHub<T>(session: SessionState, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      ...createHeaders(session),
      ...(init?.headers || {}),
    },
  })

  if (response.status === 401) {
    throw new GitHubAuthError()
  }

  if (response.status === 409) {
    throw new GitHubConflictError()
  }

  if (!response.ok) {
    const data = await readJson<{ message?: string }>(response)
    if (response.status === 403) {
      throw new Error(resolveGitHubForbiddenMessage(response, data.message))
    }

    throw new Error(data.message || 'GitHub request failed.')
  }

  return readJson<T>(response)
}

async function listMarkdownFiles(session: SessionState, basePath: string): Promise<GitHubDirectoryEntry[]> {
  const path = `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${basePath}?ref=${encodeURIComponent(REPO_BRANCH)}`
  const entries = await requestGitHub<GitHubDirectoryEntry[]>(session, path)

  return entries.filter((entry) => entry.type === 'file' && isSupportedContentFileName(entry.name))
}

export async function listPostFiles(session: SessionState): Promise<GitHubDirectoryEntry[]> {
  return listMarkdownFiles(session, POSTS_PATH)
}

export async function listReadLaterFiles(session: SessionState): Promise<GitHubDirectoryEntry[]> {
  return listMarkdownFiles(session, READ_LATER_PATH)
}

export async function listDiaryFiles(session: SessionState): Promise<GitHubDirectoryEntry[]> {
  return listMarkdownFiles(session, DIARY_PATH)
}

export async function listKnowledgeFiles(session: SessionState): Promise<GitHubDirectoryEntry[]> {
  return listMarkdownFiles(session, KNOWLEDGE_PATH)
}

export async function fetchPostFile(
  session: SessionState,
  path: string,
): Promise<{ path: string; sha: string; content: string }> {
  const apiPath = `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${encodeURIComponent(REPO_BRANCH)}`
  const file = await requestGitHub<GitHubContentFile>(session, apiPath, {
    cache: 'no-store',
  })

  if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new Error('GitHub did not return a decodable content file.')
  }

  return cacheMarkdownFile({
    path: file.path,
    sha: file.sha,
    content: decodeBase64(file.content.replace(/\n/g, '')),
  })
}

export async function savePostFile(
  session: SessionState,
  file: { path: string; content: string; sha?: string },
): Promise<{ path: string; sha: string; content: string }> {
  const apiPath = `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${file.path}`
  const response = await requestGitHub<GitHubSaveFileResponse>(session, apiPath, {
    method: 'PUT',
    body: JSON.stringify({
      message: `${file.sha ? 'Update' : 'Create'} ${file.path}`,
      content: encodeBase64(file.content),
      branch: REPO_BRANCH,
      ...(file.sha ? { sha: file.sha } : {}),
    }),
  })

  if (!response.content?.path || !response.content.sha) {
    throw new Error('GitHub did not return saved file metadata.')
  }

  return cacheMarkdownFile({
    path: response.content.path,
    sha: response.content.sha,
    content: file.content,
  })
}

export async function fetchMarkdownFile(
  session: SessionState,
  path: string,
): Promise<{ path: string; sha: string; content: string }> {
  return fetchPostFile(session, path)
}

export async function saveMarkdownFile(
  session: SessionState,
  file: { path: string; content: string; sha?: string },
): Promise<{ path: string; sha: string; content: string }> {
  return savePostFile(session, file)
}

export async function deleteMarkdownFile(
  session: SessionState,
  file: { path: string; sha: string },
): Promise<void> {
  return deletePostFile(session, file)
}

export async function deletePostFile(
  session: SessionState,
  file: { path: string; sha: string },
): Promise<void> {
  const apiPath = `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${file.path}`
  await requestGitHub<GitHubSaveFileResponse>(session, apiPath, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `Delete ${file.path}`,
      sha: file.sha,
      branch: REPO_BRANCH,
    }),
  })
  removeCachedMarkdownFile(file.path)
}

export async function uploadImageFile(
  session: SessionState,
  file: { path: string; file: File },
): Promise<{ path: string; sha: string }> {
  const apiPath = `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${file.path}`
  const bytes = new Uint8Array(await file.file.arrayBuffer())
  const response = await requestGitHub<GitHubSaveFileResponse>(session, apiPath, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Create ${file.path}`,
      content: encodeBase64Bytes(bytes),
      branch: REPO_BRANCH,
    }),
  })

  if (!response.content?.path || !response.content.sha) {
    throw new Error('GitHub did not return saved file metadata.')
  }

  return {
    path: response.content.path,
    sha: response.content.sha,
  }
}

export type BatchUpdateResult = {
  success: string[]
  failed: { path: string; error: string }[]
}

/**
 * Serially fetch, mutate, and save a list of posts.
 * Runs one at a time to avoid hitting GitHub API rate limits.
 *
 * @param mutate - A function that receives the raw file content and returns
 *   the new content. Return `null` to skip the file (no changes needed).
 * @param onProgress - Called after each file is processed.
 */
export async function batchUpdatePostContents(
  session: SessionState,
  paths: string[],
  commitMessage: string,
  mutate: (content: string) => string | null,
  onProgress?: (completed: number, total: number) => void,
): Promise<BatchUpdateResult> {
  const result: BatchUpdateResult = { success: [], failed: [] }

  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]

    try {
      const file = await fetchPostFile(session, path)
      const newContent = mutate(file.content)

      if (newContent === null || newContent === file.content) {
        result.success.push(path)
        onProgress?.(i + 1, paths.length)
        continue
      }

      await savePostFile(session, {
        path: file.path,
        sha: file.sha,
        content: newContent,
      })
      result.success.push(path)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        throw caughtError
      }

      result.failed.push({
        path,
        error: caughtError instanceof Error ? caughtError.message : '更新失败。',
      })
    }

    onProgress?.(i + 1, paths.length)
  }

  return result
}
