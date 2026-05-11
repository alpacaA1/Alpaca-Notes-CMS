import { describe, expect, it } from 'vitest'
import { buildInternalReferenceCandidates, buildInternalReferenceLookup, searchInternalReferenceCandidates } from './internal-links'
import { parsePostIndexItem } from './posts/index-posts'

describe('internal reference search', () => {
  it('ranks title matches ahead of body-only matches', () => {
    const candidates = buildInternalReferenceCandidates([
      parsePostIndexItem({
        path: 'source/_posts/title-match.md',
        sha: 'title-match-sha',
        content: `---
title: 影响力模型
date: 2026-05-11 10:00:00
permalink: influence-model/
published: true
---

这篇文章讲标题命中。`,
      }),
      parsePostIndexItem({
        path: 'source/_posts/body-match.md',
        sha: 'body-match-sha',
        content: `---
title: 说服笔记
date: 2026-05-10 10:00:00
permalink: persuasion-notes/
published: true
---

正文里提到影响力和说服机制。`,
      }),
    ])

    expect(searchInternalReferenceCandidates(candidates, '影响力').map((item) => item.title)).toEqual([
      '影响力模型',
      '说服笔记',
    ])
  })

  it('does not use body recall for short queries', () => {
    const candidates = buildInternalReferenceCandidates([
      parsePostIndexItem({
        path: 'source/_posts/title-match.md',
        sha: 'title-match-sha',
        content: `---
title: 影响力模型
date: 2026-05-11 10:00:00
permalink: influence-model/
published: true
---

这篇文章讲标题命中。`,
      }),
      parsePostIndexItem({
        path: 'source/_posts/body-short-query.md',
        sha: 'body-short-query-sha',
        content: `---
title: 说服笔记
date: 2026-05-10 10:00:00
permalink: persuasion-notes/
published: true
---

正文里多次提到影响和判断。`,
      }),
    ])

    expect(searchInternalReferenceCandidates(candidates, '影响').map((item) => item.title)).toEqual([
      '影响力模型',
    ])
  })

  it('still recalls related content from body text', () => {
    const candidates = buildInternalReferenceCandidates([
      parsePostIndexItem({
        path: 'source/_posts/body-recall.md',
        sha: 'body-recall-sha',
        content: `---
title: 说服笔记
date: 2026-05-11 10:00:00
permalink: persuasion-notes/
published: true
---

这里详细记录了互惠原则和承诺一致的例子。`,
      }),
      parsePostIndexItem({
        path: 'source/_posts/other.md',
        sha: 'other-sha',
        content: `---
title: 另外一篇
date: 2026-05-10 09:00:00
permalink: other-note/
published: true
---

这里只讲别的话题。`,
      }),
    ])

    expect(searchInternalReferenceCandidates(candidates, '互惠原则').map((item) => item.title)).toEqual([
      '说服笔记',
    ])
  })

  it('uses node_key as the primary target for topic nodes', () => {
    const topicPost = parsePostIndexItem({
      path: 'source/_posts/influence-topic.md',
      sha: 'topic-sha',
      content: `---
title: 影响力
date: 2026-05-11 10:00:00
permalink: influence/
published: true
topic: true
topic_type: book
node_key: book/影响力
aliases:
  - 《影响力》
---

这是一个主题文章。`,
    })

    const [candidate] = buildInternalReferenceCandidates([topicPost])
    const lookup = buildInternalReferenceLookup([topicPost])

    expect(candidate).toMatchObject({
      targetKey: 'book/影响力',
      identifier: 'book/影响力',
      contentType: 'post',
      isTopicNode: true,
    })
    expect(lookup.get('book/影响力')?.path).toBe(topicPost.path)
    expect(lookup.get('post:influence/')?.path).toBe(topicPost.path)
  })
})
