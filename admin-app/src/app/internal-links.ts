import type { ContentType, PostIndexItem } from './posts/post-types'

export type InternalReferenceCandidate = {
  targetKey: string
  title: string
  contentType: ContentType
  identifier: string
  keywords: string
  date: string
  path: string
}

type InternalReferenceSearch = {
  contentType: ContentType | null
  query: string
}

const INTERNAL_REFERENCE_TYPES: ContentType[] = ['read-later', 'knowledge', 'diary', 'post']

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

export function getInternalReferenceTypeLabel(contentType: ContentType) {
  if (contentType === 'read-later') {
    return '待读'
  }

  if (contentType === 'diary') {
    return '日记'
  }

  if (contentType === 'knowledge') {
    return '知识点'
  }

  return '文章'
}

export function parseInternalReferenceTargetKey(targetKey: string) {
  const trimmedTargetKey = targetKey.trim()
  const separatorIndex = trimmedTargetKey.indexOf(':')
  if (separatorIndex <= 0) {
    return null
  }

  const contentType = trimmedTargetKey.slice(0, separatorIndex) as ContentType
  const identifier = trimmedTargetKey.slice(separatorIndex + 1).trim()
  if (!INTERNAL_REFERENCE_TYPES.includes(contentType) || !identifier) {
    return null
  }

  return {
    contentType,
    identifier,
  }
}

function getCanonicalReferenceIdentifier(post: PostIndexItem) {
  if (post.contentType === 'diary' || post.contentType === 'read-later') {
    return post.path
  }

  if (post.contentType === 'knowledge') {
    return post.nodeKey?.trim() || post.path
  }

  return post.permalink?.trim() || post.path
}

export function getInternalReferenceTargetKeys(post: PostIndexItem) {
  const contentType = post.contentType || 'post'
  const targetKeys = new Set<string>()
  const addTargetKey = (identifier: string | null | undefined) => {
    const normalizedIdentifier = identifier?.trim()
    if (!normalizedIdentifier) {
      return
    }

    targetKeys.add(`${contentType}:${normalizedIdentifier}`)
  }

  addTargetKey(getCanonicalReferenceIdentifier(post))

  if (contentType === 'post') {
    addTargetKey(post.permalink || null)
    addTargetKey(post.path)
  }

  if (contentType === 'knowledge') {
    addTargetKey(post.nodeKey || null)
    addTargetKey(post.path)
  }

  if (contentType === 'diary' || contentType === 'read-later') {
    addTargetKey(post.path)
  }

  return Array.from(targetKeys)
}

function getReferenceCandidateKeywords(post: PostIndexItem, identifier: string, targetKeys: string[]) {
  return [
    post.title,
    identifier,
    post.path,
    post.permalink || '',
    post.nodeKey || '',
    ...(post.aliases || []),
    ...(post.categories || []),
    ...(post.tags || []),
    post.sourceTitle || '',
    post.sourcePath || '',
    post.sourceUrl || '',
    post.externalUrl || '',
    post.sourceName || '',
    post.searchText || '',
    ...targetKeys,
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildInternalReferenceCandidates(posts: PostIndexItem[]) {
  const dedupedCandidates = new Map<string, InternalReferenceCandidate>()

  posts.forEach((post) => {
    const contentType = post.contentType || 'post'
    const targetKeys = getInternalReferenceTargetKeys(post)
    const canonicalTargetKey = targetKeys[0]
    if (!canonicalTargetKey || dedupedCandidates.has(canonicalTargetKey)) {
      return
    }

    const identifier = parseInternalReferenceTargetKey(canonicalTargetKey)?.identifier || canonicalTargetKey
    dedupedCandidates.set(canonicalTargetKey, {
      targetKey: canonicalTargetKey,
      title: post.title.trim() || '未命名内容',
      contentType,
      identifier,
      keywords: getReferenceCandidateKeywords(post, identifier, targetKeys),
      date: post.date,
      path: post.path,
    })
  })

  return Array.from(dedupedCandidates.values()).sort((left, right) => {
    const dateCompare = right.date.localeCompare(left.date)
    if (dateCompare !== 0) {
      return dateCompare
    }

    return left.title.localeCompare(right.title, 'zh-CN')
  })
}

export function buildInternalReferenceLookup(posts: PostIndexItem[]) {
  const referenceLookup = new Map<string, PostIndexItem>()

  posts.forEach((post) => {
    getInternalReferenceTargetKeys(post).forEach((targetKey) => {
      if (!referenceLookup.has(targetKey)) {
        referenceLookup.set(targetKey, post)
      }
    })
  })

  return referenceLookup
}

export function buildInternalReferenceMarkdown(candidate: Pick<InternalReferenceCandidate, 'targetKey' | 'title'>) {
  return `[[${candidate.targetKey}|${candidate.title}]]`
}

export function parseInternalReferenceSearch(rawQuery: string): InternalReferenceSearch {
  const trimmedQuery = rawQuery.trim()
  if (!trimmedQuery) {
    return { contentType: null, query: '' }
  }

  const lowerQuery = trimmedQuery.toLocaleLowerCase()
  const matchedContentType = INTERNAL_REFERENCE_TYPES.find((contentType) => lowerQuery.startsWith(`${contentType}:`))
  if (!matchedContentType) {
    return { contentType: null, query: trimmedQuery }
  }

  return {
    contentType: matchedContentType,
    query: trimmedQuery.slice(matchedContentType.length + 1).trim(),
  }
}

export function searchInternalReferenceCandidates(
  candidates: InternalReferenceCandidate[],
  rawQuery: string,
  limit = 8,
) {
  const { contentType, query } = parseInternalReferenceSearch(rawQuery)
  const normalizedQuery = normalizeText(query)
  if (!normalizedQuery) {
    return []
  }

  return candidates
    .filter((candidate) => !contentType || candidate.contentType === contentType)
    .map((candidate) => {
      const normalizedTitle = normalizeText(candidate.title)
      const normalizedIdentifier = normalizeText(candidate.identifier)
      const normalizedKeywords = normalizeText(candidate.keywords)
      const normalizedTargetKey = normalizeText(candidate.targetKey)
      let score = 0

      if (normalizedTitle === normalizedQuery) {
        score = 520
      } else if (normalizedTitle.startsWith(normalizedQuery)) {
        score = 460
      } else if (normalizedTitle.includes(normalizedQuery)) {
        score = 380
      } else if (normalizedIdentifier.startsWith(normalizedQuery)) {
        score = 320
      } else if (normalizedIdentifier.includes(normalizedQuery)) {
        score = 280
      } else if (normalizedTargetKey.includes(normalizedQuery)) {
        score = 220
      } else if (normalizedKeywords.includes(normalizedQuery)) {
        score = 160
      }

      return { candidate, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      const scoreCompare = right.score - left.score
      if (scoreCompare !== 0) {
        return scoreCompare
      }

      const dateCompare = right.candidate.date.localeCompare(left.candidate.date)
      if (dateCompare !== 0) {
        return dateCompare
      }

      return left.candidate.title.localeCompare(right.candidate.title, 'zh-CN')
    })
    .slice(0, limit)
    .map((entry) => entry.candidate)
}
