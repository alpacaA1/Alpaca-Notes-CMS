import { KNOWLEDGE_PATH } from '../config'
import { formatPostDate, formatPostTimestamp } from '../posts/new-post'
import type { ParsedPost } from '../posts/parse-post'

const KNOWLEDGE_TITLE_MAX_LENGTH = 28
const KNOWLEDGE_DESC_MAX_LENGTH = 80

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(1, maxLength - 1)).trim()}…`
}

function formatQuoteBlock(quote: string) {
  const lines = quote
    .split(/\r?\n/)
    .map((line) => line.trim())

  if (lines.every((line) => line.length === 0)) {
    return ''
  }

  return lines
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n')
}

export function buildKnowledgeTitleFromQuote(quote: string) {
  const normalized = normalizeText(quote)
  if (!normalized) {
    return ''
  }

  return truncateText(normalized, KNOWLEDGE_TITLE_MAX_LENGTH)
}

export function buildKnowledgeDescFromQuote(quote: string) {
  const normalized = normalizeText(quote)
  if (!normalized) {
    return ''
  }

  return truncateText(normalized, KNOWLEDGE_DESC_MAX_LENGTH)
}

export function createKnowledgeBody(options?: { quote?: string; note?: string }) {
  return [
    '## 原文摘录',
    options?.quote ? formatQuoteBlock(options.quote) : '',
    '',
    '## 我的理解',
    options?.note || '',
  ].join('\n')
}

export function createNewKnowledgeItem(date = new Date()): ParsedPost {
  return {
    path: `${KNOWLEDGE_PATH}/${formatPostTimestamp(date)}.md`,
    sha: '',
    body: createKnowledgeBody(),
    hasExplicitPublished: true,
    hasExplicitPermalink: false,
    contentType: 'knowledge',
    frontmatter: {
      title: '',
      date: formatPostDate(date),
      desc: '',
      published: false,
      pinned: false,
      categories: [],
      tags: [],
      knowledge: true,
      nav_exclude: true,
    },
  }
}

export function createKnowledgeFromSelection(
  source: Pick<ParsedPost, 'path' | 'contentType' | 'frontmatter'>,
  quote: string,
  date = new Date(),
): ParsedPost {
  const knowledge = createNewKnowledgeItem(date)
  const normalizedQuote = quote.trim()
  const sourceType = source.contentType === 'read-later' ? 'read-later' : 'post'
  const sourceUrl = source.contentType === 'read-later' ? source.frontmatter.external_url?.trim() || undefined : undefined

  return {
    ...knowledge,
    body: normalizedQuote,
    frontmatter: {
      ...knowledge.frontmatter,
      title: buildKnowledgeTitleFromQuote(normalizedQuote),
      desc: buildKnowledgeDescFromQuote(normalizedQuote),
      tags: [...source.frontmatter.tags],
      source_type: sourceType,
      source_path: source.path,
      source_title: source.frontmatter.title.trim() || undefined,
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
    },
  }
}
