const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const {
  assertPrivateRepoScope,
  exchangeCodeForToken,
  hasRepoScope,
  PRIVATE_REPO_SCOPE_ERROR,
  resolveScope,
} = require('./github-oauth');

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

test('resolveScope upgrades public_repo to repo for private content access', () => {
  assert.equal(resolveScope('public_repo read:user'), 'repo read:user');
});

test('hasRepoScope only accepts full repo scope', () => {
  assert.equal(hasRepoScope('repo read:user'), true);
  assert.equal(hasRepoScope('repo,read:user'), true);
  assert.equal(hasRepoScope('public_repo read:user'), false);
});

test('assertPrivateRepoScope throws a recovery hint when repo scope is missing', () => {
  assert.throws(
    () => assertPrivateRepoScope('public_repo read:user'),
    new Error(PRIVATE_REPO_SCOPE_ERROR),
  );
});

test('exchangeCodeForToken returns both token and granted scope', async () => {
  process.env.GITHUB_CLIENT_ID = 'client-id';
  process.env.GITHUB_CLIENT_SECRET = 'client-secret';

  let capturedRequest = null;
  global.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      json: async () => ({
        access_token: 'token-123',
        scope: 'repo,read:user',
      }),
    };
  };

  const result = await exchangeCodeForToken(
    {
      headers: {
        host: 'alpaca-notes-cms.vercel.app',
        'x-forwarded-proto': 'https',
      },
      url: '/api/callback?code=example',
    },
    'example-code',
  );

  assert.equal(capturedRequest.url, 'https://github.com/login/oauth/access_token');
  assert.equal(result.accessToken, 'token-123');
  assert.equal(result.scope, 'repo,read:user');
});
