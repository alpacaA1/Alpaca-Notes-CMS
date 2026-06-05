import { fetchMarkdownFile, listReadLaterFiles, readCachedMarkdownFile } from '../github-client'
import { sortPostIndex } from '../posts/index-posts'
import type { SessionState } from '../session'
import type { ReadLaterIndexItem } from './item-types'

type BuildReadLaterIndexOptions = {
  onFilesListed?: (items: ReadLaterIndexItem[]) => void
}

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

function stripFrontmatter(content: string) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '')
}

function normalizeSearchText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function stripContentFileExtension(fileName: string) {
  return fileName.replace(/\.(md|txt|plaintxt)$/i, '')
}

function formatTimestampDate(value: string) {
  const compactMatch = value.match(/(20\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/)
  if (compactMatch) {
    return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]} ${compactMatch[4]}:${compactMatch[5]}:${compactMatch[6]}`
  }

  const dateMatch = value.match(/(20\d{2})[-_](\d{2})[-_](\d{2})/)
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]} 00:00:00`
  }

  return ''
}

function parseLightweightReadLaterIndexItem(file: { path: string; sha: string; name: string }): ReadLaterIndexItem {
  const title = stripContentFileExtension(file.name) || file.path
  const date = formatTimestampDate(file.name)

  return {
    path: file.path,
    sha: file.sha,
    title,
    date,
    desc: '',
    published: false,
    pinned: false,
    hasExplicitPublished: false,
    categories: [],
    tags: [],
    permalink: null,
    cover: null,
    searchText: normalizeSearchText([title, date, file.path].join('\n')),
    bodySearchText: '',
    contentType: 'read-later',
    externalUrl: null,
    sourceName: null,
    readingStatus: 'unread',
  }
}

export function parseReadLaterIndexItem(input: { path: string; sha: string; content: string }): ReadLaterIndexItem {
  const frontmatterMatch = input.content.match(/^---\n([\s\S]*?)\n---/)
  const frontmatter = frontmatterMatch?.[1] || ''
  const title = readScalar(frontmatter, 'title') || input.path.split('/').pop() || input.path
  const date = readScalar(frontmatter, 'date') || ''
  const desc = readScalar(frontmatter, 'desc') || ''
  const pinnedRaw = readScalar(frontmatter, 'pinned')
  const permalink = readScalar(frontmatter, 'permalink')
  const cover = readScalar(frontmatter, 'cover')
  const externalUrl = readScalar(frontmatter, 'external_url')
  const sourceName = readScalar(frontmatter, 'source_name')
  const readingStatus = readScalar(frontmatter, 'reading_status')
  const tags = readList(frontmatter, 'tags')
  const body = stripFrontmatter(input.content)
  const searchText = normalizeSearchText([
    title,
    date,
    desc,
    permalink || '',
    externalUrl || '',
    sourceName || '',
    ...tags,
    body,
  ].join('\n'))

  return {
    path: input.path,
    sha: input.sha,
    title,
    date,
    desc,
    published: false,
    pinned: pinnedRaw === 'true',
    hasExplicitPublished: false,
    categories: [],
    tags,
    permalink: permalink ? permalink : null,
    cover: cover ? cover : null,
    body,
    searchText,
    contentType: 'read-later',
    externalUrl: externalUrl ? externalUrl : null,
    sourceName: sourceName ? sourceName : null,
    readingStatus:
      readingStatus === 'reading' || readingStatus === 'done' ? readingStatus : 'unread',
  }
}

export async function buildReadLaterIndex(session: SessionState, options: BuildReadLaterIndexOptions = {}): Promise<ReadLaterIndexItem[]> {
  const files = await listReadLaterFiles(session)
  options.onFilesListed?.(sortPostIndex(
    files.map(parseLightweightReadLaterIndexItem),
    'date-desc',
  ) as ReadLaterIndexItem[])

  const items = await Promise.all(
    files.map(async (file) => parseReadLaterIndexItem(readCachedMarkdownFile(file.path, file.sha) ?? await fetchMarkdownFile(session, file.path))),
  )

  return sortPostIndex(items, 'date-desc') as ReadLaterIndexItem[]
}
