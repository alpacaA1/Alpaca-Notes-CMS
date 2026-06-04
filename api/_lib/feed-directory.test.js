const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const { FeedDirectoryError, fetchFeedDirectory } = require('./feed-directory');

const originalFetch = global.fetch;

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

afterEach(() => {
  global.fetch = originalFetch;
});

test('fetchFeedDirectory normalizes grouped feeds', async () => {
  global.fetch = async () => createJsonResponse({
    categories: [
      {
        category: 'AI 实验室',
        feeds: [
          {
            id: 2,
            title: 'OpenAI Research',
            url: 'https://openai.com/blog/rss.xml',
            sortOrder: 2,
            articleCount: 999,
            lastSuccessAt: '2026-06-04T06:30:52.717572Z',
            intro: { content: '研究更新。' },
          },
          {
            id: 1,
            title: 'Claude Blog',
            url: 'https://example.com/feed.xml',
            sortOrder: 1,
            articleCount: 158,
            lastSuccessAt: '2026-06-04T06:30:50.355763Z',
            intro: { content: '产品更新。' },
          },
        ],
      },
    ],
  });

  const result = await fetchFeedDirectory();

  assert.deepEqual(result, {
    categories: [
      {
        category: 'AI 实验室',
        feeds: [
          {
            id: '1',
            title: 'Claude Blog',
            url: 'https://example.com/feed.xml',
            category: 'AI 实验室',
            articleCount: 158,
            lastSuccessAt: '2026-06-04T06:30:50.355763Z',
            intro: { content: '产品更新。' },
          },
          {
            id: '2',
            title: 'OpenAI Research',
            url: 'https://openai.com/blog/rss.xml',
            category: 'AI 实验室',
            articleCount: 999,
            lastSuccessAt: '2026-06-04T06:30:52.717572Z',
            intro: { content: '研究更新。' },
          },
        ],
      },
    ],
  });
});

test('fetchFeedDirectory rejects invalid payloads', async () => {
  global.fetch = async () => createJsonResponse({ feeds: [] });

  await assert.rejects(
    () => fetchFeedDirectory(),
    (error) => {
      assert.ok(error instanceof FeedDirectoryError);
      assert.equal(error.code, 'invalid_directory_response');
      return true;
    },
  );
});
