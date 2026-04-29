import { encodeReadLaterAnnotations } from './item-types'
import type { ParsedReadLaterItem } from './item-types'

function renderList(name: string, values: string[]) {
  if (values.length === 0) {
    return `${name}:`
  }

  return `${name}:\n${values.map((value) => `  - ${value}`).join('\n')}`
}

export function serializeReadLaterItem(item: ParsedReadLaterItem): string {
  const encodedAnnotations = item.annotations.length > 0
    ? encodeReadLaterAnnotations(item.annotations)
    : (item.frontmatter.reader_annotations || [])

  const lines = [
    '---',
    `title: ${item.frontmatter.title}`,
    `permalink: ${item.frontmatter.permalink}`,
    `layout: ${item.frontmatter.layout}`,
    ...(item.frontmatter.cover ? [`cover: ${item.frontmatter.cover}`] : []),
    `date: ${item.frontmatter.date}`,
    `read_later: true`,
    `nav_exclude: true`,
    ...(item.frontmatter.pinned ? ['pinned: true'] : []),
    `external_url: ${item.frontmatter.external_url}`,
    `source_name: ${item.frontmatter.source_name}`,
    `reading_status: ${item.frontmatter.reading_status}`,
    ...(encodedAnnotations.length > 0 ? [renderList('reader_annotations', encodedAnnotations)] : []),
    renderList('tags', item.frontmatter.tags),
    `desc: ${item.frontmatter.desc}`,
    '---',
  ]

  return `${lines.join('\n')}\n\n${item.body}`
}
