const WEREAD_GATEWAY_URL = 'https://i.weread.qq.com/api/agent/gateway';

function setCorsHeaders(req, res) {
  const origin = typeof req.headers.origin === 'string' && req.headers.origin ? req.headers.origin : '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Weread-Api-Key');
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

  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
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

  const apiKey =
    readBearerToken(req.headers.authorization) ||
    String(req.headers['x-weread-api-key'] || '').trim();

  if (!apiKey || !apiKey.startsWith('wrk-')) {
    sendJson(req, res, 400, { message: '请提供有效的微信读书 API Key (以 wrk- 开头)。' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const response = await fetch(WEREAD_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    sendJson(req, res, response.status, data);
  } catch (error) {
    sendJson(req, res, 502, {
      message: error instanceof Error ? error.message : '请求微信读书网关失败。',
    });
  }
};
