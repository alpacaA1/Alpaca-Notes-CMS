const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const feedDirectory = require('./feed-directory');

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function createResponseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(chunk = '') {
      this.body += chunk;
    },
  };
}

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

test('feed directory api returns normalized categories for the allowed owner', async () => {
  process.env.GITHUB_OWNER = 'alpacaA1';
  global.fetch = async (url) => {
    if (url === 'https://api.github.com/user') {
      return createJsonResponse({ login: 'alpacaA1' });
    }

    if (url === 'https://misc.mowen.cn/api/cat/v1/feeds') {
      return createJsonResponse({
        categories: [
          {
            category: 'AI 实验室',
            feeds: [
              {
                id: 1,
                title: 'Claude Blog',
                url: 'https://example.com/feed.xml',
                articleCount: 158,
                intro: { content: '产品更新。' },
              },
            ],
          },
        ],
      });
    }

    throw new Error(`unexpected url: ${url}`);
  };

  const req = {
    method: 'GET',
    headers: {
      authorization: 'Bearer token-1',
      origin: 'https://alpacaa1.github.io',
    },
  };
  const res = createResponseRecorder();

  await feedDirectory(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://alpacaa1.github.io');
  const body = JSON.parse(res.body);
  assert.equal(body.categories.length, 1);
  assert.equal(body.categories[0].feeds[0].title, 'Claude Blog');
});

test('feed directory api requires a bearer token', async () => {
  const req = {
    method: 'GET',
    headers: {},
  };
  const res = createResponseRecorder();

  await feedDirectory(req, res);

  assert.equal(res.statusCode, 401);
  assert.match(JSON.parse(res.body).message, /缺少 GitHub 授权信息/);
});
