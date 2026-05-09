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
              content: '# 月报素材整理\n\n- 素材',
            },
          },
        ],
      }),
    };
  };

  const result = await diaryAi._private.callDiaryModel([
    {
      sourceType: 'diary',
      path: 'source/diary/20260505010101.md',
      title: '日记',
      date: '2026-05-05',
      tags: ['复盘'],
      body: '今天写了素材整理助手。',
    },
    {
      sourceType: 'read-later',
      path: 'source/read-later-items/product.md',
      title: '产品文章',
      date: '2026-05-03',
      tags: ['产品'],
      sourceName: 'Product Weekly',
      externalUrl: 'https://example.com/product',
      readingStatus: 'reading',
      summary: '关于产品节奏的总结。',
      commentary: '这段判断可以写进月报。',
      annotationNotes: [
        {
          sectionLabel: '我的总结',
          quote: '关键句子',
          note: '提醒自己保留上下文。',
          updatedAt: '2026-05-03T12:00:00.000Z',
        },
      ],
    },
  ]);

  assert.equal(result.model, 'example-diary-model');
  assert.equal(result.materialMarkdown, '# 月报素材整理\n\n- 素材');
  assert.equal(calls[0].url, 'https://api.example-model.com/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer provider-key');
  assert.equal(JSON.parse(calls[0].options.body).model, 'example-diary-model');
  assert.match(JSON.parse(calls[0].options.body).messages[1].content, /素材 1 · 日记/);
  assert.match(JSON.parse(calls[0].options.body).messages[1].content, /素材 2 · 待读/);
  assert.match(JSON.parse(calls[0].options.body).messages[1].content, /我的总结/);
});

test('normalizeEntries accepts mixed diary and read-later payloads', () => {
  const entries = diaryAi._private.normalizeEntries({
    entries: [
      {
        path: 'source/diary/20260505010101.md',
        title: '日记',
        date: '2026-05-05',
        tags: ['复盘'],
        body: '今天做了新功能。',
      },
      {
        sourceType: 'read-later',
        path: 'source/read-later-items/product.md',
        title: '产品文章',
        date: '2026-05-03',
        tags: ['产品'],
        sourceName: 'Product Weekly',
        externalUrl: 'https://example.com/product',
        readingStatus: 'done',
        summary: '这里是总结。',
        commentary: '这里是评论。',
        annotationNotes: [
          {
            sectionLabel: '我的评论',
            quote: '原文片段',
            note: '这句值得保留。',
            updatedAt: '2026-05-03T12:00:00.000Z',
          },
        ],
      },
    ],
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0].sourceType, 'diary');
  assert.equal(entries[0].tags[0], '复盘');
  assert.equal(entries[1].sourceType, 'read-later');
  assert.equal(entries[1].annotationNotes.length, 1);
  assert.equal(entries[1].annotationNotes[0].note, '这句值得保留。');
});
