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
    ...(post.frontmatter.permalink ? [`permalink: ${post.frontmatter.permalink}`] : []),
    `date: ${post.frontmatter.date}`,
    `published: ${post.hasExplicitPublished ? String(post.frontmatter.published) : 'true'}`,
    renderList('categories', post.frontmatter.categories),
    renderList('tags', post.frontmatter.tags),
    `desc: ${post.frontmatter.desc}`,
    '---',
  ]

  return `${lines.join('\n')}\n\n${post.body}`
}
