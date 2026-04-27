const { assertAllowedOwner, fetchGitHubUser } = require('./_lib/github-oauth');
const { ArticleImportError, importArticle } = require('./_lib/article-import');

function setCorsHeaders(req, res) {
  const origin = typeof req.headers.origin === 'string' && req.headers.origin ? req.headers.origin : '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

function getRequestUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return new URL(req.url, `${protocol}://${host}`);
}

module.exports = async function handler(req, res) {
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

    const requestedUrl = getRequestUrl(req).searchParams.get('url') || '';
    if (!requestedUrl.trim()) {
      throw new ArticleImportError('请先填写原文链接。', 400);
    }

    const result = await importArticle(requestedUrl);
    sendJson(req, res, 200, result);
  } catch (error) {
    if (error instanceof ArticleImportError) {
      sendJson(req, res, error.statusCode, { message: error.message });
      return;
    }

    if (error instanceof Error && /Failed to fetch GitHub user profile|GitHub access token/i.test(error.message)) {
      sendJson(req, res, 401, { message: 'GitHub 会话已过期，请重新登录。' });
      return;
    }

    sendJson(req, res, 500, { message: error instanceof Error ? error.message : '导入正文失败。' });
  }
};
