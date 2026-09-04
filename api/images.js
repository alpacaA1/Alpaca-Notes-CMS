const GITHUB_API_BASE = 'https://api.github.com';
const REPO_OWNER = 'alpacaA1';
const REPO_NAME = 'Alpaca-Notes-Content';
const REPO_BRANCH = 'main';

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function getMimeType(filePath) {
  const ext = String(filePath || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  return (ext && MIME_TYPES[ext]) || 'application/octet-stream';
}

function setCorsHeaders(req, res) {
  const origin = typeof req.headers.origin === 'string' && req.headers.origin ? req.headers.origin : '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Vary', 'Origin');
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

function resolveGitHubToken(req, requestUrl) {
  return (
    readBearerToken(req.headers.authorization) ||
    requestUrl?.searchParams?.get('token')?.trim() ||
    getServerToken()
  );
}

function normalizeRepoPath(rawPath) {
  let cleaned = String(rawPath || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/Alpaca-Notes-CMS\//i, '')
    .replace(/^\/?(source\/)?/i, '')
    .replace(/^\/+/g, '');

  cleaned = cleaned.replace(/\.\./g, '');

  if (!cleaned.startsWith('images/')) {
    cleaned = `images/${cleaned}`;
  }

  return `source/${cleaned}`;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(req, res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    setCorsHeaders(req, res);
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Method not allowed.' }));
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  const requestUrl = new URL(req.url, `${protocol}://${host}`);
  const rawPath = requestUrl.searchParams.get('path') || '';

  if (!rawPath) {
    setCorsHeaders(req, res);
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: '缺少 path 参数。' }));
    return;
  }

  const repoPath = normalizeRepoPath(rawPath);
  const mimeType = getMimeType(repoPath);
  const token = resolveGitHubToken(req, requestUrl);

  try {
    const headers = {
      'User-Agent': 'alpaca-image-proxy',
      'X-GitHub-Api-Version': '2022-11-28',
      'Accept': 'application/vnd.github.raw',
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const githubUrl = `${GITHUB_API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${repoPath}?ref=${REPO_BRANCH}`;
    const response = await fetch(githubUrl, { headers });

    if (!response.ok) {
      setCorsHeaders(req, res);
      res.statusCode = response.status === 404 ? 404 : 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message: `获取图片失败 (${response.status})` }));
      return;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    setCorsHeaders(req, res);
    res.statusCode = 200;
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');
    res.setHeader('Content-Length', String(buffer.length));

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    res.end(buffer);
  } catch (error) {
    setCorsHeaders(req, res);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: error instanceof Error ? error.message : '服务器内部错误。' }));
  }
};
