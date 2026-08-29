const { assertAllowedOwner, fetchGitHubUser } = require('./_lib/github-oauth');

const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

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

function readBearerToken(value) {
  return String(value || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '';
}

function getRequestUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const protocol = req.headers['x-forwarded-proto'] || 'https';
  return new URL(req.url, `${protocol}://${host}`);
}

async function tmdbFetch(path, token) {
  const response = await fetch(`${TMDB_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(response.status === 401 ? 'TMDB 服务密钥无效或未配置。' : `TMDB 请求失败（${response.status}）。`);
  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { setCorsHeaders(req, res); res.statusCode = 204; res.end(); return; }
  if (req.method !== 'GET') { sendJson(req, res, 405, { message: 'Method not allowed.' }); return; }

  const githubToken = readBearerToken(req.headers.authorization);
  const tmdbToken = String(process.env.TMDB_ACCESS_TOKEN || '').trim();
  if (!githubToken) { sendJson(req, res, 401, { message: '请重新登录后再使用 TMDB 自动补全。' }); return; }
  if (!tmdbToken) { sendJson(req, res, 503, { message: '尚未配置 TMDB_ACCESS_TOKEN，请在 Vercel 环境变量中添加 TMDB API Read Access Token。' }); return; }

  try {
    assertAllowedOwner(await fetchGitHubUser(githubToken));
    const query = getRequestUrl(req).searchParams.get('query')?.trim() || '';
    if (!query) { sendJson(req, res, 400, { message: '请输入片名后再搜索。' }); return; }
    const search = await tmdbFetch(`/search/movie?${new URLSearchParams({ query, language: 'zh-CN', include_adult: 'false' })}`, tmdbToken);
    const candidates = Array.isArray(search.results) ? search.results.slice(0, 6) : [];
    const results = await Promise.all(candidates.map(async (movie) => {
      const details = await tmdbFetch(`/movie/${movie.id}?${new URLSearchParams({ language: 'zh-CN', append_to_response: 'credits' })}`, tmdbToken);
      const crew = Array.isArray(details.credits?.crew) ? details.credits.crew : [];
      return {
        id: movie.id,
        title: details.title || movie.title || '',
        originalTitle: details.original_title || movie.original_title || '',
        year: String(details.release_date || movie.release_date || '').slice(0, 4),
        director: crew.filter((person) => person.job === 'Director').map((person) => person.name).join('、'),
        coverUrl: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : '',
        genres: Array.isArray(details.genres) ? details.genres.map((genre) => genre.name).filter(Boolean) : [],
      };
    }));
    sendJson(req, res, 200, { results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'TMDB 自动补全失败。';
    const status = /GitHub user profile|GitHub access token/i.test(message) ? 401 : 502;
    sendJson(req, res, status, { message });
  }
};
