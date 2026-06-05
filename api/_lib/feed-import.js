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

async function importFeed(feedUrl) {
  const url = validateFeedUrl(feedUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
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

    throw new FeedImportError(error instanceof Error ? error.message : 'RSS 导入失败。', 500, 'feed_import_failed');
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
