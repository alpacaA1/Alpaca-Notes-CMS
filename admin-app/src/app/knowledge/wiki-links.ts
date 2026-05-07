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
const GENERATED_TOPIC_BACKLINKS_START = '<!-- topic-backlinks:start -->'
const GENERATED_TOPIC_BACKLINKS_END = '<!-- topic-backlinks:end -->'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

function getTopicBacklinkTypeLabel(contentType: ContentType) {
  if (contentType === 'diary') {
    return '日记'
  }

  if (contentType === 'knowledge') {
    return '知识点'
  }

  return '文章'
}

function renderBlockquote(value: string) {
  return value
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n')
}

function dedupeTopicBacklinks(backlinks: TopicBacklinkItem[]) {
  const seen = new Set<string>()

  return backlinks.filter((backlink) => {
    const dedupeKey = [backlink.sourcePath, backlink.sourceDate, backlink.sourceTitle, backlink.excerpt].join('::')
    if (seen.has(dedupeKey)) {
      return false
    }

    seen.add(dedupeKey)
    return true
  })
}

export function stripGeneratedTopicBacklinks(markdown: string) {
  const generatedSectionPattern = new RegExp(
    `${escapeRegExp(GENERATED_TOPIC_BACKLINKS_START)}[\\s\\S]*?${escapeRegExp(GENERATED_TOPIC_BACKLINKS_END)}\\n?`,
    'g',
  )
  const normalizedMarkdown = String(markdown || '')
  const hadTrailingNewline = normalizedMarkdown.endsWith('\n')
  const strippedMarkdown = normalizedMarkdown.replace(generatedSectionPattern, '').replace(/\n{3,}/g, '\n\n').trimEnd()

  return hadTrailingNewline && strippedMarkdown.length > 0 ? `${strippedMarkdown}\n` : strippedMarkdown
}

export function buildTopicBacklinksMarkdown(backlinks: TopicBacklinkItem[]) {
  const normalizedBacklinks = dedupeTopicBacklinks(backlinks).filter((backlink) => backlink.excerpt.trim())
  if (normalizedBacklinks.length === 0) {
    return ''
  }

  const sections = normalizedBacklinks.flatMap((backlink) => {
    const sourceTitle = backlink.sourceTitle.trim() || '未命名内容'
    const sourceDate = backlink.sourceDate.slice(0, 10) || '无日期'
    const sourceMeta = `${getTopicBacklinkTypeLabel(backlink.sourceContentType)} · ${sourceDate}`

    return [
      `### ${sourceTitle}`,
      sourceMeta,
      renderBlockquote(backlink.excerpt),
    ]
  })

  return [
    GENERATED_TOPIC_BACKLINKS_START,
    '## 相关双链摘录',
    ...sections,
    GENERATED_TOPIC_BACKLINKS_END,
  ].join('\n\n')
}

export function appendTopicBacklinksToMarkdown(markdown: string, backlinks: TopicBacklinkItem[]) {
  const cleanedMarkdown = stripGeneratedTopicBacklinks(markdown)
  const backlinksMarkdown = buildTopicBacklinksMarkdown(backlinks)

  if (!backlinksMarkdown) {
    return cleanedMarkdown
  }

  return cleanedMarkdown.trim()
    ? `${cleanedMarkdown}\n\n${backlinksMarkdown}`
    : backlinksMarkdown
}

export function resolveWikiLinkTargetKey(targetKey: string, topicNodeMap: Map<string, PostIndexItem>) {
  const normalizedTargetKey = targetKey.trim()
  if (!normalizedTargetKey) {
    return ''
  }

  return topicNodeMap.get(normalizedTargetKey)?.nodeKey?.trim() || normalizedTargetKey
}

export function collectResolvedWikiLinkTargetKeys(markdown: string, topicNodeMap: Map<string, PostIndexItem>) {
  return Array.from(
    new Set(
      parseWikiLinks(stripGeneratedTopicBacklinks(markdown))
        .map((link) => resolveWikiLinkTargetKey(link.targetKey, topicNodeMap))
        .filter(Boolean),
    ),
  )
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
  const aliasEntries: Array<[string, PostIndexItem]> = []

  posts.forEach((post) => {
    if (!isTopicNodePost(post)) {
      return
    }

    const nodeKey = post.nodeKey?.trim()
    if (!nodeKey || nodeMap.has(nodeKey)) {
      return
    }

    nodeMap.set(nodeKey, post)

    ;(post.aliases || []).forEach((alias) => {
      const normalizedAlias = alias.trim()
      if (!normalizedAlias || normalizedAlias === nodeKey || nodeMap.has(normalizedAlias)) {
        return
      }

      aliasEntries.push([normalizedAlias, post])
    })
  })

  aliasEntries.forEach(([alias, post]) => {
    if (!nodeMap.has(alias)) {
      nodeMap.set(alias, post)
    }
  })

  return nodeMap
}

export function buildTopicBacklinkMap(posts: PostIndexItem[]) {
  const backlinkMap = new Map<string, TopicBacklinkItem[]>()
  const topicNodeMap = buildTopicNodeMap(posts)

  posts.forEach((post) => {
    if (!post.body?.trim()) {
      return
    }

    parseWikiLinks(stripGeneratedTopicBacklinks(post.body)).forEach((link) => {
      const resolvedTargetKey = resolveWikiLinkTargetKey(link.targetKey, topicNodeMap)
      const backlinks = backlinkMap.get(resolvedTargetKey) || []
      backlinks.push({
        targetKey: resolvedTargetKey,
        sourcePost: post,
        sourcePath: post.path,
        sourceTitle: post.title,
        sourceDate: post.date,
        sourceContentType: post.contentType || 'post',
        excerpt: buildExcerpt(post.body || '', link.start),
      })
      backlinkMap.set(resolvedTargetKey, backlinks)
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
