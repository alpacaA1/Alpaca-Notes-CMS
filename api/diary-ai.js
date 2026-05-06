const { assertAllowedOwner, fetchGitHubUser } = require('./_lib/github-oauth');

const MAX_ENTRIES = 30;
const MAX_BODY_CHARS = 8000;
const MAX_TOTAL_BODY_CHARS = 120000;
const MAX_REQUEST_CHARS = 180000;

class DiaryAiRequestError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'DiaryAiRequestError';
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
        reject(new DiaryAiRequestError('选中的日记内容过多，请减少后重试。', 413));
      }
    });

    req.on('end', () => {
      if (settled) {
        return;
      }

      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new DiaryAiRequestError('请求内容不是有效 JSON。', 400));
      }
    });

    req.on('error', () => {
      if (!settled) {
        reject(new DiaryAiRequestError('读取请求内容失败。', 400));
      }
    });
  });
}

function toStringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEntries(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  if (entries.length === 0) {
    throw new DiaryAiRequestError('请至少选择一篇日记。');
  }

  if (entries.length > MAX_ENTRIES) {
    throw new DiaryAiRequestError(`一次最多整理 ${MAX_ENTRIES} 篇日记。`);
  }

  let totalBodyChars = 0;
  const normalizedEntries = entries.map((entry) => {
    const body = toStringValue(entry?.body).slice(0, MAX_BODY_CHARS);
    totalBodyChars += body.length;

    return {
      path: toStringValue(entry?.path),
      title: toStringValue(entry?.title) || '未命名日记',
      date: toStringValue(entry?.date),
      body,
    };
  });

  if (totalBodyChars === 0) {
    throw new DiaryAiRequestError('选中的日记没有可整理的正文。');
  }

  if (totalBodyChars > MAX_TOTAL_BODY_CHARS) {
    throw new DiaryAiRequestError('选中的日记内容过多，请减少后重试。', 413);
  }

  return normalizedEntries;
}

function buildDiaryPrompt(entries) {
  const diaryBlock = entries
    .map((entry, index) => [
      `### 日记 ${index + 1}`,
      `标题：${entry.title}`,
      `日期：${entry.date || '未标日期'}`,
      `路径：${entry.path || '未标路径'}`,
      '',
      entry.body,
    ].join('\n'))
    .join('\n\n---\n\n');

  return `请整理下面这些日记为后续写作可复用的素材。要求：
- 只做素材整理，不要写月报、不要生成文章、不要替用户做结论包装。
- 忠实于日记原文，不补充外部事实。
- 按月或日期保留关键线索，尽量写成可直接复制进素材库的 Markdown。
- 优先提炼事件、阶段性进展、情绪变化、问题/洞察、可引用原句。

输出格式：
# 日记素材整理
## 高频主题
## 事件线索
## 可复用素材
## 可继续追问的问题

日记如下：

${diaryBlock}`;
}

async function callDiaryModel(entries) {
  const apiKey = process.env.DIARY_AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new DiaryAiRequestError('未配置日记 AI 模型密钥。', 500);
  }

  const baseUrl = (process.env.DIARY_AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.DIARY_AI_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.25,
      max_tokens: 2200,
      messages: [
        {
          role: 'system',
          content: '你是一个中文个人写作素材整理助手，擅长从日记中提炼真实、可复用、低加工度的素材。你不会生成月报文章。',
        },
        {
          role: 'user',
          content: buildDiaryPrompt(entries),
        },
      ],
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || '日记素材整理模型请求失败。';
    throw new DiaryAiRequestError(message, response.status >= 400 && response.status < 500 ? 502 : 500);
  }

  const materialMarkdown = typeof data?.choices?.[0]?.message?.content === 'string'
    ? data.choices[0].message.content.trim()
    : '';

  if (!materialMarkdown) {
    throw new DiaryAiRequestError('日记素材整理结果为空。', 502);
  }

  return { materialMarkdown, model };
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
    const entries = normalizeEntries(payload);
    const result = await callDiaryModel(entries);

    sendJson(req, res, 200, result);
  } catch (error) {
    if (error instanceof DiaryAiRequestError) {
      sendJson(req, res, error.statusCode, { message: error.message });
      return;
    }

    if (error instanceof Error && /Failed to fetch GitHub user profile|GitHub access token/i.test(error.message)) {
      sendJson(req, res, 401, { message: 'GitHub 会话已过期，请重新登录。' });
      return;
    }

    sendJson(req, res, 500, { message: error instanceof Error ? error.message : '日记素材整理失败。' });
  }
}

module.exports = handler;
module.exports._private = {
  buildDiaryPrompt,
  callDiaryModel,
  normalizeEntries,
};
