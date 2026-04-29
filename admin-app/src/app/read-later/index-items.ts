import { fetchMarkdownFile, listReadLaterFiles, readCachedMarkdownFile } from '../github-client'
import { sortPostIndex } from '../posts/index-posts'
import type { SessionState } from '../session'
import type { ReadLaterIndexItem } from './item-types'

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
    tags: readList(frontmatter, 'tags'),
    permalink: permalink ? permalink : null,
    cover: cover ? cover : null,
    contentType: 'read-later',
    externalUrl: externalUrl ? externalUrl : null,
    sourceName: sourceName ? sourceName : null,
    readingStatus:
      readingStatus === 'reading' || readingStatus === 'done' ? readingStatus : 'unread',
  }
}

export async function buildReadLaterIndex(session: SessionState): Promise<ReadLaterIndexItem[]> {
  const files = await listReadLaterFiles(session)
  const items = await Promise.all(
    files.map(async (file) => parseReadLaterIndexItem(readCachedMarkdownFile(file.path, file.sha) ?? await fetchMarkdownFile(session, file.path))),
  )

  return sortPostIndex(items, 'date-desc') as ReadLaterIndexItem[]
}
