import { decodeReadLaterAnnotations } from './item-types'
import type { ParsedReadLaterItem, ReadLaterOutlineItem, ReadLaterSections } from './item-types'

const READ_LATER_SECTION_OUTLINE = [
  { key: 'articleExcerpt', title: '原文摘录', id: 'read-later-article-excerpt' },
  { key: 'summary', title: '我的总结', id: 'read-later-summary' },
  { key: 'commentary', title: '我的评论', id: 'read-later-commentary' },
] as const

function trimQuotes(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '').trim()
}

function readScalar(frontmatter: string, field: string): string | null {
  const match = frontmatter.match(new RegExp(`^${field}:[ \t]*([^\n\r]*)$`, 'm'))
  if (!match) {
    return null
  }

  const value = match[1].trim()
  return value.length === 0 ? '' : trimQuotes(value)
}

function readList(frontmatter: string, field: string): string[] {
  const match = frontmatter.match(new RegExp(`^${field}:[ \t]*((?:\\n\\s*-\\s.*)*)`, 'm'))
  if (!match) {
    return []
  }

  return match[1]
    .split('\n')
    .map((line) => line.match(/^\s*-\s*(.*)$/)?.[1] || '')
    .map(trimQuotes)
    .filter((value) => value.length > 0)
}

function readSection(body: string, heading: string, nextHeading: string | null) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedNextHeading = nextHeading?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = nextHeading
    ? new RegExp(`## ${escapedHeading}\\n([\\s\\S]*?)\\n## ${escapedNextHeading}(?:\\n|$)`)
    : new RegExp(`## ${escapedHeading}\\n([\\s\\S]*)$`)
  const match = body.match(pattern)
  return (match?.[1] || '').trim()
}

function stripInlineMarkdown(markdown: string) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`>#]/g, '')
    .trim()
}

function normalizeHeadingSlug(label: string) {
  const slug = stripInlineMarkdown(label)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return slug || 'section'
}

export function extractMarkdownHeadings(markdown: string, idPrefix: string): ReadLaterOutlineItem[] {
  const slugCounts = new Map<string, number>()

  return markdown
    .split('\n')
    .flatMap((line) => {
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
      if (!headingMatch) {
        return []
      }

      const label = stripInlineMarkdown(headingMatch[2])
      if (!label) {
        return []
      }

      const baseSlug = normalizeHeadingSlug(label)
      const nextCount = (slugCounts.get(baseSlug) ?? 0) + 1
      slugCounts.set(baseSlug, nextCount)

      return [{
        id: `${idPrefix}-${baseSlug}${nextCount > 1 ? `-${nextCount}` : ''}`,
        label,
        level: headingMatch[1].length,
        kind: 'heading' as const,
      }]
    })
}

function normalizeOutlineLevels(items: ReadLaterOutlineItem[]) {
  if (items.length === 0) {
    return items
  }

  const minLevel = Math.min(...items.map((item) => item.level))

  return items.map((item) => ({
    ...item,
    level: Math.max(1, item.level - minLevel + 1),
  }))
}

export function getReadLaterSectionAnchorId(sectionKey: keyof ReadLaterSections) {
  return READ_LATER_SECTION_OUTLINE.find((section) => section.key === sectionKey)?.id || 'read-later-content'
}

export function parseReadLaterSections(body: string): ReadLaterSections {
  return {
    articleExcerpt: readSection(body, '原文摘录', '我的总结'),
    summary: readSection(body, '我的总结', '我的评论'),
    commentary: readSection(body, '我的评论', null),
  }
}

export function getEditableReadLaterSections(body: string): ReadLaterSections {
  const sections = parseReadLaterSections(body)

  if (Object.values(sections).some((section) => section.trim().length > 0)) {
    return sections
  }

  return {
    articleExcerpt: body.trim(),
    summary: '',
    commentary: '',
  }
}

export function getReadLaterOutline(
  body: string,
  contentFormat: 'markdown' | 'plaintext' = 'markdown',
): ReadLaterOutlineItem[] {
  const sections = parseReadLaterSections(body)
  const hasStructuredSections = Object.values(sections).some((section) => section.trim().length > 0)

  if (!hasStructuredSections) {
    if (contentFormat === 'plaintext') {
      return [{ id: 'read-later-content', label: '阅读内容', level: 1, kind: 'section' }]
    }

    const headings = normalizeOutlineLevels(extractMarkdownHeadings(body, 'read-later-content'))
    return headings.length > 0
      ? headings
      : [{ id: 'read-later-content', label: '阅读内容', level: 1, kind: 'section' }]
  }

  return READ_LATER_SECTION_OUTLINE.flatMap((section) => {
    const sectionContent = sections[section.key]
    if (!sectionContent.trim()) {
      return []
    }

    if (contentFormat === 'plaintext') {
      return [{ id: section.id, label: section.title, level: 1, kind: 'section' as const }]
    }

    const nestedHeadings = normalizeOutlineLevels(extractMarkdownHeadings(sectionContent, section.id))

    return nestedHeadings.length > 0
      ? nestedHeadings
      : [{ id: section.id, label: section.title, level: 1, kind: 'section' as const }]
  })
}

export function parseReadLaterItem(input: { path: string; sha: string; content: string }): ParsedReadLaterItem {
  const match = input.content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const frontmatterBlock = match?.[1] || ''
  const body = (match?.[2] || input.content).replace(/^\n/, '')
  const permalink = readScalar(frontmatterBlock, 'permalink') || ''
  const pinnedRaw = readScalar(frontmatterBlock, 'pinned')
  const format = readScalar(frontmatterBlock, 'format')
  const externalUrl = readScalar(frontmatterBlock, 'external_url') || ''
  const sourceName = readScalar(frontmatterBlock, 'source_name') || ''
  const readingStatus = readScalar(frontmatterBlock, 'reading_status')
  const cover = readScalar(frontmatterBlock, 'cover')
  const encodedAnnotations = readList(frontmatterBlock, 'reader_annotations')
  const annotations = decodeReadLaterAnnotations(encodedAnnotations)

  return {
    path: input.path,
    sha: input.sha,
    body,
    annotations,
    hasExplicitPublished: false,
    hasExplicitPermalink: true,
    contentType: 'read-later',
    frontmatter: {
      title: readScalar(frontmatterBlock, 'title') || '',
      date: readScalar(frontmatterBlock, 'date') || '',
      desc: readScalar(frontmatterBlock, 'desc') || '',
      ...(format ? { format } : {}),
      categories: [],
      tags: readList(frontmatterBlock, 'tags'),
      pinned: pinnedRaw === 'true',
      permalink,
      external_url: externalUrl,
      source_name: sourceName,
      reading_status:
        readingStatus === 'reading' || readingStatus === 'done' ? readingStatus : 'unread',
      ...(encodedAnnotations.length > 0 ? { reader_annotations: encodedAnnotations } : {}),
      read_later: true,
      nav_exclude: true,
      layout: 'read-later-item',
      ...(cover ? { cover } : {}),
    },
  }
}
