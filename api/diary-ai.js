const { assertAllowedOwner, fetchGitHubUser } = require('./_lib/github-oauth');

const MAX_ENTRIES = 30;
const MAX_BODY_CHARS = 8000;
const MAX_TOTAL_BODY_CHARS = 120000;
const MAX_REQUEST_CHARS = 180000;
const MAX_ANNOTATION_NOTES = 20;

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
        reject(new DiaryAiRequestError('选中的素材内容过多，请减少后重试。', 413));
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

function toStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => toStringValue(item))
    .filter(Boolean)
    .slice(0, 12);
}

function normalizeAnnotationNotes(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((note) => ({
      sectionLabel: toStringValue(note?.sectionLabel) || '批注',
      quote: toStringValue(note?.quote).slice(0, 400),
      note: toStringValue(note?.note).slice(0, 1000),
      updatedAt: toStringValue(note?.updatedAt),
    }))
    .filter((note) => note.quote || note.note)
    .slice(0, MAX_ANNOTATION_NOTES);
}

function normalizeEntries(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  if (entries.length === 0) {
    throw new DiaryAiRequestError('请至少选择一条素材。');
  }

  if (entries.length > MAX_ENTRIES) {
    throw new DiaryAiRequestError(`一次最多整理 ${MAX_ENTRIES} 条素材。`);
  }

  let totalBodyChars = 0;
  const normalizedEntries = entries.map((entry) => {
    const sourceType = entry?.sourceType === 'read-later' ? 'read-later' : 'diary';
    const path = toStringValue(entry?.path);
    const title = toStringValue(entry?.title) || (sourceType === 'read-later' ? '未命名待读' : '未命名日记');
    const date = toStringValue(entry?.date);
    const tags = toStringList(entry?.tags);

    if (sourceType === 'read-later') {
      const summary = toStringValue(entry?.summary).slice(0, MAX_BODY_CHARS);
      const commentary = toStringValue(entry?.commentary).slice(0, MAX_BODY_CHARS);
      const annotationNotes = normalizeAnnotationNotes(entry?.annotationNotes);
      const annotationChars = annotationNotes.reduce((total, note) => total + note.quote.length + note.note.length, 0);
      totalBodyChars += summary.length + commentary.length + annotationChars;

      return {
        sourceType,
        path,
        title,
        date,
        tags,
        sourceName: toStringValue(entry?.sourceName),
        externalUrl: toStringValue(entry?.externalUrl),
        readingStatus: ['unread', 'reading', 'done'].includes(entry?.readingStatus) ? entry.readingStatus : 'unread',
        summary,
        commentary,
        annotationNotes,
      };
    }

    const body = toStringValue(entry?.body).slice(0, MAX_BODY_CHARS);
    totalBodyChars += body.length;

    return {
      sourceType,
      path,
      title,
      date,
      tags,
      body,
    };
  });

  if (totalBodyChars === 0) {
    throw new DiaryAiRequestError('选中的素材没有可整理的内容。');
  }

  if (totalBodyChars > MAX_TOTAL_BODY_CHARS) {
    throw new DiaryAiRequestError('选中的素材内容过多，请减少后重试。', 413);
  }

  return normalizedEntries;
}

function buildDiaryMaterialBlock(entry, index) {
  return [
    `### 素材 ${index + 1} · 日记`,
    `标题：${entry.title}`,
    `日期：${entry.date || '未标日期'}`,
    `路径：${entry.path || '未标路径'}`,
    `标签：${entry.tags.length > 0 ? entry.tags.join('、') : '无'}`,
    '',
    entry.body,
  ].join('\n');
}

function buildReadLaterMaterialBlock(entry, index) {
  const noteBlock = entry.annotationNotes.length > 0
    ? entry.annotationNotes.map((note, noteIndex) => [
      `- 批注 ${noteIndex + 1} · ${note.sectionLabel}`,
      `  摘录：${note.quote || '（无摘录）'}`,
      `  评论：${note.note || '（无评论）'}`,
      `  更新时间：${note.updatedAt || '未记录'}`,
    ].join('\n')).join('\n')
    : '- 无带评论的批注';

  return [
    `### 素材 ${index + 1} · 待读`,
    `标题：${entry.title}`,
    `收录日期：${entry.date || '未标日期'}`,
    `路径：${entry.path || '未标路径'}`,
    `来源：${entry.sourceName || '未填写来源'}`,
    `原文链接：${entry.externalUrl || '未填写原文链接'}`,
    `阅读状态：${entry.readingStatus === 'done' ? '已读' : entry.readingStatus === 'reading' ? '在读' : '未读'}`,
    `标签：${entry.tags.length > 0 ? entry.tags.join('、') : '无'}`,
    '',
    '#### 我的总结',
    entry.summary || '（空）',
    '',
    '#### 我的评论',
    entry.commentary || '（空）',
    '',
    '#### 批注',
    noteBlock,
  ].join('\n');
}

function buildDiaryPrompt(entries) {
  const materialBlock = entries
    .map((entry, index) => (
      entry.sourceType === 'read-later'
        ? buildReadLaterMaterialBlock(entry, index)
        : buildDiaryMaterialBlock(entry, index)
    ))
    .join('\n\n---\n\n');

  return `请整理下面这些素材，供后续撰写月报或阶段总结使用。要求：
- 只做素材整理，不要直接代写月报，不要生成成品文章。
- 忠实于输入内容，不补充外部事实。
- 日记更偏向事实、进展、情绪、问题；待读更偏向我的总结、我的评论、以及我标出的批注观点。
- 对待读不要大段复述原文，优先提炼真正值得写进月报的判断、提醒和可引用句子。
- 输出尽量低加工，保留时间线和引用线索，方便后续自行组织月报。

输出格式：
# 月报素材整理
## 本月推进 / 发生了什么
## 值得写进月报的观点 / 判断
## 可直接引用的句子
## 可继续展开的线索

素材如下：

${materialBlock}`;
}

async function callDiaryModel(entries) {
  const apiKey = process.env.DIARY_AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new DiaryAiRequestError('未配置素材整理 AI 模型密钥。', 500);
  }

  const baseUrl = (process.env.DIARY_AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const defaultModel = baseUrl.toLowerCase().includes('deepseek') ? 'deepseek-chat' : 'gpt-4o-mini';
  const model = process.env.DIARY_AI_MODEL || process.env.OPENAI_MODEL || defaultModel;
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
          content: '你是一个中文个人写作素材整理助手，擅长从日记、待读笔记与批注中提炼真实、可复用、低加工度的素材。你不会直接生成月报成文。',
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
    const message = data?.error?.message || '素材整理模型请求失败。';
    throw new DiaryAiRequestError(message, response.status >= 400 && response.status < 500 ? 502 : 500);
  }

  const materialMarkdown = typeof data?.choices?.[0]?.message?.content === 'string'
    ? data.choices[0].message.content.trim()
    : '';

  if (!materialMarkdown) {
    throw new DiaryAiRequestError('素材整理结果为空。', 502);
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

    sendJson(req, res, 500, { message: error instanceof Error ? error.message : '素材整理失败。' });
  }
}

module.exports = handler;
module.exports._private = {
  buildDiaryPrompt,
  callDiaryModel,
  normalizeEntries,
};
