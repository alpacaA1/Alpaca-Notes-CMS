import { fetchPostFile, listPostFiles, readCachedMarkdownFile } from '../github-client'
import type { SessionState } from '../session'
import type { PostIndexItem, PostIndexView } from './post-types'

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

export function parsePostIndexItem(input: { path: string; sha: string; content: string }): PostIndexItem {
  const frontmatterMatch = input.content.match(/^---\n([\s\S]*?)\n---/)
  const frontmatter = frontmatterMatch?.[1] || ''
  const title = readScalar(frontmatter, 'title') || input.path.split('/').pop() || input.path
  const date = readScalar(frontmatter, 'date') || ''
  const desc = readScalar(frontmatter, 'desc') || ''
  const publishedRaw = readScalar(frontmatter, 'published')
  const pinnedRaw = readScalar(frontmatter, 'pinned')
  const permalink = readScalar(frontmatter, 'permalink')
  const cover = readScalar(frontmatter, 'cover')

  return {
    path: input.path,
    sha: input.sha,
    title,
    date,
    desc,
    published: publishedRaw === null ? true : publishedRaw === 'true',
    pinned: pinnedRaw === 'true',
    hasExplicitPublished: publishedRaw !== null,
    categories: readList(frontmatter, 'categories'),
    tags: readList(frontmatter, 'tags'),
    permalink: permalink ? permalink : null,
    cover: cover ? cover : null,
  }
}

export async function buildPostIndex(session: SessionState): Promise<PostIndexItem[]> {
  const files = await listPostFiles(session)
  const posts = await Promise.all(
    files.map(async (file) => parsePostIndexItem(readCachedMarkdownFile(file.path, file.sha) ?? await fetchPostFile(session, file.path))),
  )

  return sortPostIndex(posts, 'date-desc')
}

export function filterPostIndex(posts: PostIndexItem[], view: PostIndexView): PostIndexItem[] {
  const normalizedQuery = view.query.trim().toLowerCase()

  return posts.filter((post) => {
    if (normalizedQuery) {
      const matchesQuery =
        post.title.toLowerCase().includes(normalizedQuery) ||
        (post.permalink || '').toLowerCase().includes(normalizedQuery) ||
        (post.sourceName || '').toLowerCase().includes(normalizedQuery) ||
        (post.externalUrl || '').toLowerCase().includes(normalizedQuery)

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
