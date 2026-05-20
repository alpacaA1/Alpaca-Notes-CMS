const { buildKnowledgeItem } = require('../scripts/today-knowledge.js');

const GITHUB_API_BASE = 'https://api.github.com';
const REPO_OWNER = 'alpacaA1';
const REPO_NAME = 'Alpaca-Notes-Content';
const REPO_BRANCH = 'main';
const KNOWLEDGE_PATH = 'source/_knowledge';
const SUPPORTED_CONTENT_FILE_PATTERN = /\.(md|markdown|mdown|mkd|mkdn|mdtext|mdtxt|txt|text|plaintext|plaintxt)$/i;

class GitHubContentError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'GitHubContentError';
    this.statusCode = statusCode;
  }
}

function setCorsHeaders(req, res) {
  const origin = typeof req.headers.origin === 'string' && req.headers.origin ? req.headers.origin : '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Vary', 'Origin');
}

function sendJson(req, res, statusCode, payload, cacheControl = 'no-store') {
  setCorsHeaders(req, res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', cacheControl);
  res.end(JSON.stringify(payload));
}

function readBearerToken(authorizationHeader) {
  const match = String(authorizationHeader || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function getServerToken() {
  return (
    process.env.PRIVATE_CONTENTS_GITHUB_TOKEN ||
    process.env.GITHUB_CONTENT_TOKEN ||
    process.env.GITHUB_TOKEN ||
    ''
  ).trim();
}

function resolveGitHubToken(req) {
  return readBearerToken(req.headers.authorization) || getServerToken();
}

function decodeBase64Content(value) {
  return Buffer.from(String(value || '').replace(/\s/g, ''), 'base64').toString('utf8');
}

async function requestGitHub(path, token) {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'alpaca-today-knowledge',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  const data = await response.json();

  if (!response.ok) {
    const statusCode = response.status === 401 || response.status === 403 ? 401 : response.status;
    throw new GitHubContentError(data.message || '读取知识点失败。', statusCode);
  }

  return data;
}

function isSupportedContentFile(entry) {
  return entry?.type === 'file' && SUPPORTED_CONTENT_FILE_PATTERN.test(entry.name || entry.path || '');
}

async function readKnowledgeItemsFromGitHub(token) {
  const encodedPath = encodeURIComponent(KNOWLEDGE_PATH).replace(/%2F/g, '/');
  const directory = await requestGitHub(
    `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}?ref=${encodeURIComponent(REPO_BRANCH)}`,
    token,
  );

  if (!Array.isArray(directory)) {
    throw new GitHubContentError('知识点目录读取失败。', 502);
  }

  const files = directory
    .filter(isSupportedContentFile)
    .sort((left, right) => right.name.localeCompare(left.name, 'zh-CN'));

  return Promise.all(
    files.map(async (file) => {
      const filePath = encodeURIComponent(file.path).replace(/%2F/g, '/');
      const contentFile = await requestGitHub(
        `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${encodeURIComponent(REPO_BRANCH)}`,
        token,
      );
      return buildKnowledgeItem(file.name, decodeBase64Content(contentFile.content));
    }),
  );
}

async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    sendJson(req, res, 405, { message: 'Method not allowed.' });
    return;
  }

  const token = resolveGitHubToken(req);
  if (!token) {
    sendJson(req, res, 401, { message: '缺少 GitHub 授权信息，已回退到静态知识点数据。' });
    return;
  }

  try {
    const items = await readKnowledgeItemsFromGitHub(token);
    sendJson(req, res, 200, {
      generatedAt: new Date().toISOString(),
      timeZone: 'Asia/Shanghai',
      source: 'github-api',
      items,
    });
  } catch (error) {
    const statusCode = error instanceof GitHubContentError ? error.statusCode : 500;
    sendJson(req, res, statusCode, {
      message: error instanceof Error ? error.message : '读取知识点失败。',
    });
  }
}

module.exports = handler;
module.exports._private = {
  decodeBase64Content,
  readBearerToken,
  readKnowledgeItemsFromGitHub,
  resolveGitHubToken,
};
