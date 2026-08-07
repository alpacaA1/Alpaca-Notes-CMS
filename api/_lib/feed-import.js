const net = require('node:net');
const dns = require('node:dns').promises;
const { JSDOM } = require('jsdom');

const FETCH_TIMEOUT_MS = 12000;
const MAX_FEED_LENGTH = 1_500_000;
const MAX_REDIRECTS = 5;
const MAX_ITEMS = 20;
const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const PRIVATE_IPV4_PATTERNS = [/^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^0\./];
const FEED_REQUEST_HEADERS = {
  Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, text/plain;q=0.8, text/html;q=0.6',
  'User-Agent': 'alpaca-notes-feed-importer/1.0',
};
const FEED_PATH_SUFFIXES = [
  '/feed/atom',
  '/rss.xml',
  '/feed.xml',
  '/atom.xml',
  '/index.xml',
  '/rss',
  '/feed',
];
let dnsLookup = dns.lookup.bind(dns);

class FeedImportError extends Error {
  constructor(message, statusCode = 400, code = 'feed_import_error') {
    super(message);
    this.name = 'FeedImportError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function isPrivateIPv4(hostname) {
  if (PRIVATE_IPV4_PATTERNS.some((pattern) => pattern.test(hostname))) {
    return true;
  }

  const secondOctet = Number(hostname.split('.')[1]);
  return /^172\./.test(hostname) && secondOctet >= 16 && secondOctet <= 31;
}

function isPrivateIPAddress(hostname) {
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    return isPrivateIPv4(hostname);
  }

  if (ipVersion === 6) {
    const normalized = hostname.toLowerCase();
    return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  }

  return false;
}

function normalizeHostname(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function validateFeedUrl(input, message = 'RSS 链接格式无效。') {
  let url;

  try {
    url = new URL(String(input || '').trim());
  } catch {
    throw new FeedImportError(message, 400, 'invalid_url');
  }

  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
    throw new FeedImportError('RSS 链接需以 http:// 或 https:// 开头。', 400, 'invalid_url');
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || isPrivateIPAddress(hostname)) {
    throw new FeedImportError('暂不支持导入该地址。', 400, 'unsupported_address');
  }

  return url;
}

async function assertPublicResolvedAddress(url) {
  const hostname = normalizeHostname(url.hostname);

  if (net.isIP(hostname)) {
    return;
  }

  let addresses;
  try {
    addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new FeedImportError('暂时无法解析该地址，请稍后重试。', 502, 'resolve_failed');
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new FeedImportError('暂时无法解析该地址，请稍后重试。', 502, 'resolve_failed');
  }

  if (addresses.some((entry) => isPrivateIPAddress(normalizeHostname(entry?.address)))) {
    throw new FeedImportError('暂不支持导入该地址。', 400, 'unsupported_address');
  }
}

function isRedirectResponse(response) {
  return REDIRECT_STATUS_CODES.has(response.status);
}

async function fetchFeedResponse(initialUrl, signal) {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicResolvedAddress(currentUrl);

    const response = await fetch(currentUrl.toString(), {
      redirect: 'manual',
      signal,
      headers: FEED_REQUEST_HEADERS,
    });

    if (!isRedirectResponse(response)) {
      return { response, finalUrl: currentUrl };
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new FeedImportError('RSS 跳转次数过多，暂不支持导入。', 508, 'too_many_redirects');
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new FeedImportError('RSS 跳转后的链接无效。', 502, 'invalid_redirect');
    }

    currentUrl = validateFeedUrl(new URL(location, currentUrl).toString(), 'RSS 跳转后的链接无效。');
  }

  throw new FeedImportError('RSS 导入失败。', 500, 'feed_import_failed');
}

async function readBodyWithLimit(response) {
  const body = await response.text();
  if (body.length > MAX_FEED_LENGTH) {
    throw new FeedImportError('RSS 内容过大，暂不支持导入。', 413, 'feed_too_large');
  }
  return body;
}

function getTextContent(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getNodeText(node) {
  return getTextContent(node?.textContent || '');
}

function findDescendantsByLocalName(node, localName) {
  if (!node) {
    return [];
  }

  return Array.from(node.getElementsByTagName('*')).filter((child) => child.localName?.toLowerCase() === localName);
}

function findFirstDescendantText(node, names) {
  for (const name of names) {
    const match = findDescendantsByLocalName(node, name)[0];
    const value = getNodeText(match);
    if (value) {
      return value;
    }
  }

  return '';
}

function stripMarkup(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  if (!/[<&]/.test(text)) {
    return getTextContent(text);
  }

  const dom = new JSDOM(`<body>${text}</body>`);
  return getTextContent(dom.window.document.body.textContent || '');
}

function normalizeSummary(value) {
  return stripMarkup(value).slice(0, 320);
}

function normalizeDate(value) {
  const text = getTextContent(value);
  if (!text) {
    return '';
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function readAtomLink(entry, baseUrl) {
  const links = findDescendantsByLocalName(entry, 'link');
  for (const link of links) {
    const rel = getTextContent(link.getAttribute('rel') || '').toLowerCase();
    const href = getTextContent(link.getAttribute('href') || '');
    if (!href) {
      continue;
    }

    if (!rel || rel === 'alternate') {
      try {
        return new URL(href, baseUrl).toString();
      } catch {
        continue;
      }
    }
  }

  const fallback = getNodeText(links[0]);
  if (!fallback) {
    return '';
  }

  try {
    return new URL(fallback, baseUrl).toString();
  } catch {
    return '';
  }
}

function readRssLink(entry, baseUrl) {
  const linkText = findFirstDescendantText(entry, ['link']);
  if (!linkText) {
    return '';
  }

  try {
    return new URL(linkText, baseUrl).toString();
  } catch {
    return '';
  }
}

function parseFeedEntries(root, baseUrl, feedTitle) {
  const rootName = root.localName?.toLowerCase();
  const rawEntries = rootName === 'feed'
    ? findDescendantsByLocalName(root, 'entry')
    : findDescendantsByLocalName(root, 'item');
  const seenUrls = new Set();
  const items = [];

  for (const entry of rawEntries) {
    const title = findFirstDescendantText(entry, ['title']).slice(0, 200) || '未命名条目';
    const url = rootName === 'feed' ? readAtomLink(entry, baseUrl) : readRssLink(entry, baseUrl);
    if (!url || seenUrls.has(url)) {
      continue;
    }

    seenUrls.add(url);
    const summarySource = rootName === 'feed'
      ? findFirstDescendantText(entry, ['summary', 'content', 'subtitle'])
      : findFirstDescendantText(entry, ['description', 'encoded', 'content', 'summary']);

    items.push({
      id: findFirstDescendantText(entry, ['guid', 'id']).slice(0, 200) || url,
      title,
      url,
      summary: normalizeSummary(summarySource),
      publishedAt: normalizeDate(findFirstDescendantText(entry, ['pubdate', 'published', 'updated', 'date'])),
      sourceName: feedTitle || '',
    });

    if (items.length >= MAX_ITEMS) {
      break;
    }
  }

  return items;
}

function parseFeedDocument(xml, baseUrl) {
  let document;
  try {
    const dom = new JSDOM(xml, {
      contentType: 'text/xml',
      url: baseUrl,
    });
    document = dom.window.document;
  } catch {
    throw new FeedImportError('该链接不是有效的 RSS/Atom feed。', 400, 'not_feed');
  }

  const root = document.documentElement;
  const rootName = root?.localName?.toLowerCase();

  if (!root || rootName === 'parsererror' || !['rss', 'feed', 'rdf'].includes(rootName)) {
    throw new FeedImportError('该链接不是有效的 RSS/Atom feed。', 400, 'not_feed');
  }

  const feedTitle = findFirstDescendantText(root, ['title']).slice(0, 200);
  const description = rootName === 'feed'
    ? normalizeSummary(findFirstDescendantText(root, ['subtitle', 'tagline']))
    : normalizeSummary(findFirstDescendantText(root, ['description']));
  const items = parseFeedEntries(root, baseUrl, feedTitle);

  if (items.length === 0) {
    throw new FeedImportError('这个 feed 里暂时没有可导入的条目。', 404, 'feed_empty');
  }

  return {
    title: feedTitle || '未命名 RSS',
    description,
    items,
  };
}

function isLikelyFeedUrl(value) {
  const normalized = String(value || '').toLowerCase();
  return /(^|\/)(rss|atom|feed)(\/|\.xml|$)/.test(normalized) || normalized.endsWith('/index.xml');
}

function getFeedDiscoveryPageUrls(url) {
  const candidates = [];
  const normalizedPath = url.pathname.replace(/\/+$/, '') || '/';
  const matchedSuffix = FEED_PATH_SUFFIXES.find((suffix) => normalizedPath.toLowerCase().endsWith(suffix));

  if (matchedSuffix) {
    const pageUrl = new URL(url.toString());
    const nextPath = normalizedPath.slice(0, -matchedSuffix.length) || '/';
    pageUrl.pathname = nextPath.endsWith('/') ? nextPath : `${nextPath}/`;
    pageUrl.search = '';
    pageUrl.hash = '';
    candidates.push(pageUrl);
  }

  const originalPageUrl = new URL(url.toString());
  originalPageUrl.hash = '';
  if (!candidates.some((candidate) => candidate.toString() === originalPageUrl.toString())) {
    candidates.push(originalPageUrl);
  }

  return candidates;
}

function hasPathFileExtension(pathname) {
  return /\/[^/]+\.[a-z0-9]{1,12}$/i.test(String(pathname || ''));
}

function getConventionalFeedUrls(pageUrl) {
  if (hasPathFileExtension(pageUrl.pathname)) {
    return [];
  }

  const basePath = pageUrl.pathname.replace(/\/+$/, '');
  const candidates = [];

  for (const suffix of FEED_PATH_SUFFIXES) {
    const candidate = new URL(pageUrl.toString());
    candidate.pathname = `${basePath}${suffix}`;
    candidate.search = '';
    candidate.hash = '';

    if (candidate.toString() !== pageUrl.toString() && !candidates.some((item) => item.toString() === candidate.toString())) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function discoverFeedUrlFromHtml(html, pageUrl) {
  let document;
  try {
    const dom = new JSDOM(html, {
      contentType: 'text/html',
      url: pageUrl,
    });
    document = dom.window.document;
  } catch {
    return null;
  }

  const candidates = [
    ...Array.from(document.querySelectorAll('link[rel~="alternate"]')),
    ...Array.from(document.querySelectorAll('a[href]')),
  ];

  for (const element of candidates) {
    const href = getTextContent(element.getAttribute('href') || '');
    if (!href) {
      continue;
    }

    const type = getTextContent(element.getAttribute('type') || '').toLowerCase();
    const title = getTextContent(element.getAttribute('title') || '').toLowerCase();
    const rel = getTextContent(element.getAttribute('rel') || '').toLowerCase();
    const className = getTextContent(element.getAttribute('class') || '').toLowerCase();
    const text = getNodeText(element).toLowerCase();

    const looksLikeFeed =
      /application\/(rss|atom)\+xml|application\/xml|text\/xml/.test(type)
      || isLikelyFeedUrl(href)
      || /\b(rss|atom|feed)\b/.test(`${title} ${rel} ${className} ${text}`);

    if (!looksLikeFeed) {
      continue;
    }

    try {
      return validateFeedUrl(new URL(href, pageUrl).toString(), 'RSS 自动发现到的链接无效。');
    } catch {
      continue;
    }
  }

  return null;
}

async function discoverFeedUrlFromPage(pageUrl, signal) {
  const { response, finalUrl } = await fetchFeedResponse(pageUrl, signal);
  if (!response.ok) {
    return null;
  }

  const body = await readBodyWithLimit(response);
  return discoverFeedUrlFromHtml(body, finalUrl.toString());
}

async function discoverAlternateFeedUrl(url, signal, body = '') {
  const directMatch = body ? discoverFeedUrlFromHtml(body, url.toString()) : null;
  if (directMatch) {
    return directMatch;
  }

  for (const pageUrl of getFeedDiscoveryPageUrls(url)) {
    if (pageUrl.toString() === url.toString() && body) {
      continue;
    }

    const discoveredUrl = await discoverFeedUrlFromPage(pageUrl, signal);
    if (discoveredUrl) {
      return discoveredUrl;
    }
  }

  return null;
}

async function fetchConventionalFeed(pageUrl, signal) {
  for (const candidateUrl of getConventionalFeedUrls(pageUrl)) {
    try {
      return await fetchAndParseFeed(candidateUrl, signal);
    } catch (error) {
      if (error instanceof FeedImportError) {
        continue;
      }

      throw error;
    }
  }

  return null;
}

async function fetchAndParseFeed(url, signal) {
  const { response, finalUrl } = await fetchFeedResponse(url, signal);
  if (!response.ok) {
    throw new FeedImportError(
      `RSS 抓取失败（HTTP ${response.status}）。`,
      response.status >= 400 && response.status < 600 ? response.status : 502,
      'feed_fetch_failed',
    );
  }

  const body = await readBodyWithLimit(response);
  const parsed = parseFeedDocument(body, finalUrl.toString());
  return {
    parsed,
    response,
    finalUrl,
    body,
  };
}
const TWITTER_PROFILE_HOSTNAME_PATTERN = /^(?:mobile\.)?(?:twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)$/i;
const RESERVED_TWITTER_PATHS = new Set(['status', 'statuses', 'i', 'settings', 'search', 'home', 'explore', 'notifications', 'messages', 'tos', 'privacy']);

function isTwitterProfileUrl(url) {
  if (!TWITTER_PROFILE_HOSTNAME_PATTERN.test(url.hostname)) {
    return false;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 1 && !RESERVED_TWITTER_PATHS.has(parts[0].toLowerCase())) {
    return true;
  }

  return false;
}

function readTwitterProfileUsername(url) {
  return url.pathname.split('/').filter(Boolean)[0] || '';
}

async function fetchTwitterUserTimelineWithToken(username, authToken, ct0, signal) {
  const bearerToken = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnwIzUaaNOGyLxoUsy8vh2hdxsi4%3D5O1pTemporalWebKey';
  const headers = {
    Authorization: bearerToken,
    Cookie: `auth_token=${authToken}; ct0=${ct0}`,
    'x-csrf-token': ct0,
    'x-twitter-active-user': 'yes',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };

  const apiUrl = `https://api.twitter.com/1.1/statuses/user_timeline.json?screen_name=${encodeURIComponent(username)}&count=20&tweet_mode=extended&include_rts=1`;
  const response = await fetch(apiUrl, { headers, signal });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  if (!Array.isArray(payload) || payload.length === 0) {
    return null;
  }

  const items = payload.map((tweet) => {
    const tweetId = tweet.id_str || tweet.id;
    const text = tweet.full_text || tweet.text || '';
    const authorName = tweet.user?.name || username;
    const screenName = tweet.user?.screen_name || username;
    const itemUrl = `https://x.com/${screenName}/status/${tweetId}`;
    const pubDate = tweet.created_at ? new Date(tweet.created_at).toISOString() : new Date().toISOString();

    let mediaMd = '';
    const photos = tweet.entities?.media || tweet.extended_entities?.media || [];
    if (Array.isArray(photos) && photos.length > 0) {
      mediaMd = '\n\n' + photos.map((p, i) => `![Media ${i + 1}](${p.media_url_https || p.media_url})`).join('\n\n');
    }

    return {
      id: tweetId,
      title: `${authorName}: "${text.slice(0, 80).replace(/[\r\n]+/g, ' ')}"`,
      url: itemUrl,
      summary: (text + mediaMd).slice(0, 320),
      publishedAt: pubDate,
      sourceName: `${authorName} (@${screenName})`,
    };
  });

  const firstUser = payload[0]?.user;
  const displayName = firstUser?.name ? `${firstUser.name} (@${firstUser.screen_name})` : `@${username}`;

  return {
    title: `${displayName} on X`,
    description: firstUser?.description || `@${username} 的 X 动态`,
    items,
  };
}

async function importTwitterProfileFeed(url, signal) {
  const username = readTwitterProfileUsername(url);
  if (!username) {
    throw new FeedImportError('未识别到有效的 X 用户名。', 400, 'invalid_twitter_user');
  }

  const authToken = process.env.TWITTER_AUTH_TOKEN?.trim() || '';
  const ct0 = process.env.TWITTER_CT0?.trim() || '1234567890abcdef1234567890abcdef';

  if (authToken) {
    try {
      const feedResult = await fetchTwitterUserTimelineWithToken(username, authToken, ct0, signal);
      if (feedResult?.items?.length) {
        return {
          title: feedResult.title || `@${username} on X`,
          description: feedResult.description || `@${username} 的 X 动态`,
          requestedUrl: url.toString(),
          finalUrl: url.toString(),
          items: feedResult.items,
        };
      }
    } catch (error) {
      if (error instanceof FeedImportError) {
        throw error;
      }
    }
  }

  const customRsshubBase = process.env.RSSHUB_BASE_URL?.trim();
  const candidateFeedUrls = [
    ...(customRsshubBase ? [`${customRsshubBase.replace(/\/$/, '')}/twitter/user/${encodeURIComponent(username)}`] : []),
    `https://nitter.net/${encodeURIComponent(username)}/rss`,
    `https://rsshub.app/twitter/user/${encodeURIComponent(username)}`,
    `https://nitter.privacydev.net/${encodeURIComponent(username)}/rss`,
    `https://nitter.poast.org/${encodeURIComponent(username)}/rss`,
  ];

  for (const candidateUrlStr of candidateFeedUrls) {
    try {
      const candidateUrl = validateFeedUrl(candidateUrlStr);
      const result = await fetchAndParseFeed(candidateUrl, signal);
      if (result?.parsed?.items?.length) {
        return {
          title: result.parsed.title || `@${username} on X`,
          description: result.parsed.description || `@${username} 的 X 动态`,
          requestedUrl: url.toString(),
          finalUrl: candidateUrlStr,
          items: result.parsed.items,
        };
      }
    } catch {
      continue;
    }
  }

  // Check if the account is protected / private on X
  try {
    const fxResp = await fetch(`https://api.fxtwitter.com/${encodeURIComponent(username)}`, {
      signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'alpaca-notes-feed-importer/1.0',
      },
    });
    if (fxResp.ok) {
      const fxData = await fxResp.json();
      if (fxData?.user?.protected) {
        throw new FeedImportError(
          `用户 @${username} 的 X 账号设置了私密保护（锁推），公开 API / RSS 无法获取其内容。`,
          403,
          'twitter_account_protected'
        );
      }
    }
  } catch (error) {
    if (error instanceof FeedImportError) {
      throw error;
    }
  }

  throw new FeedImportError(
    `暂无法抓取 @${username} 的 RSS 动态。推荐在 Vercel 环境变量中配置 TWITTER_AUTH_TOKEN。`,
    502,
    'twitter_feed_failed'
  );
}

async function importFeed(feedUrl) {
  const url = validateFeedUrl(feedUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    if (isTwitterProfileUrl(url)) {
      return await importTwitterProfileFeed(url, controller.signal);
    }

    const { response, finalUrl } = await fetchFeedResponse(url, controller.signal);
    if (!response.ok) {
      const discoveredUrl = await discoverAlternateFeedUrl(url, controller.signal);
      if (discoveredUrl) {
        const retryResult = await fetchAndParseFeed(discoveredUrl, controller.signal);
        return {
          title: retryResult.parsed.title,
          description: retryResult.parsed.description,
          requestedUrl: url.toString(),
          finalUrl: retryResult.finalUrl.toString(),
          items: retryResult.parsed.items,
        };
      }

      throw new FeedImportError(
        `RSS 抓取失败（HTTP ${response.status}）。`,
        response.status >= 400 && response.status < 600 ? response.status : 502,
        'feed_fetch_failed',
      );
    }

    const body = await readBodyWithLimit(response);
    let parsed;
    try {
      parsed = parseFeedDocument(body, finalUrl.toString());
    } catch (error) {
      if (!(error instanceof FeedImportError) || error.code !== 'not_feed') {
        throw error;
      }

      const discoveredUrl = await discoverAlternateFeedUrl(finalUrl, controller.signal, body);
      if (discoveredUrl) {
        const retryResult = await fetchAndParseFeed(discoveredUrl, controller.signal);
        return {
          title: retryResult.parsed.title,
          description: retryResult.parsed.description,
          requestedUrl: url.toString(),
          finalUrl: retryResult.finalUrl.toString(),
          items: retryResult.parsed.items,
        };
      }

      const retryResult = await fetchConventionalFeed(finalUrl, controller.signal);
      if (!retryResult) {
        throw error;
      }

      return {
        title: retryResult.parsed.title,
        description: retryResult.parsed.description,
        requestedUrl: url.toString(),
        finalUrl: retryResult.finalUrl.toString(),
        items: retryResult.parsed.items,
      };
    }

    return {
      title: parsed.title,
      description: parsed.description,
      requestedUrl: url.toString(),
      finalUrl: finalUrl.toString(),
      items: parsed.items,
    };
  } catch (error) {
    if (error instanceof FeedImportError) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      throw new FeedImportError('RSS 抓取超时，请稍后重试。', 504, 'timeout');
    }

    const cause = error?.cause || error;
    const code = cause?.code || error?.code;
    let message = error instanceof Error ? error.message : 'RSS 导入失败。';

    if (code === 'ENOTFOUND') {
      message = '无法解析域名（ENOTFOUND），目标服务器可能已下线或不存在。';
    } else if (code === 'ECONNREFUSED') {
      message = '目标服务器拒绝连接（ECONNREFUSED）。';
    } else if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
      message = '连接目标服务器超时（ETIMEDOUT）。';
    } else if (code === 'ECONNRESET') {
      message = '与目标服务器的连接被重置（ECONNRESET）。';
    } else if (message === 'fetch failed' || message.includes('fetch failed')) {
      message = '网络请求失败，无法连接到目标 RSS 服务器。';
    }

    throw new FeedImportError(message, 500, 'feed_import_failed');
  } finally {
    clearTimeout(timeoutId);
  }
}

function setDnsLookupForTesting(nextLookup) {
  dnsLookup = nextLookup;
}

function resetDnsLookupForTesting() {
  dnsLookup = dns.lookup.bind(dns);
}

module.exports = {
  FeedImportError,
  importFeed,
  resetDnsLookupForTesting,
  setDnsLookupForTesting,
};
