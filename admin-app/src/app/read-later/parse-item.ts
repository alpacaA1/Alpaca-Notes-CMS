import type { ParsedReadLaterItem, ReadLaterSections } from './item-types'

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

export function parseReadLaterSections(body: string): ReadLaterSections {
  return {
    articleExcerpt: readSection(body, '原文摘录', '我的总结'),
    summary: readSection(body, '我的总结', '我的评论'),
    commentary: readSection(body, '我的评论', null),
  }
}

export function parseReadLaterItem(input: { path: string; sha: string; content: string }): ParsedReadLaterItem {
  const match = input.content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const frontmatterBlock = match?.[1] || ''
  const body = (match?.[2] || input.content).replace(/^\n/, '')
  const permalink = readScalar(frontmatterBlock, 'permalink') || ''
  const externalUrl = readScalar(frontmatterBlock, 'external_url') || ''
  const sourceName = readScalar(frontmatterBlock, 'source_name') || ''
  const readingStatus = readScalar(frontmatterBlock, 'reading_status')
  const cover = readScalar(frontmatterBlock, 'cover')

  return {
    path: input.path,
    sha: input.sha,
    body,
    hasExplicitPublished: false,
    hasExplicitPermalink: true,
    contentType: 'read-later',
    frontmatter: {
      title: readScalar(frontmatterBlock, 'title') || '',
      date: readScalar(frontmatterBlock, 'date') || '',
      desc: readScalar(frontmatterBlock, 'desc') || '',
      categories: [],
      tags: readList(frontmatterBlock, 'tags'),
      permalink,
      external_url: externalUrl,
      source_name: sourceName,
      reading_status:
        readingStatus === 'reading' || readingStatus === 'done' ? readingStatus : 'unread',
      read_later: true,
      nav_exclude: true,
      layout: 'read-later-item',
      ...(cover ? { cover } : {}),
    },
  }
}
