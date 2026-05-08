import { describe, expect, it } from 'vitest'
import { appendTopicBacklinksToMarkdown, buildTopicBacklinkMap, buildTopicNodeMap, parseWikiLinks, stripGeneratedTopicBacklinks } from './wiki-links'
import type { PostIndexItem } from '../posts/post-types'

const topicPost: PostIndexItem = {
  path: 'source/_knowledge/topic-yingxiangli.md',
  sha: 'sha-topic',
  title: '影响力',
  date: '2026-05-05 09:00:00',
  desc: '一本关于说服机制的书',
  published: false,
  hasExplicitPublished: true,
  categories: [],
  tags: ['读书'],
  permalink: null,
  cover: null,
  contentType: 'knowledge',
  body: '这是一个主题节点。',
  knowledgeKind: 'topic',
  topicType: 'book',
  nodeKey: 'book/影响力',
  aliases: ['《影响力》'],
}

describe('wiki link helpers', () => {
  it('parses wiki links with optional aliases', () => {
    expect(parseWikiLinks('提到 [[book/影响力|《影响力》]] 和 [[theme/长期主义]]。')).toEqual([
      {
        raw: '[[book/影响力|《影响力》]]',
        targetKey: 'book/影响力',
        label: '《影响力》',
        start: 3,
        end: 21,
      },
      {
        raw: '[[theme/长期主义]]',
        targetKey: 'theme/长期主义',
        label: null,
        start: 24,
        end: 38,
      },
    ])
  })

  it('indexes topic nodes by node key and aliases', () => {
    const nodeMap = buildTopicNodeMap([
      topicPost,
      {
        ...topicPost,
        path: 'source/_knowledge/note.md',
        sha: 'sha-note',
        title: '普通知识点',
        knowledgeKind: 'note',
        nodeKey: 'theme/普通知识点',
      },
    ])

    expect(Array.from(nodeMap.keys())).toEqual(['book/影响力', '影响力', '《影响力》'])
    expect(nodeMap.get('book/影响力')?.title).toBe('影响力')
    expect(nodeMap.get('影响力')?.title).toBe('影响力')
    expect(nodeMap.get('《影响力》')?.title).toBe('影响力')
  })

  it('builds backlinks from mixed content types and extracts readable snippets', () => {
    const backlinkMap = buildTopicBacklinkMap([
      topicPost,
      {
        path: 'source/diary/20260506090909.md',
        sha: 'sha-diary',
        title: '2026-05-06-星期三',
        date: '2026-05-06 09:09:09',
        desc: '',
        published: false,
        hasExplicitPublished: true,
        categories: [],
        tags: ['复盘'],
        permalink: null,
        cover: null,
        contentType: 'diary',
        body: '> 今天又想到 [[book/影响力|《影响力》]] 里讲的互惠原则。\n> 第二行继续解释这个判断。',
      },
      {
        path: 'source/_posts/article.md',
        sha: 'sha-article',
        title: '重读说服机制',
        date: '2026-05-04 08:00:00',
        desc: '文章摘要',
        published: true,
        hasExplicitPublished: true,
        categories: ['专业'],
        tags: ['产品'],
        permalink: 'persuasion/',
        cover: null,
        contentType: 'post',
        body: '最近重看 [[book/影响力]]，发现很多判断都和增长场景有关。',
      },
      {
        path: 'source/_posts/alias-article.md',
        sha: 'sha-alias-article',
        title: '别名写法',
        date: '2026-05-03 08:00:00',
        desc: '别名双链',
        published: true,
        hasExplicitPublished: true,
        categories: ['专业'],
        tags: ['写作'],
        permalink: 'alias-link/',
        cover: null,
        contentType: 'post',
        body: '> 这次直接写 [[《影响力》]]，预览也应该能识别。',
      },
    ])

    expect(backlinkMap.get('book/影响力')?.map((item) => item.sourceTitle)).toEqual([
      '2026-05-06-星期三',
      '别名写法',
    ])
    expect(backlinkMap.get('book/影响力')?.[0]?.excerpt).toBe('今天又想到 《影响力》 里讲的互惠原则。\n第二行继续解释这个判断。')
    expect(backlinkMap.get('book/影响力')?.[1]?.sourceContentType).toBe('post')
    expect(backlinkMap.has('《影响力》')).toBe(false)
  })

  it('keeps long excerpts complete instead of truncating them', () => {
    const backlinkMap = buildTopicBacklinkMap([
      topicPost,
      {
        path: 'source/diary/20260506101010.md',
        sha: 'sha-diary-long',
        title: '2026-05-06-星期三',
        date: '2026-05-06 10:10:10',
        desc: '',
        published: false,
        hasExplicitPublished: true,
        categories: [],
        tags: ['复盘'],
        permalink: null,
        cover: null,
        contentType: 'diary',
        body: `> 这一段很长，用来确认 [[book/影响力]] 的摘录不会再被截断，而且后半段仍然保留完整上下文。\n> 我希望在展开引用时，依然可以看到中间的判断、例子、提醒，以及最后这个明确的收尾标记：完整保留到这里。`,
      },
    ])

    expect(backlinkMap.get('book/影响力')?.[0]?.excerpt).toContain('完整保留到这里。')
    expect(backlinkMap.get('book/影响力')?.[0]?.excerpt).not.toContain('…')
  })

  it('ignores wiki links outside blockquotes when collecting backlink excerpts', () => {
    const backlinkMap = buildTopicBacklinkMap([
      topicPost,
      {
        path: 'source/_posts/article.md',
        sha: 'sha-article',
        title: '普通正文',
        date: '2026-05-04 08:00:00',
        desc: '文章摘要',
        published: true,
        hasExplicitPublished: true,
        categories: ['专业'],
        tags: ['产品'],
        permalink: 'body-link/',
        cover: null,
        contentType: 'post',
        body: '最近重看 [[book/影响力]]，发现很多判断都和增长场景有关。',
      },
    ])

    expect(backlinkMap.get('book/影响力')).toBeUndefined()
  })

  it('collects diary paragraph excerpts for title-based wiki links', () => {
    const backlinkMap = buildTopicBacklinkMap([
      {
        ...topicPost,
        path: 'source/_posts/portrait.md',
        sha: 'sha-portrait-topic',
        title: '人像摄影',
        desc: '关于人像摄影的主题页',
        contentType: 'post',
        body: '这是一个主题文章。',
        knowledgeKind: undefined,
        isTopic: true,
        topicType: 'theme',
        nodeKey: 'theme/人像摄影',
        aliases: [],
      },
      {
        path: 'source/diary/20260507090000.md',
        sha: 'sha-diary-portrait',
        title: '2026-05-07-星期四',
        date: '2026-05-07 09:00:00',
        desc: '',
        published: false,
        hasExplicitPublished: true,
        categories: [],
        tags: ['摄影'],
        permalink: null,
        cover: null,
        contentType: 'diary',
        body: '## 人像摄影\n最近重新想明白了 [[人像摄影]] 不是器材问题，而是人与光的关系。\n下一步要继续练习和真人沟通。',
      },
    ])

    expect(backlinkMap.get('theme/人像摄影')?.map((item) => item.sourceTitle)).toEqual(['2026-05-07-星期四'])
    expect(backlinkMap.get('theme/人像摄影')?.[0]?.excerpt).toBe(
      '人像摄影\n最近重新想明白了 人像摄影 不是器材问题，而是人与光的关系。\n下一步要继续练习和真人沟通。',
    )
  })

  it('appends a generated topic backlink section without duplicating repeated blockquote excerpts', () => {
    const backlinks = buildTopicBacklinkMap([
      topicPost,
      {
        path: 'source/diary/20260506090909.md',
        sha: 'sha-diary',
        title: '2026-05-06-星期三',
        date: '2026-05-06 09:09:09',
        desc: '',
        published: false,
        hasExplicitPublished: true,
        categories: [],
        tags: ['复盘'],
        permalink: null,
        cover: null,
        contentType: 'diary',
        body: '> 今天又想到 [[book/影响力|《影响力》]] 里讲的互惠原则。\n> 今天又想到 [[book/影响力|《影响力》]] 里讲的互惠原则。',
      },
      {
        path: 'source/_posts/article.md',
        sha: 'sha-article',
        title: '重读说服机制',
        date: '2026-05-04 08:00:00',
        desc: '文章摘要',
        published: true,
        hasExplicitPublished: true,
        categories: ['专业'],
        tags: ['产品'],
        permalink: 'persuasion/',
        cover: null,
        contentType: 'post',
        body: '> 最近重看 [[book/影响力]]，发现很多判断都和增长场景有关。',
      },
    ]).get('book/影响力') || []

    const markdown = appendTopicBacklinksToMarkdown('这是一个主题文章。', backlinks)

    expect(markdown).toContain('## 相关双链摘录')
    expect(markdown).toContain('<details class="topic-backlink-card">')
    expect(markdown).toContain('<span class="topic-backlink-card__title">2026-05-06-星期三</span>')
    expect(markdown).toContain('<span class="topic-backlink-card__meta">日记 · 2026-05-06</span>')
    expect(markdown).toContain('> 今天又想到 《影响力》 里讲的互惠原则。')
    expect(markdown).toContain('<span class="topic-backlink-card__title">重读说服机制</span>')
    expect(markdown.match(/topic-backlink-card__title\">2026-05-06-星期三/g)).toHaveLength(1)
    expect(stripGeneratedTopicBacklinks(markdown)).toBe('这是一个主题文章。')
  })
})
