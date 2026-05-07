const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { collectMarkdownImagePaths, syncPrivateContent } = require('./sync-private-content.js');

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createTempWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'alpaca-private-content-'));
}

test('collectMarkdownImagePaths reads both markdown images and cover fields', () => {
  const content = `---
title: Example
cover: /Alpaca-Notes-CMS/images/2026/04/cover.png
---

![inline](/Alpaca-Notes-CMS/images/2026/04/body.png)
<img src="/images/2026/04/html.png" />`;

  const imagePaths = Array.from(collectMarkdownImagePaths(content, '/Alpaca-Notes-CMS')).sort();

  assert.deepEqual(imagePaths, [
    'images/2026/04/body.png',
    'images/2026/04/cover.png',
    'images/2026/04/html.png',
  ]);
});

test('syncPrivateContent copies public content directories and only publishes referenced images', () => {
  const workspaceRoot = createTempWorkspace();
  const publicSourceDir = path.join(workspaceRoot, 'source');
  const contentRoot = path.join(workspaceRoot, 'private-content');

  writeFile(path.join(publicSourceDir, '_posts', 'stale.md'), 'stale');
  writeFile(path.join(publicSourceDir, 'images', '2026', '04', 'stale.png'), 'stale');
  writeFile(path.join(publicSourceDir, 'diary', 'secret.md'), 'secret');
  writeFile(path.join(publicSourceDir, 'read-later-items', 'secret.md'), 'secret');
  writeFile(path.join(publicSourceDir, '_knowledge', 'secret.md'), 'secret');

  writeFile(path.join(contentRoot, 'source', '_posts', 'published.md'), `---
title: Published
published: true
cover: /Alpaca-Notes-CMS/images/2026/04/cover.png
---

![published](/Alpaca-Notes-CMS/images/2026/04/published.png)`);
  writeFile(path.join(contentRoot, 'source', '_posts', 'implicit-published.md'), `---
title: Implicit Published
---

<img src="/images/2026/04/html.png" />`);
  writeFile(path.join(contentRoot, 'source', '_posts', 'draft.md'), `---
title: Draft
published: false
---

![draft](/Alpaca-Notes-CMS/images/2026/04/draft.png)`);
  writeFile(path.join(contentRoot, 'source', 'read-later-items', 'saved.md'), `---
title: Saved
permalink: read-later/saved/
layout: read-later-item
read_later: true
cover: /Alpaca-Notes-CMS/images/2026/04/read-later-cover.png
---

![reader](/images/2026/04/read-later-body.png)`);
  writeFile(path.join(contentRoot, 'source', '_knowledge', 'fact.md'), `---
title: Fact
knowledge: true
published: false
---

![knowledge](/Alpaca-Notes-CMS/images/2026/04/knowledge.png)`);

  writeFile(path.join(contentRoot, 'source', 'images', '2026', '04', 'cover.png'), 'cover');
  writeFile(path.join(contentRoot, 'source', 'images', '2026', '04', 'published.png'), 'published');
  writeFile(path.join(contentRoot, 'source', 'images', '2026', '04', 'html.png'), 'html');
  writeFile(path.join(contentRoot, 'source', 'images', '2026', '04', 'draft.png'), 'draft');
  writeFile(path.join(contentRoot, 'source', 'images', '2026', '04', 'read-later-cover.png'), 'read-later-cover');
  writeFile(path.join(contentRoot, 'source', 'images', '2026', '04', 'read-later-body.png'), 'read-later-body');
  writeFile(path.join(contentRoot, 'source', 'images', '2026', '04', 'knowledge.png'), 'knowledge');

  const summary = syncPrivateContent({
    workspaceRoot,
    contentRoot,
    publicSourceDir,
    siteRootPath: '/Alpaca-Notes-CMS',
  });

  assert.equal(summary.copiedPosts, 3);
  assert.equal(summary.copiedReadLater, 1);
  assert.equal(summary.copiedKnowledge, 1);
  assert.equal(summary.copiedImages, 6);
  assert.equal(fs.existsSync(path.join(publicSourceDir, '_posts', 'published.md')), true);
  assert.equal(fs.existsSync(path.join(publicSourceDir, '_posts', 'draft.md')), true);
  assert.equal(fs.existsSync(path.join(publicSourceDir, 'read-later-items', 'saved.md')), true);
  assert.equal(fs.existsSync(path.join(publicSourceDir, '_knowledge', 'fact.md')), true);
  assert.equal(fs.existsSync(path.join(publicSourceDir, 'images', '2026', '04', 'published.png')), true);
  assert.equal(fs.existsSync(path.join(publicSourceDir, 'images', '2026', '04', 'cover.png')), true);
  assert.equal(fs.existsSync(path.join(publicSourceDir, 'images', '2026', '04', 'html.png')), true);
  assert.equal(fs.existsSync(path.join(publicSourceDir, 'images', '2026', '04', 'read-later-cover.png')), true);
  assert.equal(fs.existsSync(path.join(publicSourceDir, 'images', '2026', '04', 'read-later-body.png')), true);
  assert.equal(fs.existsSync(path.join(publicSourceDir, 'images', '2026', '04', 'knowledge.png')), true);
  assert.equal(fs.existsSync(path.join(publicSourceDir, 'images', '2026', '04', 'draft.png')), false);
  assert.equal(fs.existsSync(path.join(publicSourceDir, 'images', '2026', '04', 'stale.png')), false);
  assert.equal(fs.existsSync(path.join(publicSourceDir, 'diary')), false);
});

test('syncPrivateContent fails when a published post references a missing image', () => {
  const workspaceRoot = createTempWorkspace();
  const publicSourceDir = path.join(workspaceRoot, 'source');
  const contentRoot = path.join(workspaceRoot, 'private-content');

  writeFile(path.join(contentRoot, 'source', '_posts', 'published.md'), `---
title: Published
published: true
---

![missing](/Alpaca-Notes-CMS/images/2026/04/missing.png)`);
  fs.mkdirSync(path.join(contentRoot, 'source', 'images'), { recursive: true });

  assert.throws(
    () =>
      syncPrivateContent({
        workspaceRoot,
        contentRoot,
        publicSourceDir,
        siteRootPath: '/Alpaca-Notes-CMS',
      }),
    /私有内容仓库缺少公开内容引用的图片：images\/2026\/04\/missing\.png/,
  );
});
