import { DIARY_PATH } from '../config'
import type { ContentType } from './post-types'

export type ReadingStatus = 'unread' | 'reading' | 'done'

export type ReadLaterSectionKey = 'articleExcerpt' | 'summary' | 'commentary'

export type ReaderAnnotation = {
  id: string
  sectionKey: ReadLaterSectionKey
  quote: string
  prefix: string
  suffix: string
  note: string
  createdAt: string
  updatedAt: string
}

export type PostFrontmatter = {
  title: string
  date: string
  desc: string
  format?: string
  published?: boolean
  pinned?: boolean
  categories: string[]
  tags: string[]
  permalink?: string
  cover?: string
  external_url?: string
  source_name?: string
  reading_status?: ReadingStatus
  reader_annotations?: string[]
  read_later?: boolean
  diary?: boolean
  nav_exclude?: boolean
  layout?: string
}

export type ParsedPost = {
  path: string
  sha: string
  frontmatter: PostFrontmatter
  body: string
  hasExplicitPublished: boolean
  hasExplicitPermalink: boolean
  contentType?: ContentType
  annotations?: ReaderAnnotation[]
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

export function parsePost(input: { path: string; sha: string; content: string }): ParsedPost {
  const match = input.content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const frontmatterBlock = match?.[1] || ''
  const body = (match?.[2] || input.content).replace(/^\n/, '')
  const publishedRaw = readScalar(frontmatterBlock, 'published')
  const pinnedRaw = readScalar(frontmatterBlock, 'pinned')
  const formatRaw = readScalar(frontmatterBlock, 'format')
  const permalinkRaw = readScalar(frontmatterBlock, 'permalink')
  const coverRaw = readScalar(frontmatterBlock, 'cover')
  const externalUrlRaw = readScalar(frontmatterBlock, 'external_url')
  const sourceNameRaw = readScalar(frontmatterBlock, 'source_name')
  const readingStatusRaw = readScalar(frontmatterBlock, 'reading_status')
  const readerAnnotationsRaw = readList(frontmatterBlock, 'reader_annotations')
  const readLaterRaw = readScalar(frontmatterBlock, 'read_later')
  const diaryRaw = readScalar(frontmatterBlock, 'diary')
  const navExcludeRaw = readScalar(frontmatterBlock, 'nav_exclude')
  const layoutRaw = readScalar(frontmatterBlock, 'layout')
  const contentType: ContentType =
    readLaterRaw === 'true'
      ? 'read-later'
      : diaryRaw === 'true' || input.path.startsWith(`${DIARY_PATH}/`)
        ? 'diary'
        : 'post'

  return {
    path: input.path,
    sha: input.sha,
    body,
    hasExplicitPublished: publishedRaw !== null,
    hasExplicitPermalink: permalinkRaw !== null && permalinkRaw !== '',
    contentType,
    frontmatter: {
      title: readScalar(frontmatterBlock, 'title') || '',
      date: readScalar(frontmatterBlock, 'date') || '',
      desc: readScalar(frontmatterBlock, 'desc') || '',
      ...(formatRaw && formatRaw.length > 0 ? { format: formatRaw } : {}),
      published: publishedRaw === null ? contentType !== 'diary' : publishedRaw === 'true',
      pinned: pinnedRaw === 'true',
      categories: readList(frontmatterBlock, 'categories'),
      tags: readList(frontmatterBlock, 'tags'),
      ...(permalinkRaw && permalinkRaw.length > 0 ? { permalink: permalinkRaw } : {}),
      ...(coverRaw && coverRaw.length > 0 ? { cover: coverRaw } : {}),
      ...(externalUrlRaw && externalUrlRaw.length > 0 ? { external_url: externalUrlRaw } : {}),
      ...(sourceNameRaw && sourceNameRaw.length > 0 ? { source_name: sourceNameRaw } : {}),
      ...(readingStatusRaw === 'unread' || readingStatusRaw === 'reading' || readingStatusRaw === 'done'
        ? { reading_status: readingStatusRaw }
        : {}),
      ...(readerAnnotationsRaw.length > 0 ? { reader_annotations: readerAnnotationsRaw } : {}),
      ...(readLaterRaw === 'true' ? { read_later: true } : {}),
      ...(contentType === 'diary' ? { diary: true } : {}),
      ...(navExcludeRaw === 'true' ? { nav_exclude: true } : {}),
      ...(layoutRaw && layoutRaw.length > 0 ? { layout: layoutRaw } : {}),
    },
  }
}
