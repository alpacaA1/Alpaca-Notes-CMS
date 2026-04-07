import { POSTS_PATH, REPO_BRANCH, REPO_NAME, REPO_OWNER } from './config'
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

type GitHubSaveFileResponse = {
  content?: GitHubSavedContentFile
}

export class GitHubAuthError extends AuthError {
  constructor(message = 'GitHub session expired. Please sign in again.') {
    super(message)
    this.name = 'GitHubAuthError'
  }
}

export class GitHubConflictError extends Error {
  constructor(message = 'Remote changes detected. Reload the post before overwriting it.') {
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

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary)
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function requestGitHub<T>(session: SessionState, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      ...createHeaders(session),
      ...(init?.headers || {}),
    },
  })

  if (response.status === 401 || response.status === 403) {
    throw new GitHubAuthError()
  }

  if (response.status === 409) {
    throw new GitHubConflictError()
  }

  if (!response.ok) {
    const data = await readJson<{ message?: string }>(response)
    throw new Error(data.message || 'GitHub request failed.')
  }

  return readJson<T>(response)
}

export async function listPostFiles(session: SessionState): Promise<GitHubDirectoryEntry[]> {
  const path = `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${POSTS_PATH}?ref=${encodeURIComponent(REPO_BRANCH)}`
  const entries = await requestGitHub<GitHubDirectoryEntry[]>(session, path)

  return entries.filter((entry) => entry.type === 'file' && entry.name.endsWith('.md'))
}

export async function fetchPostFile(
  session: SessionState,
  path: string,
): Promise<{ path: string; sha: string; content: string }> {
  const apiPath = `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${encodeURIComponent(REPO_BRANCH)}`
  const file = await requestGitHub<GitHubContentFile>(session, apiPath)

  if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string') {
    throw new Error('GitHub did not return a decodable markdown file.')
  }

  return {
    path: file.path,
    sha: file.sha,
    content: atob(file.content.replace(/\n/g, '')),
  }
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

  return {
    path: response.content.path,
    sha: response.content.sha,
    content: file.content,
  }
}
