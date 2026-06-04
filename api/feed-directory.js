const { assertAllowedOwner, fetchGitHubUser } = require('./_lib/github-oauth');
const { FeedDirectoryError, fetchFeedDirectory } = require('./_lib/feed-directory');

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

    const result = await fetchFeedDirectory();
    sendJson(req, res, 200, result);
  } catch (error) {
    if (error instanceof FeedDirectoryError) {
      sendJson(req, res, error.statusCode, { message: error.message, code: error.code });
      return;
    }

    if (error instanceof Error && /Failed to fetch GitHub user profile|GitHub access token/i.test(error.message)) {
      sendJson(req, res, 401, { message: 'GitHub 会话已过期，请重新登录。' });
      return;
    }

    sendJson(req, res, 500, { message: error instanceof Error ? error.message : '加载共享 RSS 源目录失败。' });
  }
};
