const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const diaryAi = require('./diary-ai');

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

test('diary ai uses configurable OpenAI-compatible base url and api key', async () => {
  const calls = [];
  process.env.DIARY_AI_API_KEY = 'provider-key';
  process.env.DIARY_AI_BASE_URL = 'https://api.example-model.com/v1/';
  process.env.DIARY_AI_MODEL = 'example-diary-model';

  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '# 日记素材整理\n\n- 素材',
            },
          },
        ],
      }),
    };
  };

  const result = await diaryAi._private.callDiaryModel([
    {
      path: 'source/diary/20260505010101.md',
      title: '日记',
      date: '2026-05-05',
      body: '今天写了素材整理助手。',
    },
  ]);

  assert.equal(result.model, 'example-diary-model');
  assert.equal(result.materialMarkdown, '# 日记素材整理\n\n- 素材');
  assert.equal(calls[0].url, 'https://api.example-model.com/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer provider-key');
  assert.equal(JSON.parse(calls[0].options.body).model, 'example-diary-model');
});
