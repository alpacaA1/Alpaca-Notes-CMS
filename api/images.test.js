const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const imagesHandler = require('./images');

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

function createResponseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(chunk = '') {
      if (chunk) {
        this.body = chunk;
      }
    },
  };
}

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

test('images api returns 400 when path parameter is missing', async () => {
  const req = {
    method: 'GET',
    url: '/api/images',
    headers: { host: 'localhost' },
  };
  const res = createResponseRecorder();

  await imagesHandler(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body, /缺少 path 参数/);
});

test('images api proxies image with proper headers and cache control', async () => {
  const calls = [];
  const fakeImageBytes = Buffer.from('fake-image-bytes-png');

  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => fakeImageBytes,
    };
  };

  const req = {
    method: 'GET',
    url: '/api/images?path=/Alpaca-Notes-CMS/images/2026/08/test.png',
    headers: { host: 'localhost' },
  };
  const res = createResponseRecorder();

  await imagesHandler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'image/png');
  assert.equal(res.headers['Cache-Control'], 'public, max-age=31536000, s-maxage=31536000, immutable');
  assert.equal(res.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(Buffer.isBuffer(res.body), true);
  assert.equal(res.body.toString('utf8'), 'fake-image-bytes-png');

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /source\/images\/2026\/08\/test\.png/);
});

test('images api handles 404 from GitHub gracefully', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 404,
  });

  const req = {
    method: 'GET',
    url: '/api/images?path=images/not-found.webp',
    headers: { host: 'localhost' },
  };
  const res = createResponseRecorder();

  await imagesHandler(req, res);

  assert.equal(res.statusCode, 404);
});
