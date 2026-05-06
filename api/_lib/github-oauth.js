const crypto = require('node:crypto');

const STATE_COOKIE = 'alpaca_admin_oauth_state';
const DEFAULT_SCOPE = 'repo';
const COOKIE_MAX_AGE_SECONDS = 10 * 60;
const PRIVATE_REPO_SCOPE_ERROR =
  '当前 GitHub 授权未授予私有内容仓库所需的 repo 权限。请先在 GitHub Settings > Applications > Authorized OAuth Apps 中撤销当前应用授权，再重新登录。';

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name, fallback) {
  return process.env[name] || fallback;
}

function parseScopes(rawScope) {
  return String(rawScope || '')
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveScope(rawScope) {
  const scopes = parseScopes(rawScope);

  if (scopes.includes('repo')) {
    return Array.from(new Set(scopes)).join(' ');
  }

  const upgradedScopes = scopes.map((item) => (item === 'public_repo' ? 'repo' : item));
  return Array.from(new Set(upgradedScopes.length > 0 ? upgradedScopes : [DEFAULT_SCOPE])).join(' ');
}

function hasRepoScope(rawScope) {
  return parseScopes(rawScope).includes('repo');
}

function assertPrivateRepoScope(rawScope) {
  if (!hasRepoScope(rawScope)) {
    throw new Error(PRIVATE_REPO_SCOPE_ERROR);
  }
}

function getRequestBaseUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const protocol = forwardedProto || (host && host.includes('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

function getCallbackUrl(req) {
  return `${getRequestBaseUrl(req)}/api/callback`;
}

function buildAuthorizeUrl(req) {
  const clientId = getEnv('GITHUB_CLIENT_ID');
  const scope = resolveScope(getOptionalEnv('GITHUB_OAUTH_SCOPE', DEFAULT_SCOPE));
  const state = crypto.randomBytes(24).toString('hex');
  const callbackUrl = getCallbackUrl(req);

  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callbackUrl);
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);
  url.searchParams.set('allow_signup', 'false');

  return { state, url: url.toString() };
}

function makeStateCookie(req, state) {
  const secure = !getRequestBaseUrl(req).startsWith('http://');
  return [
    `${STATE_COOKIE}=${encodeURIComponent(state)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function clearStateCookie(req) {
  const secure = !getRequestBaseUrl(req).startsWith('http://');
  return [
    `${STATE_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

function readCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader.split(';').reduce((acc, item) => {
    const [rawKey, ...rawValue] = item.trim().split('=');
    if (!rawKey) {
      return acc;
    }
    acc[rawKey] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

function getQueryParam(req, name) {
  if (req.query && typeof req.query[name] !== 'undefined') {
    return Array.isArray(req.query[name]) ? req.query[name][0] : req.query[name];
  }

  const url = new URL(req.url, getRequestBaseUrl(req));
  return url.searchParams.get(name);
}

async function exchangeCodeForToken(req, code) {
  const clientId = getEnv('GITHUB_CLIENT_ID');
  const clientSecret = getEnv('GITHUB_CLIENT_SECRET');
  const callbackUrl = getCallbackUrl(req);

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: callbackUrl,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'GitHub access token exchange failed.');
  }

  return {
    accessToken: data.access_token,
    scope: typeof data.scope === 'string' ? data.scope : '',
  };
}

async function fetchGitHubUser(token) {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'alpaca-notes-decap-oauth',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  const data = await response.json();
  if (!response.ok || !data.login) {
    throw new Error(data.message || 'Failed to fetch GitHub user profile.');
  }

  return data;
}

function assertAllowedOwner(user) {
  const owner = getEnv('GITHUB_OWNER');
  if (user.login !== owner) {
    throw new Error('This GitHub account is not allowed to use the Alpaca Notes editor.');
  }
}

function sendRedirect(res, location, cookie) {
  if (cookie) {
    res.setHeader('Set-Cookie', cookie);
  }
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

function sendText(res, statusCode, message, cookie) {
  if (cookie) {
    res.setHeader('Set-Cookie', cookie);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(message);
}

function sendPopupResult(res, req, status, payload) {
  const message = `authorization:github:${status}:${JSON.stringify(payload)}`;
  const clearCookie = clearStateCookie(req);

  res.statusCode = 200;
  res.setHeader('Set-Cookie', clearCookie);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Decap OAuth</title>
  </head>
  <body>
    <p>Finishing GitHub authorization…</p>
    <script>
      (function () {
        const message = ${JSON.stringify(message)};
        let finished = false;

        function complete(targetOrigin) {
          if (finished) {
            return;
          }
          finished = true;
          if (window.opener) {
            window.opener.postMessage(message, targetOrigin || '*');
          }
          window.close();
        }

        function receiveMessage(event) {
          window.removeEventListener('message', receiveMessage, false);
          complete(event.origin || '*');
        }

        if (!window.opener) {
          return;
        }

        window.addEventListener('message', receiveMessage, false);
        window.opener.postMessage('authorizing:github', '*');
        window.setTimeout(function () {
          complete('*');
        }, 2000);
      })();
    </script>
  </body>
</html>`);
}

module.exports = {
  assertPrivateRepoScope,
  assertAllowedOwner,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGitHubUser,
  getQueryParam,
  hasRepoScope,
  readCookies,
  sendPopupResult,
  sendRedirect,
  sendText,
  clearStateCookie,
  makeStateCookie,
  PRIVATE_REPO_SCOPE_ERROR,
  resolveScope,
};
