const { assertAllowedOwner, fetchGitHubUser } = require('./_lib/github-oauth');

const MAX_REQUEST_CHARS = 180000;
const MAX_TEXT_CHARS = 150000;

class TranslateRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'TranslateRequestError';
    this.statusCode = statusCode;
  }
}

function setCorsHeaders(req, res) {
  const origin = typeof req.headers.origin === 'string' && req.headers.origin ? req.headers.origin : '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Vary', 'Origin');
}

function sendJson(req, res, statusCode, payload) {
  setCorsHeaders(req, res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function readBearerToken(authorizationHeader) {
  const match = String(authorizationHeader || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }

  if (typeof req.body === 'string') {
    return Promise.resolve(JSON.parse(req.body || '{}'));
  }

  return new Promise((resolve, reject) => {
    let raw = '';
    let settled = false;

    req.on('data', (chunk) => {
      if (settled) {
        return;
      }

      raw += chunk;
      if (raw.length > MAX_REQUEST_CHARS) {
        settled = true;
        reject(new TranslateRequestError('待翻译内容过多，请截短后重试。', 413));
      }
    });

    req.on('end', () => {
      if (settled) {
        return;
      }

      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new TranslateRequestError('请求内容不是有效 JSON。', 400));
      }
    });

    req.on('error', () => {
      if (!settled) {
        reject(new TranslateRequestError('读取请求内容失败。', 400));
      }
    });
  });
}

function toStringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePayload(payload) {
  const title = toStringValue(payload?.title);
  const text = toStringValue(payload?.text).slice(0, MAX_TEXT_CHARS);
  const targetLang = toStringValue(payload?.targetLang) || 'zh-CN';

  if (!text) {
    throw new TranslateRequestError('待翻译内容为空。');
  }

  return { title, text, targetLang };
}

function buildTranslationPrompt({ title, text, targetLang }) {
  return `请将以下文章翻译为中文 (${targetLang})：
1. 请保持对原文含义的准确表达，语言自然流畅，适合阅读。
2. 必须保留 Markdown 格式（包括标题、强调、列表、链接、图片、代码块、引用等），不要删除或遗漏内容。
3. 直接输出翻译后的 Markdown 结果，无需包含“以下是翻译”等前缀。

${title ? `文章标题：${title}\n\n` : ''}文章内容：
${text}`;
}

async function callTranslationModel(params) {
  const apiKey = process.env.TRANSLATE_AI_API_KEY || process.env.DIARY_AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new TranslateRequestError('未配置 AI 翻译模型密钥。', 500);
  }

  const baseUrl = (
    process.env.TRANSLATE_AI_BASE_URL ||
    process.env.DIARY_AI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '');

  const model = process.env.TRANSLATE_AI_MODEL || process.env.DIARY_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的 Markdown 长文翻译助手，擅长准确、流畅地将英文 Markdown 文章翻译为中文，并严格保持原本的 Markdown 格式结构。',
        },
        {
          role: 'user',
          content: buildTranslationPrompt(params),
        },
      ],
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || '翻译模型请求失败。';
    throw new TranslateRequestError(message, response.status >= 400 && response.status < 500 ? 502 : 500);
  }

  const translatedText = typeof data?.choices?.[0]?.message?.content === 'string'
    ? data.choices[0].message.content.trim()
    : '';

  if (!translatedText) {
    throw new TranslateRequestError('翻译结果为空。', 502);
  }

  return { translatedText, model };
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    sendJson(req, res, 405, { message: 'Method not allowed.' });
    return;
  }

  const token = readBearerToken(req.headers.authorization);
  if (!token) {
    sendJson(req, res, 401, { message: '缺少 GitHub 授权信息，请重新登录后重试。' });
    return;
  }

  try {
    const user = await fetchGitHubUser(token);
    try {
      assertAllowedOwner(user);
    } catch (error) {
      sendJson(req, res, 403, { message: error instanceof Error ? error.message : '当前账号无权使用该接口。' });
      return;
    }

    const payload = await readJsonBody(req);
    const params = normalizePayload(payload);
    const result = await callTranslationModel(params);

    sendJson(req, res, 200, result);
  } catch (error) {
    if (error instanceof TranslateRequestError) {
      sendJson(req, res, error.statusCode, { message: error.message });
      return;
    }

    if (error instanceof Error && /Failed to fetch GitHub user profile|GitHub access token/i.test(error.message)) {
      sendJson(req, res, 401, { message: 'GitHub 会话已过期，请重新登录。' });
      return;
    }

    sendJson(req, res, 500, { message: error instanceof Error ? error.message : '翻译请求处理失败。' });
  }
}

module.exports = handler;
module.exports._private = {
  buildTranslationPrompt,
  callTranslationModel,
  normalizePayload,
};
