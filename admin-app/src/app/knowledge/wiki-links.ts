import type { ContentType, KnowledgeKind, PostIndexItem } from '../posts/post-types'

export type ParsedWikiLink = {
  raw: string
  targetKey: string
  label: string | null
  start: number
  end: number
}

export type TopicBacklinkItem = {
  targetKey: string
  sourcePost: PostIndexItem
  sourcePath: string
  sourceTitle: string
  sourceDate: string
  sourceContentType: ContentType
  excerpt: string
}

const WIKI_LINK_PATTERN = /\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/g
const SNIPPET_MAX_LENGTH = 100

function normalizeInlineLabel(value: string) {
  return value
    .replace(/\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/g, (_, targetKey: string, label?: string) => (label || targetKey).trim())
    .replace(/^>\s?/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateSnippet(value: string, maxLength = SNIPPET_MAX_LENGTH) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(1, maxLength - 1)).trim()}…`
}

function buildExcerpt(body: string, startIndex: number) {
  const lineStart = body.lastIndexOf('\n', startIndex)
  const lineEnd = body.indexOf('\n', startIndex)
  const rawLine = body.slice(lineStart < 0 ? 0 : lineStart + 1, lineEnd < 0 ? body.length : lineEnd)
  const normalizedLine = normalizeInlineLabel(rawLine)

  if (normalizedLine) {
    return truncateSnippet(normalizedLine)
  }

  const paragraphStart = Math.max(0, startIndex - 48)
  const paragraphEnd = Math.min(body.length, startIndex + 52)
  return truncateSnippet(normalizeInlineLabel(body.slice(paragraphStart, paragraphEnd)))
}

export function parseWikiLinks(markdown: string) {
  const links: ParsedWikiLink[] = []

  for (const match of markdown.matchAll(WIKI_LINK_PATTERN)) {
    const rawTargetKey = match[1]?.trim() || ''
    if (!rawTargetKey) {
      continue
    }

    links.push({
      raw: match[0],
      targetKey: rawTargetKey,
      label: match[2]?.trim() || null,
      start: match.index || 0,
      end: (match.index || 0) + match[0].length,
    })
  }

  return links
}

export function buildTopicNodeMap(posts: PostIndexItem[]) {
  const nodeMap = new Map<string, PostIndexItem>()

  posts.forEach((post) => {
    if (!isTopicNodePost(post)) {
      return
    }

    const nodeKey = post.nodeKey?.trim()
    if (!nodeKey || nodeMap.has(nodeKey)) {
      return
    }

    nodeMap.set(nodeKey, post)
  })

  return nodeMap
}

export function buildTopicBacklinkMap(posts: PostIndexItem[]) {
  const backlinkMap = new Map<string, TopicBacklinkItem[]>()

  posts.forEach((post) => {
    if (!post.body?.trim()) {
      return
    }

    parseWikiLinks(post.body).forEach((link) => {
      const backlinks = backlinkMap.get(link.targetKey) || []
      backlinks.push({
        targetKey: link.targetKey,
        sourcePost: post,
        sourcePath: post.path,
        sourceTitle: post.title,
        sourceDate: post.date,
        sourceContentType: post.contentType || 'post',
        excerpt: buildExcerpt(post.body || '', link.start),
      })
      backlinkMap.set(link.targetKey, backlinks)
    })
  })

  backlinkMap.forEach((backlinks, targetKey) => {
    backlinkMap.set(
      targetKey,
      [...backlinks].sort((left, right) => {
        const dateCompare = right.sourceDate.localeCompare(left.sourceDate)
        if (dateCompare !== 0) {
          return dateCompare
        }

        return left.sourceTitle.localeCompare(right.sourceTitle, 'zh-CN')
      }),
    )
  })

  return backlinkMap
}

export function isTopicKnowledgePost(
  post: Pick<PostIndexItem, 'contentType' | 'knowledgeKind' | 'nodeKey'> | null | undefined,
): post is Pick<PostIndexItem, 'contentType' | 'knowledgeKind' | 'nodeKey'> & { contentType: 'knowledge'; knowledgeKind: KnowledgeKind; nodeKey: string } {
  return Boolean(post && post.contentType === 'knowledge' && post.knowledgeKind === 'topic' && post.nodeKey?.trim())
}

export function isTopicNodePost(
  post: Pick<PostIndexItem, 'contentType' | 'knowledgeKind' | 'nodeKey' | 'isTopic'> | null | undefined,
): post is Pick<PostIndexItem, 'contentType' | 'knowledgeKind' | 'nodeKey' | 'isTopic'> & { nodeKey: string } {
  if (!post?.nodeKey?.trim()) {
    return false
  }

  return (post.contentType === 'knowledge' && post.knowledgeKind === 'topic') || (post.contentType === 'post' && post.isTopic === true)
}
