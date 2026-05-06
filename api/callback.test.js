const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const callback = require('./callback');
const { PRIVATE_REPO_SCOPE_ERROR } = require('./_lib/github-oauth');

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

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

test('callback rejects tokens that still lack private repo scope', async () => {
  process.env.GITHUB_CLIENT_ID = 'client-id';
  process.env.GITHUB_CLIENT_SECRET = 'client-secret';
  process.env.GITHUB_OWNER = 'alpacaA1';

  global.fetch = async (url) => {
    if (url === 'https://github.com/login/oauth/access_token') {
      return {
        ok: true,
        json: async () => ({
          access_token: 'token-123',
          scope: 'public_repo',
        }),
      };
    }

    if (url === 'https://api.github.com/user') {
      return {
        ok: true,
        json: async () => ({
          login: 'alpacaA1',
        }),
      };
    }

    throw new Error(`unexpected fetch url: ${url}`);
  };

  const req = {
    headers: {
      accept: 'text/html',
      cookie: 'alpaca_admin_oauth_state=expected-state',
      host: 'alpaca-notes-cms.vercel.app',
      'x-forwarded-proto': 'https',
    },
    query: {
      code: 'example-code',
      state: 'expected-state',
    },
    url: '/api/callback?state=expected-state&code=example-code',
  };
  const res = createResponseRecorder();

  await callback(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.match(res.body, /authorization:github:error:/);
  assert.match(res.body, new RegExp(PRIVATE_REPO_SCOPE_ERROR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
