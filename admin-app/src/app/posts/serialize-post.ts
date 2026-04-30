import type { ParsedPost } from './parse-post'

function renderList(name: string, values: string[]) {
  if (values.length === 0) {
    return `${name}:`
  }

  return `${name}:\n${values.map((value) => `  - ${value}`).join('\n')}`
}

export function serializePost(post: ParsedPost): string {
  const lines = [
    '---',
    `title: ${post.frontmatter.title}`,
    ...(post.frontmatter.format ? [`format: ${post.frontmatter.format}`] : []),
    ...(post.frontmatter.permalink ? [`permalink: ${post.frontmatter.permalink}`] : []),
    ...(post.frontmatter.layout ? [`layout: ${post.frontmatter.layout}`] : []),
    ...(post.frontmatter.cover ? [`cover: ${post.frontmatter.cover}`] : []),
    `date: ${post.frontmatter.date}`,
    ...(post.frontmatter.read_later
      ? [
          `read_later: true`,
          ...(post.frontmatter.nav_exclude ? ['nav_exclude: true'] : []),
          ...(post.frontmatter.external_url ? [`external_url: ${post.frontmatter.external_url}`] : []),
          ...(post.frontmatter.source_name ? [`source_name: ${post.frontmatter.source_name}`] : []),
          ...(post.frontmatter.reading_status ? [`reading_status: ${post.frontmatter.reading_status}`] : []),
        ]
      : [`published: ${post.hasExplicitPublished ? String(post.frontmatter.published) : 'true'}`]),
    ...(post.frontmatter.read_later ? [] : post.frontmatter.pinned ? ['pinned: true'] : []),
    ...(post.frontmatter.read_later ? [] : [renderList('categories', post.frontmatter.categories)]),
    renderList('tags', post.frontmatter.tags),
    `desc: ${post.frontmatter.desc}`,
    '---',
  ]

  return `${lines.join('\n')}\n\n${post.body}`
}
