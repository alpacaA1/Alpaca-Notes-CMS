const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const { importArticle } = require('./article-import');

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

afterEach(() => {
  global.fetch = originalFetch;
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

test('importArticle allows larger WeChat HTML pages', async () => {
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
