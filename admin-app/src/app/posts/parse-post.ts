export type PostFrontmatter = {
  title: string
  date: string
  desc: string
  published?: boolean
  categories: string[]
  tags: string[]
  permalink?: string
  cover?: string
}

export type ParsedPost = {
  path: string
  sha: string
  frontmatter: PostFrontmatter
  body: string
  hasExplicitPublished: boolean
  hasExplicitPermalink: boolean
}

function trimQuotes(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '').trim()
}

function readScalar(frontmatter: string, field: string): string | null {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'))
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
  const permalinkRaw = readScalar(frontmatterBlock, 'permalink')
  const coverRaw = readScalar(frontmatterBlock, 'cover')

  return {
    path: input.path,
    sha: input.sha,
    body,
    hasExplicitPublished: publishedRaw !== null,
    hasExplicitPermalink: permalinkRaw !== null && permalinkRaw !== '',
    frontmatter: {
      title: readScalar(frontmatterBlock, 'title') || '',
      date: readScalar(frontmatterBlock, 'date') || '',
      desc: readScalar(frontmatterBlock, 'desc') || '',
      published: publishedRaw === null ? true : publishedRaw === 'true',
      categories: readList(frontmatterBlock, 'categories'),
      tags: readList(frontmatterBlock, 'tags'),
      ...(permalinkRaw && permalinkRaw.length > 0 ? { permalink: permalinkRaw } : {}),
      ...(coverRaw && coverRaw.length > 0 ? { cover: coverRaw } : {}),
    },
  }
}
