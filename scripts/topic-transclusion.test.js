const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  applyTopicTransclusion,
  buildTopicTransclusionIndex,
  stripGeneratedTopicBacklinks,
} = require('./topic-transclusion.js');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'alpaca-topic-transclusion-'));
}

test('buildTopicTransclusionIndex collects backlinks from published posts only', () => {
  const workspaceRoot = createTempWorkspace();
  const sourceDir = path.join(workspaceRoot, 'source');

  writeFile(
    path.join(sourceDir, '_posts', 'topic.md'),
    `---
title: 影响力
topic: true
topic_type: book
node_key: book/影响力
aliases:
  - 《影响力》
date: 2026-05-05 09:00:00
published: true
categories:
  - 读书
tags:
  - 读书
desc: 关于《影响力》的主题页
---

这是一个主题文章。`,
  );
  writeFile(
    path.join(sourceDir, '_posts', 'published.md'),
    `---
title: 重读说服机制
date: 2026-05-04 08:00:00
published: true
categories:
  - 专业
tags:
  - 产品
desc: 文章摘要
---

今天又想到 [[book/影响力|《影响力》]] 里讲的互惠原则。`,
  );
  writeFile(
    path.join(sourceDir, '_posts', 'draft.md'),
    `---
title: 不应公开的草稿
date: 2026-05-03 08:00:00
published: false
categories:
  - 专业
tags:
  - 产品
desc: 草稿摘要
---

草稿里也写了 [[book/影响力]]。`,
  );
  writeFile(
    path.join(sourceDir, '_knowledge', 'private-note.md'),
    `---
title: 私有知识点
knowledge: true
knowledge_kind: note
date: 2026-05-02 08:00:00
published: false
tags:
  - 读书
desc:
---

这里也提到了 [[book/影响力]]。`,
  );

  const { backlinkMap } = buildTopicTransclusionIndex(sourceDir);
  const backlinks = backlinkMap.get('book/影响力') || [];

  assert.equal(backlinks.length, 1);
  assert.equal(backlinks[0].sourceTitle, '重读说服机制');
  assert.equal(backlinks[0].excerpt, '今天又想到 《影响力》 里讲的互惠原则。');
});

test('applyTopicTransclusion appends and clears generated topic backlink sections', () => {
  const backlinkMap = new Map([
    [
      'book/影响力',
      [
        {
          targetKey: 'book/影响力',
          sourcePath: '_posts/published.md',
          sourceTitle: '重读说服机制',
          sourceDate: '2026-05-04 08:00:00',
          sourceContentType: 'post',
          excerpt: '今天又想到 《影响力》 里讲的互惠原则。',
        },
      ],
    ],
  ]);

  const rendered = applyTopicTransclusion(
    {
      source: '_posts/topic.md',
      topic: true,
      node_key: 'book/影响力',
      content: '这是一个主题文章。',
    },
    backlinkMap,
  );

  assert.match(rendered.content, /## 相关双链摘录/);
  assert.match(rendered.content, /### 重读说服机制/);
  assert.match(rendered.content, /> 今天又想到 《影响力》 里讲的互惠原则。/);
  assert.equal(stripGeneratedTopicBacklinks(rendered.content), '这是一个主题文章。');
});
