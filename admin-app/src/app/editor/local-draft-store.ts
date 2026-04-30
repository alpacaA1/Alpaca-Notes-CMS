import type { ParsedPost } from '../posts/parse-post'

const LOCAL_DRAFT_STORAGE_PREFIX = 'alpaca-admin-local-draft:'

export type StoredLocalDraft = {
  version: 1
  updatedAt: string
  savedDocument: ParsedPost | null
  draftDocument: ParsedPost
}

export type LocalDraftSummary = {
  path: string
  contentType: 'post' | 'read-later'
  title: string
  updatedAt: string
  hasSavedBaseline: boolean
}

function getStorageKey(path: string) {
  return `${LOCAL_DRAFT_STORAGE_PREFIX}${path}`
}

function readStorage(storage: Pick<Storage, 'getItem' | 'key' | 'length'> = window.localStorage) {
  return storage
}

function isParsedPost(value: unknown): value is ParsedPost {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  const frontmatter = candidate.frontmatter as Record<string, unknown> | undefined

  return (
    typeof candidate.path === 'string' &&
    typeof candidate.sha === 'string' &&
    typeof candidate.body === 'string' &&
    frontmatter !== undefined &&
    typeof frontmatter.title === 'string' &&
    typeof frontmatter.date === 'string' &&
    typeof frontmatter.desc === 'string' &&
    Array.isArray(frontmatter.categories) &&
    Array.isArray(frontmatter.tags)
  )
}

function isStoredLocalDraft(value: unknown): value is StoredLocalDraft {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Record<string, unknown>
  return (
    candidate.version === 1 &&
    typeof candidate.updatedAt === 'string' &&
    (candidate.savedDocument === null || isParsedPost(candidate.savedDocument)) &&
    isParsedPost(candidate.draftDocument)
  )
}

export function saveLocalDraft(
  savedDocument: ParsedPost | null,
  draftDocument: ParsedPost,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
) {
  const payload: StoredLocalDraft = {
    version: 1,
    updatedAt: new Date().toISOString(),
    savedDocument,
    draftDocument,
  }

  try {
    storage.setItem(getStorageKey(draftDocument.path), JSON.stringify(payload))
  } catch {
    // Ignore storage quota and availability errors.
  }
}

export function readLocalDraft(
  path: string,
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): StoredLocalDraft | null {
  try {
    const raw = storage.getItem(getStorageKey(path))
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)
    return isStoredLocalDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function removeLocalDraft(
  path: string,
  storage: Pick<Storage, 'removeItem'> = window.localStorage,
) {
  try {
    storage.removeItem(getStorageKey(path))
  } catch {
    // Ignore storage availability errors.
  }
}

export function listLocalDraftSummaries(
  storage: Pick<Storage, 'getItem' | 'key' | 'length'> = window.localStorage,
): LocalDraftSummary[] {
  const summaries: LocalDraftSummary[] = []
  const resolvedStorage = readStorage(storage)

  for (let index = 0; index < resolvedStorage.length; index += 1) {
    const key = resolvedStorage.key(index)
    if (!key || !key.startsWith(LOCAL_DRAFT_STORAGE_PREFIX)) {
      continue
    }

    const path = key.slice(LOCAL_DRAFT_STORAGE_PREFIX.length)
    const draft = readLocalDraft(path, resolvedStorage)
    if (!draft) {
      continue
    }

    summaries.push({
      path,
      contentType: draft.draftDocument.contentType === 'read-later' ? 'read-later' : 'post',
      title: draft.draftDocument.frontmatter.title.trim() || '未命名本地草稿',
      updatedAt: draft.updatedAt,
      hasSavedBaseline: Boolean(draft.savedDocument?.sha),
    })
  }

  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}
