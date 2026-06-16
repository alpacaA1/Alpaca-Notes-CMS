import { encodeReadLaterAnnotations } from './item-types'
import type { ParsedReadLaterItem } from './item-types'

function renderList(name: string, values: string[], renderValue: (value: string) => string = (value) => value) {
  if (values.length === 0) {
    return `${name}:`
  }

  return `${name}:\n${values.map((value) => `  - ${renderValue(value)}`).join('\n')}`
}

function renderScalar(name: string, value: string) {
  const normalizedValue = String(value ?? '').replace(/\r?\n/g, ' ').trim()
  if (!normalizedValue) {
    return `${name}:`
  }

  const needsQuoting =
    /(^[-?:]\s)|(:\s)|(\s#)|[{}[\],&*|>!%@`]|^['"]|['"]$/.test(normalizedValue) ||
    /^(?:true|false|null|~)$/i.test(normalizedValue)

  return `${name}: ${needsQuoting ? JSON.stringify(normalizedValue) : normalizedValue}`
}

export function serializeReadLaterItem(item: ParsedReadLaterItem): string {
  const encodedAnnotations = item.annotations.length > 0
    ? encodeReadLaterAnnotations(item.annotations)
    : (item.frontmatter.reader_annotations || [])

  const lines = [
    '---',
    renderScalar('title', item.frontmatter.title),
    ...(item.frontmatter.format ? [renderScalar('format', item.frontmatter.format)] : []),
    `permalink: ${item.frontmatter.permalink}`,
    `layout: ${item.frontmatter.layout}`,
    ...(item.frontmatter.cover ? [renderScalar('cover', item.frontmatter.cover)] : []),
    `date: ${item.frontmatter.date}`,
    `read_later: true`,
    `nav_exclude: true`,
    ...(item.frontmatter.pinned ? ['pinned: true'] : []),
    renderScalar('external_url', item.frontmatter.external_url),
    renderScalar('source_name', item.frontmatter.source_name),
    `reading_status: ${item.frontmatter.reading_status}`,
    ...(encodedAnnotations.length > 0 ? [renderList('reader_annotations', encodedAnnotations, JSON.stringify)] : []),
    renderList('tags', item.frontmatter.tags),
    renderScalar('desc', item.frontmatter.desc),
    '---',
  ]

  return `${lines.join('\n')}\n\n${item.body}`
}
