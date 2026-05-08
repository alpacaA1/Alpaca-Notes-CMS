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

type BlockquoteExcerptRange = {
  start: number
  end: number
  excerpt: string
}

type ParagraphExcerptRange = {
  start: number
  end: number
  excerpt: string
}

function isBlockquoteLine(line: string) {
  return /^\s*(?:>\s?)+/.test(line)
}

function normalizeBlockquoteLine(line: string) {
  return normalizeInlineLabel(line.replace(/^\s*(?:>\s?)+/, ''))
}

function collectBlockquoteExcerptRanges(body: string) {
  const ranges: BlockquoteExcerptRange[] = []
  const normalizedBody = String(body || '')
  let index = 0
  let currentStart = -1
  let currentEnd = -1
  let currentLines: string[] = []

  const flushCurrentRange = () => {
    if (currentStart < 0) {
      return
    }

    const excerpt = currentLines.join('\n').trim()
    if (excerpt) {
      ranges.push({
        start: currentStart,
        end: currentEnd,
        excerpt,
      })
    }

    currentStart = -1
    currentEnd = -1
    currentLines = []
  }

  while (index <= normalizedBody.length) {
    const nextLineBreak = normalizedBody.indexOf('\n', index)
    const lineEnd = nextLineBreak < 0 ? normalizedBody.length : nextLineBreak
    const rawLine = normalizedBody.slice(index, lineEnd).replace(/\r$/, '')

    if (isBlockquoteLine(rawLine)) {
      if (currentStart < 0) {
        currentStart = index
      }

      currentEnd = lineEnd
      currentLines.push(normalizeBlockquoteLine(rawLine))
    } else {
      flushCurrentRange()
    }

    if (nextLineBreak < 0) {
      break
    }

    index = nextLineBreak + 1
  }

  flushCurrentRange()

  return ranges
}

function collectParagraphExcerptRanges(body: string) {
  const ranges: ParagraphExcerptRange[] = []
  const normalizedBody = String(body || '')
  let index = 0
  let currentStart = -1
  let currentEnd = -1
  let currentLines: string[] = []

  const flushCurrentRange = () => {
    if (currentStart < 0) {
      return
    }

    const excerpt = currentLines.join('\n').trim()
    if (excerpt) {
      ranges.push({
        start: currentStart,
        end: currentEnd,
        excerpt,
      })
    }

    currentStart = -1
    currentEnd = -1
    currentLines = []
  }

  while (index <= normalizedBody.length) {
    const nextLineBreak = normalizedBody.indexOf('\n', index)
    const lineEnd = nextLineBreak < 0 ? normalizedBody.length : nextLineBreak
    const rawLine = normalizedBody.slice(index, lineEnd).replace(/\r$/, '')
    const trimmedLine = rawLine.trim()

    if (!trimmedLine || isBlockquoteLine(rawLine)) {
      flushCurrentRange()
    } else {
      const normalizedLine = normalizeInlineLabel(rawLine)
      if (normalizedLine) {
        if (currentStart < 0) {
          currentStart = index
        }

        currentEnd = lineEnd
        currentLines.push(normalizedLine)
      }
    }

    if (nextLineBreak < 0) {
      break
    }

    index = nextLineBreak + 1
  }

  flushCurrentRange()

  return ranges
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

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderTopicBacklinkCard(backlink: TopicBacklinkItem) {
  const sourceTitle = backlink.sourceTitle.trim() || '未命名内容'
  const sourceDate = backlink.sourceDate.slice(0, 10) || '无日期'
  const sourceMeta = `${getTopicBacklinkTypeLabel(backlink.sourceContentType)} · ${sourceDate}`

  return [
    '<details class="topic-backlink-card">',
    '<summary class="topic-backlink-card__summary">',
    `<span class="topic-backlink-card__title">${escapeHtml(sourceTitle)}</span>`,
    `<span class="topic-backlink-card__meta">${escapeHtml(sourceMeta)}</span>`,
    '</summary>',
    '',
    renderBlockquote(backlink.excerpt),
    '',
    '</details>',
  ].join('\n')
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

  const sections = normalizedBacklinks.map((backlink) => renderTopicBacklinkCard(backlink))

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

    const title = post.title.trim()
    if (title && title !== nodeKey && !nodeMap.has(title)) {
      aliasEntries.push([title, post])
    }

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

    const normalizedBody = stripGeneratedTopicBacklinks(post.body)
    const blockquoteRanges = collectBlockquoteExcerptRanges(normalizedBody)
    const excerptRanges = post.contentType === 'diary'
      ? [...blockquoteRanges, ...collectParagraphExcerptRanges(normalizedBody)]
      : blockquoteRanges

    if (excerptRanges.length === 0) {
      return
    }

    parseWikiLinks(normalizedBody).forEach((link) => {
      const excerptRange = excerptRanges.find((range) => link.start >= range.start && link.start <= range.end)
      if (!excerptRange?.excerpt) {
        return
      }

      const resolvedTargetKey = resolveWikiLinkTargetKey(link.targetKey, topicNodeMap)
      const backlinks = backlinkMap.get(resolvedTargetKey) || []
      backlinks.push({
        targetKey: resolvedTargetKey,
        sourcePost: post,
        sourcePath: post.path,
        sourceTitle: post.title,
        sourceDate: post.date,
        sourceContentType: post.contentType || 'post',
        excerpt: excerptRange.excerpt,
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
