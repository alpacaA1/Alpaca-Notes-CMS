import type { ContentType, PostIndexItem } from './posts/post-types'

export type InternalReferenceCandidate = {
  targetKey: string
  title: string
  contentType: ContentType
  identifier: string
  keywords: string
  date: string
  path: string
  search?: InternalReferenceCandidateSearchFields
}

type InternalReferenceSearch = {
  contentType: ContentType | null
  query: string
}

type InternalReferenceCandidateSearchFields = {
  normalizedTitle: string
  normalizedIdentifier: string
  normalizedTargetKey: string
  strongTerms: string[]
  auxiliaryTerms: string[]
  bodyText: string
}

const INTERNAL_REFERENCE_TYPES: ContentType[] = ['read-later', 'knowledge', 'diary', 'post']
const INTERNAL_REFERENCE_BODY_QUERY_MIN_LENGTH = 3

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function joinSearchSegments(values: Array<string | null | undefined>) {
  return values
    .map((value) => value?.trim() || '')
    .filter(Boolean)
    .join('\n')
}

function normalizeTerms(values: Array<string | null | undefined>) {
  return Array.from(new Set(
    values
      .map((value) => normalizeText(value || ''))
      .filter(Boolean),
  ))
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
  return joinSearchSegments([
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
    ...targetKeys,
  ])
}

function buildInternalReferenceCandidateSearchFields(
  post: PostIndexItem,
  candidateTitle: string,
  identifier: string,
  targetKeys: string[],
): InternalReferenceCandidateSearchFields {
  return {
    normalizedTitle: normalizeText(candidateTitle),
    normalizedIdentifier: normalizeText(identifier),
    normalizedTargetKey: normalizeText(targetKeys[0] || ''),
    strongTerms: normalizeTerms([
      post.permalink || '',
      post.nodeKey || '',
      ...(post.aliases || []),
      ...targetKeys,
    ]),
    auxiliaryTerms: normalizeTerms([
      post.path,
      ...(post.categories || []),
      ...(post.tags || []),
      post.sourceTitle || '',
      post.sourcePath || '',
      post.sourceUrl || '',
      post.externalUrl || '',
      post.sourceName || '',
    ]),
    bodyText: post.bodySearchText || normalizeText(post.body || ''),
  }
}

function getCandidateSearchFields(candidate: InternalReferenceCandidate) {
  if (candidate.search) {
    return candidate.search
  }

  const legacySearchFields: InternalReferenceCandidateSearchFields = {
    normalizedTitle: normalizeText(candidate.title),
    normalizedIdentifier: normalizeText(candidate.identifier),
    normalizedTargetKey: normalizeText(candidate.targetKey),
    strongTerms: [],
    auxiliaryTerms: normalizeTerms([candidate.keywords]),
    bodyText: '',
  }
  candidate.search = legacySearchFields
  return legacySearchFields
}

function getTermMatchScore(
  terms: string[],
  normalizedQuery: string,
  scores: { exact: number; startsWith: number; includes: number },
) {
  let score = 0

  for (const term of terms) {
    if (!term) {
      continue
    }

    if (term === normalizedQuery) {
      return scores.exact
    }

    if (term.startsWith(normalizedQuery)) {
      score = Math.max(score, scores.startsWith)
      continue
    }

    if (term.includes(normalizedQuery)) {
      score = Math.max(score, scores.includes)
    }
  }

  return score
}

function shouldSearchBody(normalizedQuery: string) {
  const compactQuery = normalizedQuery.replace(/\s+/g, '')
  return Array.from(compactQuery).length >= INTERNAL_REFERENCE_BODY_QUERY_MIN_LENGTH
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
    const title = post.title.trim() || '未命名内容'
    dedupedCandidates.set(canonicalTargetKey, {
      targetKey: canonicalTargetKey,
      title,
      contentType,
      identifier,
      keywords: getReferenceCandidateKeywords(post, identifier, targetKeys),
      date: post.date,
      path: post.path,
      search: buildInternalReferenceCandidateSearchFields(post, title, identifier, targetKeys),
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
  const allowBodyMatch = shouldSearchBody(normalizedQuery)
  if (!normalizedQuery) {
    return []
  }

  return candidates
    .filter((candidate) => !contentType || candidate.contentType === contentType)
    .map((candidate) => {
      const searchFields = getCandidateSearchFields(candidate)
      const score = Math.max(
        getTermMatchScore([searchFields.normalizedTitle], normalizedQuery, {
          exact: 640,
          startsWith: 580,
          includes: 520,
        }),
        getTermMatchScore([searchFields.normalizedIdentifier], normalizedQuery, {
          exact: 500,
          startsWith: 460,
          includes: 420,
        }),
        getTermMatchScore([searchFields.normalizedTargetKey], normalizedQuery, {
          exact: 400,
          startsWith: 360,
          includes: 320,
        }),
        getTermMatchScore(searchFields.strongTerms, normalizedQuery, {
          exact: 340,
          startsWith: 300,
          includes: 260,
        }),
        getTermMatchScore(searchFields.auxiliaryTerms, normalizedQuery, {
          exact: 220,
          startsWith: 180,
          includes: 150,
        }),
        allowBodyMatch && searchFields.bodyText.includes(normalizedQuery) ? 90 : 0,
      )

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
