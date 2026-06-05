const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const {
  FeedImportError,
  importFeed,
  resetDnsLookupForTesting,
  setDnsLookupForTesting,
} = require('./feed-import');

const originalFetch = global.fetch;

function createMockResponse({ body, url, headers = {}, status = 200 }) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );

  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: {
      get(name) {
        return normalizedHeaders.get(String(name).toLowerCase()) || null;
      },
    },
    text: async () => body,
  };
}

afterEach(() => {
  global.fetch = originalFetch;
  resetDnsLookupForTesting();
});

test('importFeed parses an RSS feed and returns normalized items', async () => {
  setDnsLookupForTesting(async () => [{ address: '203.0.113.50', family: 4 }]);
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://example.com/feed.xml');
    assert.match(options.headers.Accept, /application\/rss\+xml/);

    return createMockResponse({
      url,
      headers: {
        'content-type': 'application/rss+xml; charset=utf-8',
      },
      body: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>设计摘录</title>
    <description>关于产品和设计的订阅</description>
    <item>
      <guid>item-1</guid>
      <title>第一篇文章</title>
      <link>https://example.com/posts/1</link>
      <description><![CDATA[<p>第一段摘要。</p>]]></description>
      <pubDate>Thu, 05 Jun 2026 08:00:00 GMT</pubDate>
    </item>
    <item>
      <guid>item-2</guid>
      <title>第二篇文章</title>
      <link>https://example.com/posts/2</link>
      <description>第二段摘要。</description>
    </item>
  </channel>
</rss>`,
    });
  };

  const feed = await importFeed('https://example.com/feed.xml');

  assert.equal(feed.title, '设计摘录');
  assert.equal(feed.description, '关于产品和设计的订阅');
  assert.equal(feed.requestedUrl, 'https://example.com/feed.xml');
  assert.equal(feed.finalUrl, 'https://example.com/feed.xml');
  assert.equal(feed.items.length, 2);
  assert.deepEqual(feed.items[0], {
    id: 'item-1',
    title: '第一篇文章',
    url: 'https://example.com/posts/1',
    summary: '第一段摘要。',
    publishedAt: '2026-06-05T08:00:00.000Z',
    sourceName: '设计摘录',
  });
});

test('importFeed parses an Atom feed and resolves alternate links', async () => {
  setDnsLookupForTesting(async () => [{ address: '203.0.113.51', family: 4 }]);
  global.fetch = async () => createMockResponse({
    url: 'https://example.com/atom.xml',
    headers: {
      'content-type': 'application/atom+xml; charset=utf-8',
    },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>AI 周报</title>
  <subtitle>每周一次的 AI 内容更新</subtitle>
  <entry>
    <id>tag:example.com,2026:1</id>
    <title>Agent 新进展</title>
    <link rel="alternate" href="/posts/agent-update" />
    <summary type="html">&lt;p&gt;一条关于 Agent 的摘要。&lt;/p&gt;</summary>
    <updated>2026-06-04T06:00:00Z</updated>
  </entry>
</feed>`,
  });

  const feed = await importFeed('https://example.com/atom.xml');

  assert.equal(feed.title, 'AI 周报');
  assert.equal(feed.description, '每周一次的 AI 内容更新');
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].url, 'https://example.com/posts/agent-update');
  assert.equal(feed.items[0].summary, '一条关于 Agent 的摘要。');
  assert.equal(feed.items[0].sourceName, 'AI 周报');
});

test('importFeed discovers an Atom feed from a failed conventional feed URL', async () => {
  setDnsLookupForTesting(async () => [{ address: '203.0.113.53', family: 4 }]);
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(url);

    if (url === 'https://quaily.com/shixingcuowu/rss.xml') {
      return createMockResponse({
        url,
        status: 404,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
        body: '<!doctype html><html><head><title>Not found</title></head><body>404</body></html>',
      });
    }

    if (url === 'https://quaily.com/shixingcuowu/') {
      return createMockResponse({
        url,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
        body: `<!doctype html>
<html>
  <body>
    <a rel="me" href="//quaily.com/shixingcuowu/feed/atom" title="试行错误's Atom Feed" class="feed">Atom</a>
  </body>
</html>`,
      });
    }

    if (url === 'https://quaily.com/shixingcuowu/feed/atom') {
      return createMockResponse({
        url,
        headers: {
          'content-type': 'text/xml; charset=utf-8',
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>试行错误</title>
  <subtitle>Quaily 订阅</subtitle>
  <entry>
    <id>tag:quaily.com,2026:1</id>
    <title>第一篇 Quaily 文章</title>
    <link rel="alternate" href="/shixingcuowu/p/first-post" />
    <summary>正文摘要。</summary>
    <updated>2026-06-04T06:00:00Z</updated>
  </entry>
</feed>`,
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  const feed = await importFeed('https://quaily.com/shixingcuowu/rss.xml');

  assert.deepEqual(requestedUrls, [
    'https://quaily.com/shixingcuowu/rss.xml',
    'https://quaily.com/shixingcuowu/',
    'https://quaily.com/shixingcuowu/feed/atom',
  ]);
  assert.equal(feed.requestedUrl, 'https://quaily.com/shixingcuowu/rss.xml');
  assert.equal(feed.finalUrl, 'https://quaily.com/shixingcuowu/feed/atom');
  assert.equal(feed.title, '试行错误');
  assert.equal(feed.items[0].url, 'https://quaily.com/shixingcuowu/p/first-post');
});

test('importFeed discovers a feed link from an HTML homepage', async () => {
  setDnsLookupForTesting(async () => [{ address: '203.0.113.54', family: 4 }]);
  global.fetch = async (url) => {
    if (url === 'https://example.com/blog') {
      return createMockResponse({
        url,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
        body: `<!doctype html>
<html>
  <head>
    <link rel="alternate" type="application/rss+xml" href="/blog/rss.xml" />
  </head>
  <body><article>Latest posts</article></body>
</html>`,
      });
    }

    if (url === 'https://example.com/blog/rss.xml') {
      return createMockResponse({
        url,
        headers: {
          'content-type': 'application/rss+xml; charset=utf-8',
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Blog</title>
    <description>Posts</description>
    <item>
      <guid>post-1</guid>
      <title>Post One</title>
      <link>https://example.com/blog/post-one</link>
      <description>Summary.</description>
    </item>
  </channel>
</rss>`,
      });
    }

    throw new Error(`unexpected fetch: ${url}`);
  };

  const feed = await importFeed('https://example.com/blog');

  assert.equal(feed.requestedUrl, 'https://example.com/blog');
  assert.equal(feed.finalUrl, 'https://example.com/blog/rss.xml');
  assert.equal(feed.title, 'Example Blog');
  assert.equal(feed.items.length, 1);
});

test('importFeed falls back to conventional feed paths from an HTML homepage', async () => {
  setDnsLookupForTesting(async () => [{ address: '203.0.113.55', family: 4 }]);
  const requestedUrls = [];

  global.fetch = async (url) => {
    requestedUrls.push(url);

    if (url === 'https://song.example/') {
      return createMockResponse({
        url,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
        body: '<!doctype html><html><head><title>Simon</title></head><body><article>Latest posts</article></body></html>',
      });
    }

    if (url === 'https://song.example/feed.xml') {
      return createMockResponse({
        url,
        headers: {
          'content-type': 'text/xml; charset=utf-8',
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Simon's Blog</title>
    <description>Posts</description>
    <item>
      <guid>https://song.example/onsen</guid>
      <title>日本温泉完全指南</title>
      <link>https://song.example/onsen</link>
      <description>温泉指南摘要。</description>
    </item>
  </channel>
</rss>`,
      });
    }

    return createMockResponse({
      url,
      status: 404,
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
      body: '<!doctype html><html><body>Not found</body></html>',
    });
  };

  const feed = await importFeed('https://song.example/');

  assert.deepEqual(requestedUrls, [
    'https://song.example/',
    'https://song.example/feed/atom',
    'https://song.example/rss.xml',
    'https://song.example/feed.xml',
  ]);
  assert.equal(feed.requestedUrl, 'https://song.example/');
  assert.equal(feed.finalUrl, 'https://song.example/feed.xml');
  assert.equal(feed.title, "Simon's Blog");
  assert.equal(feed.items.length, 1);
});

test('importFeed rejects non-feed pages with a not_feed code', async () => {
  setDnsLookupForTesting(async () => [{ address: '203.0.113.52', family: 4 }]);
  global.fetch = async () => createMockResponse({
    url: 'https://example.com/article',
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
    body: '<!doctype html><html><head><title>Article</title></head><body><article>Hello</article></body></html>',
  });

  await assert.rejects(
    () => importFeed('https://example.com/article'),
    (error) => {
      assert.ok(error instanceof FeedImportError);
      assert.equal(error.code, 'not_feed');
      return true;
    },
  );
});

test('importFeed blocks hostnames that resolve to private addresses', async () => {
  let fetchCalls = 0;
  setDnsLookupForTesting(async () => [{ address: '127.0.0.1', family: 4 }]);
  global.fetch = async () => {
    fetchCalls += 1;
    return createMockResponse({
      url: 'https://private.example/feed.xml',
      body: '',
    });
  };

  await assert.rejects(
    () => importFeed('https://private.example/feed.xml'),
    /暂不支持导入该地址。/,
  );
  assert.equal(fetchCalls, 0);
});
