const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const {
  importArticle,
  resetDnsLookupForTesting,
  setDnsLookupForTesting,
} = require('./article-import');

const originalFetch = global.fetch;

function createMockResponse({ html, url, headers = {}, status = 200 }) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
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
    text: async () => html,
  };
}

function createMockJsonResponse({ json, url, headers = {}, status = 200 }) {
  return createMockResponse({
    url,
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
    html: JSON.stringify(json),
  });
}

afterEach(() => {
  global.fetch = originalFetch;
  resetDnsLookupForTesting();
});

function createWeChatHtml(body = '<p>第一段内容。</p>') {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta property="og:description" content="这里是文章摘要" />
    <title>页面标题</title>
  </head>
  <body>
    <h1 id="activity-name"> 微信文章标题 </h1>
    <a id="js_name"> 公众号名称 </a>
    <div id="js_content">
      ${body}
    </div>
  </body>
</html>`;
}

test('importArticle extracts WeChat article content and normalizes lazy-loaded images', async () => {
  let receivedRequest = null;
  setDnsLookupForTesting(async () => [{ address: '203.0.113.10', family: 4 }]);

  global.fetch = async (url, options) => {
    receivedRequest = { url, options };

    return createMockResponse({
      url: 'https://mp.weixin.qq.com/s/example',
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
      html: createWeChatHtml(`
        <p>第一段内容。</p>
        <p><img data-src="https://mmbiz.qpic.cn/image.png" src="data:image/gif;base64,placeholder" alt="配图" /></p>
      `),
    });
  };

  const article = await importArticle('https://mp.weixin.qq.com/s/example');

  assert.equal(receivedRequest.url, 'https://mp.weixin.qq.com/s/example');
  assert.equal(receivedRequest.options.headers['Accept-Language'], 'zh-CN,zh;q=0.9,en;q=0.8');
  assert.equal(receivedRequest.options.headers.Referer, 'https://mp.weixin.qq.com/');
  assert.match(receivedRequest.options.headers['User-Agent'], /Mozilla\/5\.0/);

  assert.equal(article.title, '微信文章标题');
  assert.equal(article.desc, '这里是文章摘要');
  assert.equal(article.sourceName, '公众号名称');
  assert.equal(article.requestedUrl, 'https://mp.weixin.qq.com/s/example');
  assert.equal(article.finalUrl, 'https://mp.weixin.qq.com/s/example');
  assert.match(article.markdown, /第一段内容。/);
  assert.match(article.markdown, /!\[配图\]\(https:\/\/mmbiz\.qpic\.cn\/image\.png\)/);
});

test('importArticle normalizes more WeChat image source variants', async () => {
  setDnsLookupForTesting(async () => [{ address: '203.0.113.11', family: 4 }]);
  global.fetch = async () => createMockResponse({
    url: 'https://mp.weixin.qq.com/s/more-image-attrs',
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
    html: createWeChatHtml(`
      <p><img data-src="https://mmbiz.qpic.cn/original.png?wx_fmt=png" src="https://mmbiz.qpic.cn/placeholder.gif" alt="主图" /></p>
      <p><img data-backsrc="//mmbiz.qpic.cn/backup.jpg" alt="备图" /></p>
      <p><img data-croporisrc="https://mmbiz.qpic.cn/crop.webp" alt="裁剪图" /></p>
    `),
  });

  const article = await importArticle('https://mp.weixin.qq.com/s/more-image-attrs');

  assert.match(article.markdown, /!\[主图\]\(https:\/\/mmbiz\.qpic\.cn\/original\.png\?wx_fmt=png\)/);
  assert.match(article.markdown, /!\[备图\]\(https:\/\/mmbiz\.qpic\.cn\/backup\.jpg\)/);
  assert.match(article.markdown, /!\[裁剪图\]\(https:\/\/mmbiz\.qpic\.cn\/crop\.webp\)/);
  assert.doesNotMatch(article.markdown, /placeholder\.gif/);
});

test('importArticle allows larger WeChat HTML pages', async () => {
  setDnsLookupForTesting(async () => [{ address: '203.0.113.12', family: 4 }]);
  global.fetch = async () => createMockResponse({
    url: 'https://mp.weixin.qq.com/s/large-example',
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-length': '3000000',
    },
    html: createWeChatHtml('<p>大页面正文。</p>'),
  });

  const article = await importArticle('https://mp.weixin.qq.com/s/large-example');

  assert.equal(article.title, '微信文章标题');
  assert.match(article.markdown, /大页面正文。/);
});

test('importArticle adds outline-friendly markdown headings when a readable article only has strong paragraphs', async () => {
  setDnsLookupForTesting(async () => [{ address: '203.0.113.13', family: 4 }]);
  global.fetch = async () => createMockResponse({
    url: 'https://example.com/outline-friendly',
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
    html: `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="description" content="这里是摘要" />
    <title>导入后的文章标题</title>
  </head>
  <body>
    <main>
      <article>
        <p><strong>导入后的文章标题</strong></p>
        <p>开头段落。</p>
        <p><strong>具体步骤如下</strong></p>
        <p>正文内容。</p>
      </article>
    </main>
  </body>
</html>`,
  });

  const article = await importArticle('https://example.com/outline-friendly');

  assert.equal(article.title, '导入后的文章标题');
  assert.equal(article.desc, '这里是摘要');
  assert.match(article.markdown, /^# 导入后的文章标题$/m);
  assert.match(article.markdown, /^## 具体步骤如下$/m);
  assert.match(article.markdown, /开头段落。/);
  assert.match(article.markdown, /正文内容。/);
  assert.doesNotMatch(article.markdown, /^\*\*导入后的文章标题\*\*$/m);
});

test('importArticle imports note.mowen.cn detail pages via the note api and preserves code blocks', async () => {
  const fetchCalls = [];
  setDnsLookupForTesting(async () => [{ address: '203.0.113.30', family: 4 }]);
  global.fetch = async (url, options = {}) => {
    fetchCalls.push({ url, options });

    if (url === 'https://note.mowen.cn/detail/mowen-article?code=peek-123') {
      return createMockResponse({
        url,
        headers: {
          'content-type': 'text/html; charset=utf-8',
        },
        html: '<!doctype html><html><head><title>墨问文章</title></head><body><div id="app"></div></body></html>',
      });
    }

    if (url === 'https://note.mowen.cn/api/note/wxa/v1/note/show') {
      return createMockJsonResponse({
        url,
        json: {
          detail: {
            noteBase: {
              uuid: 'mowen-article',
              title: '墨问标题',
              digest: '第一行\n第二行',
              content: '<p>开头段落</p><codeblock language="shellscript">echo hello</codeblock><p>结尾段落</p>',
            },
          },
          user: {
            base: {
              name: '池建强',
            },
          },
        },
      });
    }

    throw new Error(`unexpected fetch url: ${url}`);
  };

  const article = await importArticle('https://note.mowen.cn/detail/mowen-article?code=peek-123');

  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].url, 'https://note.mowen.cn/detail/mowen-article?code=peek-123');
  assert.equal(fetchCalls[1].url, 'https://note.mowen.cn/api/note/wxa/v1/note/show');
  assert.equal(fetchCalls[1].options.method, 'POST');
  assert.match(fetchCalls[1].options.body, /"uuid":"mowen-article"/);
  assert.match(fetchCalls[1].options.body, /"peekKey":"peek-123"/);

  assert.equal(article.title, '墨问标题');
  assert.equal(article.desc, '第一行 第二行');
  assert.equal(article.sourceName, '池建强 · 墨问');
  assert.equal(article.requestedUrl, 'https://note.mowen.cn/detail/mowen-article?code=peek-123');
  assert.equal(article.finalUrl, 'https://note.mowen.cn/detail/mowen-article?code=peek-123');
  assert.match(article.markdown, /^# 墨问标题$/m);
  assert.match(article.markdown, /开头段落/);
  assert.match(article.markdown, /```shellscript\necho hello\n```/);
  assert.match(article.markdown, /结尾段落/);
});

test('importArticle blocks hostnames that resolve to private addresses before fetching', async () => {
  let fetchCalls = 0;
  setDnsLookupForTesting(async () => [{ address: '127.0.0.1', family: 4 }]);
  global.fetch = async () => {
    fetchCalls += 1;
    return createMockResponse({
      url: 'https://blocked.example/article',
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
      html: '<p>should not fetch</p>',
    });
  };

  await assert.rejects(
    () => importArticle('https://blocked.example/article'),
    /暂不支持导入该地址。/,
  );
  assert.equal(fetchCalls, 0);
});

test('importArticle blocks redirects that point to private addresses', async () => {
  const fetchCalls = [];
  setDnsLookupForTesting(async (hostname) => {
    if (hostname === 'redirect.example') {
      return [{ address: '203.0.113.20', family: 4 }];
    }
    if (hostname === '127.0.0.1') {
      return [{ address: '127.0.0.1', family: 4 }];
    }
    throw new Error(`unexpected hostname: ${hostname}`);
  });

  global.fetch = async (url) => {
    fetchCalls.push(url);
    return createMockResponse({
      status: 302,
      url: 'https://redirect.example/start',
      headers: {
        location: 'http://127.0.0.1/internal',
      },
      html: '',
    });
  };

  await assert.rejects(
    () => importArticle('https://redirect.example/start'),
    /暂不支持导入该地址。/,
  );
  assert.deepEqual(fetchCalls, ['https://redirect.example/start']);
});
