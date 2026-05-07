import type { ParsedPost } from './parse-post'

function renderList(name: string, values: string[]) {
  if (values.length === 0) {
    return `${name}:`
  }

  return `${name}:\n${values.map((value) => `  - ${value}`).join('\n')}`
}

export function serializePost(post: ParsedPost): string {
  const isDiary = post.frontmatter.diary === true || post.contentType === 'diary'
  const isKnowledge = post.frontmatter.knowledge === true || post.contentType === 'knowledge'
  const aliases = post.frontmatter.aliases || []
  const lines = [
    '---',
    `title: ${post.frontmatter.title}`,
    ...(post.frontmatter.format ? [`format: ${post.frontmatter.format}`] : []),
    ...(!isDiary && !isKnowledge && post.frontmatter.permalink ? [`permalink: ${post.frontmatter.permalink}`] : []),
    ...(post.frontmatter.layout ? [`layout: ${post.frontmatter.layout}`] : []),
    ...(!isDiary && !isKnowledge && post.frontmatter.cover ? [`cover: ${post.frontmatter.cover}`] : []),
    `date: ${post.frontmatter.date}`,
    ...(post.frontmatter.read_later
      ? [
          `read_later: true`,
          ...(post.frontmatter.nav_exclude ? ['nav_exclude: true'] : []),
          ...(post.frontmatter.external_url ? [`external_url: ${post.frontmatter.external_url}`] : []),
          ...(post.frontmatter.source_name ? [`source_name: ${post.frontmatter.source_name}`] : []),
          ...(post.frontmatter.reading_status ? [`reading_status: ${post.frontmatter.reading_status}`] : []),
        ]
      : [
          ...(isDiary ? ['diary: true'] : []),
          ...(isKnowledge ? ['knowledge: true'] : []),
          ...((isKnowledge || post.frontmatter.nav_exclude) && post.frontmatter.nav_exclude ? ['nav_exclude: true'] : []),
          ...(isKnowledge && post.frontmatter.source_type ? [`source_type: ${post.frontmatter.source_type}`] : []),
          ...(isKnowledge && post.frontmatter.source_path ? [`source_path: ${post.frontmatter.source_path}`] : []),
          ...(isKnowledge && post.frontmatter.source_title ? [`source_title: ${post.frontmatter.source_title}`] : []),
          ...(isKnowledge && post.frontmatter.source_url ? [`source_url: ${post.frontmatter.source_url}`] : []),
          ...(isKnowledge && post.frontmatter.knowledge_kind ? [`knowledge_kind: ${post.frontmatter.knowledge_kind}`] : []),
          ...(isKnowledge && post.frontmatter.topic_type ? [`topic_type: ${post.frontmatter.topic_type}`] : []),
          ...(isKnowledge && post.frontmatter.node_key ? [`node_key: ${post.frontmatter.node_key}`] : []),
          ...(isKnowledge && aliases.length > 0 ? [renderList('aliases', aliases)] : []),
          `published: ${
            isDiary || isKnowledge
              ? 'false'
              : post.hasExplicitPublished
                ? String(post.frontmatter.published)
                : 'true'
          }`,
        ]),
    ...(post.frontmatter.read_later ? [] : post.frontmatter.pinned ? ['pinned: true'] : []),
    ...(post.frontmatter.read_later || isDiary ? [] : [renderList('categories', post.frontmatter.categories)]),
    renderList('tags', post.frontmatter.tags),
    `desc: ${post.frontmatter.desc}`,
    '---',
  ]

  return `${lines.join('\n')}\n\n${post.body}`
}
