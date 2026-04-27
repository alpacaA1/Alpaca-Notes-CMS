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

export function toPostDateTimeInputValue(value: string) {
  const normalized = value.trim().replace(/\.\d{1,3}$/, '')
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::(\d{2}))?$/)

  if (!match) {
    return ''
  }

  const [, date, time, seconds] = match
  return seconds ? `${date}T${time}:${seconds}` : `${date}T${time}`
}

export function fromPostDateTimeInputValue(value: string) {
  const normalized = value.trim().replace(/\.\d{1,3}$/, '')
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/)

  if (!match) {
    return ''
  }

  const [, date, time, seconds = '00'] = match
  return `${date} ${time}:${seconds}`
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
  const permalink = post.frontmatter.permalink?.trim() || ''
  const isReadLater = post.frontmatter.read_later === true || post.contentType === 'read-later'

  if (!post.frontmatter.title.trim()) {
    errors.title = '请填写标题。'
  }

  if (!post.frontmatter.date.trim()) {
    errors.date = '请填写日期。'
  }

  if (!post.frontmatter.desc.trim()) {
    errors.desc = '请填写摘要。'
  }

  if (isReadLater) {
    const externalUrl = post.frontmatter.external_url?.trim() || ''
    if (!externalUrl) {
      errors.external_url = '请填写原文链接。'
    } else if (!/^https?:\/\//i.test(externalUrl)) {
      errors.external_url = '原文链接需以 http:// 或 https:// 开头。'
    }
    return errors
  }

  if (options?.isNewPost && !permalink) {
    errors.permalink = '首次保存前请填写永久链接。'
  }

  if (/^[a-z][a-z\d+.-]*:\/\//i.test(permalink)) {
    errors.permalink = '永久链接请填写站内相对路径，例如 zhenai/。'
  }

  return errors
}
