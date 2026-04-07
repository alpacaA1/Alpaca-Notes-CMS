import type { ParsedPost } from './parse-post'
import type { PostValidationErrors } from './post-types'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function formatPostTimestamp(date: Date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

export function formatPostDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function createNewPost(date = new Date()): ParsedPost {
  return {
    path: `source/_posts/${formatPostTimestamp(date)}.md`,
    sha: '',
    body: '',
    hasExplicitPublished: true,
    hasExplicitPermalink: false,
    frontmatter: {
      title: '',
      date: formatPostDate(date),
      desc: '',
      published: false,
      categories: [],
      tags: [],
    },
  }
}

export function validatePostForSave(post: ParsedPost, options?: { isNewPost?: boolean }): PostValidationErrors {
  const errors: PostValidationErrors = {}

  if (!post.frontmatter.title.trim()) {
    errors.title = 'Title is required.'
  }

  if (!post.frontmatter.date.trim()) {
    errors.date = 'Date is required.'
  }

  if (!post.frontmatter.desc.trim()) {
    errors.desc = 'Description is required.'
  }

  if (options?.isNewPost && !post.frontmatter.permalink?.trim()) {
    errors.permalink = 'Permalink is required before the first save.'
  }

  return errors
}
