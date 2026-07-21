const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const translateApi = require('./translate-read-later');

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
});

test('translate-read-later API uses configurable OpenAI-compatible base url and api key', async () => {
  const calls = [];
  process.env.TRANSLATE_AI_API_KEY = 'translate-key';
  process.env.TRANSLATE_AI_BASE_URL = 'https://api.translate-model.com/v1/';
  process.env.TRANSLATE_AI_MODEL = 'example-translate-model';

  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '# 翻译标题\n\n这是翻译后的正文内容。',
            },
          },
        ],
      }),
    };
  };

  const result = await translateApi._private.callTranslationModel({
    title: 'Test Article',
    text: '# Test Article\n\nThis is the content.',
    targetLang: 'zh-CN',
  });

  assert.equal(result.model, 'example-translate-model');
  assert.equal(result.translatedText, '# 翻译标题\n\n这是翻译后的正文内容。');
  assert.equal(calls[0].url, 'https://api.translate-model.com/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer translate-key');
  assert.equal(JSON.parse(calls[0].options.body).model, 'example-translate-model');
  assert.match(JSON.parse(calls[0].options.body).messages[1].content, /文章标题：Test Article/);
});

test('normalizePayload validates non-empty text', () => {
  const params = translateApi._private.normalizePayload({
    title: 'Hello',
    text: 'World content',
    targetLang: 'zh-CN',
  });
  assert.equal(params.title, 'Hello');
  assert.equal(params.text, 'World content');
  assert.equal(params.targetLang, 'zh-CN');

  assert.throws(
    () => translateApi._private.normalizePayload({ title: 'Hello', text: '' }),
    /待翻译内容为空/,
  );
});
