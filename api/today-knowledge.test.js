const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const todayKnowledge = require('./today-knowledge');

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

function encodeContent(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

test('today knowledge api reads current knowledge files from GitHub', async () => {
  const calls = [];
  process.env.PRIVATE_CONTENTS_GITHUB_TOKEN = '';
  global.fetch = async (url, options) => {
    calls.push({ url, options });

    if (url.endsWith('/contents/source/_knowledge?ref=main')) {
      return createJsonResponse([
        { type: 'file', name: '20260519231322.md', path: 'source/_knowledge/20260519231322.md' },
        { type: 'file', name: '20260505230044.md', path: 'source/_knowledge/20260505230044.md' },
        { type: 'file', name: '.gitkeep', path: 'source/_knowledge/.gitkeep' },
      ]);
    }

    if (url.endsWith('/contents/source/_knowledge/20260519231322.md?ref=main')) {
      return createJsonResponse({
        content: encodeContent(`---
title: 新知识点
date: 2026-05-19 23:13:22
---

实时内容`),
      });
    }

    if (url.endsWith('/contents/source/_knowledge/20260505230044.md?ref=main')) {
      return createJsonResponse({
        content: encodeContent(`---
title: 旧知识点
date: 2026-05-05 23:00:44
---

旧内容`),
      });
    }

    throw new Error(`unexpected url: ${url}`);
  };

  const req = {
    method: 'GET',
    headers: {
      authorization: 'Bearer user-token',
      origin: 'https://alpacaa1.github.io',
    },
  };
  const res = createResponseRecorder();

  await todayKnowledge(req, res);

  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://alpacaa1.github.io');
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(body.source, 'github-api');
  assert.equal(body.items.length, 2);
  assert.equal(body.items[0].title, '新知识点');
  assert.equal(body.items[1].title, '旧知识点');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer user-token');
});

test('today knowledge api can use a server-side token', async () => {
  process.env.PRIVATE_CONTENTS_GITHUB_TOKEN = 'server-token';
  global.fetch = async () => createJsonResponse([]);

  const req = { method: 'GET', headers: {} };
  const res = createResponseRecorder();

  await todayKnowledge(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).items.length, 0);
});

test('today knowledge api returns 401 when no token is available', async () => {
  process.env.PRIVATE_CONTENTS_GITHUB_TOKEN = '';
  process.env.GITHUB_CONTENT_TOKEN = '';
  process.env.GITHUB_TOKEN = '';

  const req = { method: 'GET', headers: {} };
  const res = createResponseRecorder();

  await todayKnowledge(req, res);

  assert.equal(res.statusCode, 401);
  assert.match(JSON.parse(res.body).message, /缺少 GitHub 授权信息/);
});
