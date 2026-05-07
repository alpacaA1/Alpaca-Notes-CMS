import { describe, expect, it } from 'vitest'
import { buildTopicBacklinkMap, buildTopicNodeMap, parseWikiLinks } from './wiki-links'
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

  it('only treats topic knowledge posts with node keys as target nodes', () => {
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

    expect(Array.from(nodeMap.keys())).toEqual(['book/影响力'])
    expect(nodeMap.get('book/影响力')?.title).toBe('影响力')
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
        body: '今天又想到 [[book/影响力|《影响力》]] 里讲的互惠原则。',
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
    ])

    expect(backlinkMap.get('book/影响力')?.map((item) => item.sourceTitle)).toEqual([
      '2026-05-06-星期三',
      '重读说服机制',
    ])
    expect(backlinkMap.get('book/影响力')?.[0]?.excerpt).toBe('今天又想到 《影响力》 里讲的互惠原则。')
    expect(backlinkMap.get('book/影响力')?.[1]?.sourceContentType).toBe('post')
  })
})
