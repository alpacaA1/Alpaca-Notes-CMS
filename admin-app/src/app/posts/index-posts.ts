import { DIARY_PATH, KNOWLEDGE_PATH } from '../config'
import { fetchPostFile, listDiaryFiles, listKnowledgeFiles, listPostFiles, readCachedMarkdownFile } from '../github-client'
import { stripGeneratedTopicBacklinks } from '../knowledge/wiki-links'
import type { SessionState } from '../session'
import type { ContentType, PostIndexItem, PostIndexView } from './post-types'

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

  const block = match[1]
  if (!block.trim()) {
    return []
  }

  return block
    .split('\n')
    .map((line) => line.match(/^\s*-\s*(.*)$/)?.[1] || '')
    .map(trimQuotes)
    .filter((value) => value.length > 0)
}

function stripFrontmatter(content: string) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '')
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

function stripPreviewMarkdown(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
    .trim()
}

function extractKnowledgePreview(body: string) {
  const quote = stripPreviewMarkdown(readSection(body, '原文摘录', '我的理解') || readSection(body, '原文摘录', null))

  if (quote) {
    return quote
  }

  return stripPreviewMarkdown(body)
}

function normalizeSearchText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function parsePostIndexItem(input: { path: string; sha: string; content: string }): PostIndexItem {
  const frontmatterMatch = input.content.match(/^---\n([\s\S]*?)\n---/)
  const frontmatter = frontmatterMatch?.[1] || ''
  const readLaterRaw = readScalar(frontmatter, 'read_later')
  const diaryRaw = readScalar(frontmatter, 'diary')
  const knowledgeRaw = readScalar(frontmatter, 'knowledge')
  const topicRaw = readScalar(frontmatter, 'topic')
  const contentType: ContentType =
    readLaterRaw === 'true'
      ? 'read-later'
      : diaryRaw === 'true' || input.path.startsWith(`${DIARY_PATH}/`)
        ? 'diary'
        : knowledgeRaw === 'true' || input.path.startsWith(`${KNOWLEDGE_PATH}/`)
          ? 'knowledge'
          : 'post'
  const title = readScalar(frontmatter, 'title') || input.path.split('/').pop() || input.path
  const date = readScalar(frontmatter, 'date') || ''
  const desc = readScalar(frontmatter, 'desc') || ''
  const publishedRaw = readScalar(frontmatter, 'published')
  const pinnedRaw = readScalar(frontmatter, 'pinned')
  const permalink = readScalar(frontmatter, 'permalink')
  const cover = readScalar(frontmatter, 'cover')
  const sourceType = readScalar(frontmatter, 'source_type')
  const sourcePath = readScalar(frontmatter, 'source_path')
  const sourceTitle = readScalar(frontmatter, 'source_title')
  const sourceUrl = readScalar(frontmatter, 'source_url')
  const knowledgeKind = readScalar(frontmatter, 'knowledge_kind')
  const topicType = readScalar(frontmatter, 'topic_type')
  const nodeKey = readScalar(frontmatter, 'node_key')
  const aliases = readList(frontmatter, 'aliases')
  const categories = readList(frontmatter, 'categories')
  const tags = readList(frontmatter, 'tags')
  const body = stripGeneratedTopicBacklinks(stripFrontmatter(input.content))
  const knowledgePreview = contentType === 'knowledge' ? extractKnowledgePreview(body) : ''
  const searchText = normalizeSearchText([
    title,
    date,
    desc,
    permalink || '',
    sourcePath || '',
    sourceTitle || '',
    sourceUrl || '',
    nodeKey || '',
    ...aliases,
    ...categories,
    ...tags,
    body,
  ].join('\n'))

  return {
    path: input.path,
    sha: input.sha,
    title,
    date,
    desc: knowledgePreview || desc,
    published: publishedRaw === null ? (contentType === 'post' ? true : false) : publishedRaw === 'true',
    pinned: pinnedRaw === 'true',
    hasExplicitPublished: publishedRaw !== null,
    categories,
    tags,
    permalink: permalink ? permalink : null,
    cover: cover ? cover : null,
    body,
    searchText,
    contentType,
    ...(sourceType === 'post' || sourceType === 'read-later' || sourceType === 'diary' ? { sourceType } : {}),
    ...(sourcePath ? { sourcePath } : {}),
    ...(sourceTitle ? { sourceTitle } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
    ...(topicRaw === 'true' ? { isTopic: true } : {}),
    ...(knowledgeKind === 'topic' ? { knowledgeKind: 'topic' as const } : {}),
    ...(topicType === 'book' || topicType === 'movie' || topicType === 'person' || topicType === 'theme'
      ? { topicType }
      : {}),
    ...(nodeKey ? { nodeKey } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
  }
}

async function buildIndexForFiles(
  session: SessionState,
  files: Promise<Awaited<ReturnType<typeof listPostFiles>>>,
): Promise<PostIndexItem[]> {
  const resolvedFiles = await files
  const posts = await Promise.all(
    resolvedFiles.map(async (file) => parsePostIndexItem(readCachedMarkdownFile(file.path, file.sha) ?? await fetchPostFile(session, file.path))),
  )

  return sortPostIndex(posts, 'date-desc')
}

export async function buildPostIndex(session: SessionState): Promise<PostIndexItem[]> {
  return buildIndexForFiles(session, listPostFiles(session))
}

export async function buildDiaryIndex(session: SessionState): Promise<PostIndexItem[]> {
  return buildIndexForFiles(session, listDiaryFiles(session))
}

export async function buildKnowledgeIndex(session: SessionState): Promise<PostIndexItem[]> {
  return buildIndexForFiles(session, listKnowledgeFiles(session))
}

export function filterPostIndex(posts: PostIndexItem[], view: PostIndexView): PostIndexItem[] {
  const normalizedQuery = view.query.trim().toLowerCase()

  return posts.filter((post) => {
    if (normalizedQuery) {
      const matchesQuery =
        post.title.toLowerCase().includes(normalizedQuery) ||
        (post.desc || '').toLowerCase().includes(normalizedQuery) ||
        (post.permalink || '').toLowerCase().includes(normalizedQuery) ||
        (post.searchText || '').includes(normalizedQuery) ||
        (post.sourceName || '').toLowerCase().includes(normalizedQuery) ||
        (post.externalUrl || '').toLowerCase().includes(normalizedQuery) ||
        (post.sourceTitle || '').toLowerCase().includes(normalizedQuery) ||
        (post.sourcePath || '').toLowerCase().includes(normalizedQuery) ||
        (post.sourceUrl || '').toLowerCase().includes(normalizedQuery)

      if (!matchesQuery) {
        return false
      }
    }

    if (view.publishState === 'draft' && post.published) {
      return false
    }

    if (view.publishState === 'published' && !post.published) {
      return false
    }

    if (view.category && !post.categories.includes(view.category)) {
      return false
    }

    if (view.tag && !post.tags.includes(view.tag)) {
      return false
    }

    return true
  })
}

export function sortPostIndex(posts: PostIndexItem[], sort: PostIndexView['sort']): PostIndexItem[] {
  return [...posts].sort((left, right) => {
    if (sort === 'title-asc') {
      return left.title.localeCompare(right.title, 'zh-CN')
    }

    if (sort === 'title-desc') {
      return right.title.localeCompare(left.title, 'zh-CN')
    }

    if (Boolean(left.pinned) !== Boolean(right.pinned)) {
      return Number(Boolean(right.pinned)) - Number(Boolean(left.pinned))
    }

    if (sort === 'date-asc') {
      return left.date.localeCompare(right.date)
    }

    return right.date.localeCompare(left.date)
  })
}

export function collectPostIndexFacets(posts: PostIndexItem[]) {
  const categories = Array.from(new Set(posts.flatMap((post) => post.categories))).sort((left, right) =>
    left.localeCompare(right, 'zh-CN'),
  )
  const tags = Array.from(new Set(posts.flatMap((post) => post.tags))).sort((left, right) =>
    left.localeCompare(right, 'zh-CN'),
  )

  return { categories, tags }
}
