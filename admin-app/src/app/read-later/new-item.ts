import { READ_LATER_PATH } from '../config'
import { formatPostDate, formatPostTimestamp } from '../posts/new-post'
import type { ParsedReadLaterItem, ReadLaterSections, ReadLaterValidationErrors } from './item-types'

export function createReadLaterBody(sections?: Partial<ReadLaterSections>) {
  return [
    '## 原文摘录',
    sections?.articleExcerpt || '',
    '',
    '## 我的总结',
    sections?.summary || '',
    '',
    '## 我的评论',
    sections?.commentary || '',
  ].join('\n')
}

export function createNewReadLaterItem(date = new Date()): ParsedReadLaterItem {
  const timestamp = formatPostTimestamp(date)
  return {
    path: `${READ_LATER_PATH}/${timestamp}.md`,
    sha: '',
    body: createReadLaterBody(),
    annotations: [],
    hasExplicitPublished: false,
    hasExplicitPermalink: true,
    contentType: 'read-later',
    frontmatter: {
      title: '',
      date: formatPostDate(date),
      desc: '',
      categories: [],
      tags: [],
      permalink: `read-later/${timestamp}/`,
      external_url: '',
      source_name: '',
      reading_status: 'unread',
      read_later: true,
      nav_exclude: true,
      layout: 'read-later-item',
    },
  }
}

export function validateReadLaterItemForSave(item: ParsedReadLaterItem): ReadLaterValidationErrors {
  const errors: ReadLaterValidationErrors = {}
  const externalUrl = item.frontmatter.external_url.trim()

  if (!item.frontmatter.title.trim()) {
    errors.title = '请填写标题。'
  }

  if (!item.frontmatter.date.trim()) {
    errors.date = '请填写日期。'
  }

  if (!item.frontmatter.desc.trim()) {
    errors.desc = '请填写摘要。'
  }

  if (!externalUrl) {
    errors.external_url = '请填写原文链接。'
  } else if (!/^https?:\/\//i.test(externalUrl)) {
    errors.external_url = '原文链接需以 http:// 或 https:// 开头。'
  }

  return errors
}
