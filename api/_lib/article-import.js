const net = require('node:net');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

const FETCH_TIMEOUT_MS = 12000;
const MAX_HTML_LENGTH = 2_000_000;
const WECHAT_MAX_HTML_LENGTH = 12_000_000;
const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);
const HTML_CONTENT_TYPE_PATTERN = /^(text\/html|application\/xhtml\+xml)\b/i;
const PRIVATE_IPV4_PATTERNS = [/^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^0\./];
const DEFAULT_ARTICLE_REQUEST_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent': 'alpaca-notes-importer/1.0',
};
const WECHAT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

class ArticleImportError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'ArticleImportError';
    this.statusCode = statusCode;
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

function isWeChatArticleUrl(url) {
  return url.hostname.toLowerCase() === 'mp.weixin.qq.com';
}

function buildArticleRequestHeaders(url) {
  if (!isWeChatArticleUrl(url)) {
    return DEFAULT_ARTICLE_REQUEST_HEADERS;
  }

  return {
    Accept: 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: 'https://mp.weixin.qq.com/',
    'User-Agent': WECHAT_BROWSER_USER_AGENT,
  };
}

function validateArticleUrl(input, message = '文章链接格式无效。') {
  let url;

  try {
    url = new URL(String(input || '').trim());
  } catch {
    throw new ArticleImportError(message, 400);
  }

  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
    throw new ArticleImportError('文章链接需以 http:// 或 https:// 开头。', 400);
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || isPrivateIPAddress(hostname)) {
    throw new ArticleImportError('暂不支持导入该地址。', 400);
  }

  return url;
}

function getMaxHtmlLength(url) {
  return isWeChatArticleUrl(url) ? WECHAT_MAX_HTML_LENGTH : MAX_HTML_LENGTH;
}

function readBodyWithLimit(response, maxHtmlLength) {
  return response.text().then((html) => {
    if (html.length > maxHtmlLength) {
      throw new ArticleImportError('文章内容过大，暂不支持导入。', 413);
    }
    return html;
  });
}

function readMetaContent(document, selector) {
  const element = document.querySelector(selector);
  const content = element?.getAttribute('content')?.trim();
  return content || '';
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function absolutizeAttribute(element, name, baseUrl) {
  const value = element.getAttribute(name);
  if (!value) {
    return;
  }

  try {
    const resolved = new URL(value, baseUrl).toString();
    const protocol = new URL(resolved).protocol;
    if (SUPPORTED_PROTOCOLS.has(protocol)) {
      element.setAttribute(name, resolved);
      return;
    }
  } catch {
    // Ignore invalid URLs and drop unsafe attributes below.
  }

  element.removeAttribute(name);
}

function applyLazyImageSources(document) {
  document.querySelectorAll('img').forEach((element) => {
    const lazySource =
      element.getAttribute('data-src') ||
      element.getAttribute('data-original') ||
      element.getAttribute('data-actualsrc');
    const currentSource = element.getAttribute('src');

    if (lazySource && (!currentSource || currentSource.startsWith('data:'))) {
      element.setAttribute('src', lazySource);
    }
  });
}

function prepareArticleHtml(content, baseUrl) {
  const dom = new JSDOM(`<body>${content}</body>`, { url: baseUrl });
  const { document } = dom.window;

  document.querySelectorAll('script, style, iframe, form, noscript').forEach((node) => node.remove());
  applyLazyImageSources(document);
  document.querySelectorAll('[src]').forEach((element) => absolutizeAttribute(element, 'src', baseUrl));
  document.querySelectorAll('[href]').forEach((element) => absolutizeAttribute(element, 'href', baseUrl));

  return { dom, html: document.body.innerHTML };
}

function createTurndownService() {
  const service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  service.use(gfm);
  return service;
}

function normalizeMarkdown(markdown) {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function convertArticleHtmlToMarkdown(content, baseUrl) {
  const { dom, html } = prepareArticleHtml(content, baseUrl);

  try {
    return normalizeMarkdown(createTurndownService().turndown(html));
  } finally {
    dom.window.close();
  }
}

function extractWeChatArticle(document, finalUrl) {
  const content = document.querySelector('#js_content');
  const articleHtml = content?.innerHTML?.trim();
  if (!articleHtml) {
    return null;
  }

  const markdown = convertArticleHtmlToMarkdown(articleHtml, finalUrl);
  if (!markdown) {
    return null;
  }

  return {
    title: normalizeText(
      document.querySelector('#activity-name')?.textContent ||
        readMetaContent(document, 'meta[property="og:title"]') ||
        document.title ||
        ''
    ),
    desc: normalizeText(
      readMetaContent(document, 'meta[property="og:description"]') ||
        readMetaContent(document, 'meta[name="description"]')
    ),
    sourceName: normalizeText(
      document.querySelector('#js_name')?.textContent ||
        readMetaContent(document, 'meta[property="og:site_name"]')
    ),
    markdown,
  };
}

function extractReadableArticle(document, finalUrl) {
  const article = new Readability(document).parse();

  if (!article?.content) {
    throw new ArticleImportError('未能识别文章正文，请尝试手动复制内容。', 422);
  }

  const markdown = convertArticleHtmlToMarkdown(article.content, finalUrl);
  if (!markdown) {
    throw new ArticleImportError('未能提取出可用正文，请尝试手动复制内容。', 422);
  }

  return {
    title: normalizeText(article.title || document.title || ''),
    desc: normalizeText(
      article.excerpt ||
        readMetaContent(document, 'meta[name="description"]') ||
        readMetaContent(document, 'meta[property="og:description"]')
    ),
    sourceName: normalizeText(
      article.siteName ||
        readMetaContent(document, 'meta[property="og:site_name"]')
    ),
    markdown,
  };
}

async function importArticle(requestedUrl) {
  const validatedRequestedUrl = validateArticleUrl(requestedUrl, '请填写有效的文章链接。');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(validatedRequestedUrl.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: buildArticleRequestHeaders(validatedRequestedUrl),
    });

    if (!response.ok) {
      throw new ArticleImportError(`抓取文章失败（${response.status}）。`, 502);
    }

    const finalArticleUrl = validateArticleUrl(
      response.url || validatedRequestedUrl.toString(),
      '文章跳转后的链接无效。'
    );
    const finalUrl = finalArticleUrl.toString();
    const contentType = response.headers.get('content-type') || '';
    if (!HTML_CONTENT_TYPE_PATTERN.test(contentType)) {
      throw new ArticleImportError('该链接不是可导入的 HTML 文章页面。', 415);
    }

    const maxHtmlLength = getMaxHtmlLength(finalArticleUrl);
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > maxHtmlLength) {
      throw new ArticleImportError('文章内容过大，暂不支持导入。', 413);
    }

    const html = await readBodyWithLimit(response, maxHtmlLength);
    const sourceDom = new JSDOM(html, { url: finalUrl });

    try {
      const { document } = sourceDom.window;
      const extractedArticle = isWeChatArticleUrl(finalArticleUrl)
        ? extractWeChatArticle(document, finalUrl) || extractReadableArticle(document, finalUrl)
        : extractReadableArticle(document, finalUrl);

      return {
        title: extractedArticle.title,
        desc: extractedArticle.desc,
        sourceName: extractedArticle.sourceName || finalArticleUrl.hostname.replace(/^www\./, ''),
        markdown: extractedArticle.markdown,
        requestedUrl: validatedRequestedUrl.toString(),
        finalUrl,
      };
    } finally {
      sourceDom.window.close();
    }
  } catch (error) {
    if (error instanceof ArticleImportError) {
      throw error;
    }

    if (error?.name === 'AbortError') {
      throw new ArticleImportError('抓取文章超时，请稍后重试。', 504);
    }

    throw new ArticleImportError(error instanceof Error ? error.message : '导入正文失败。', 500);
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  ArticleImportError,
  importArticle,
  validateArticleUrl,
  normalizeMarkdown,
};
