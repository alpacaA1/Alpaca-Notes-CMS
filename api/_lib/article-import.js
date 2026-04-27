const net = require('node:net');
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

const FETCH_TIMEOUT_MS = 12000;
const MAX_HTML_LENGTH = 2_000_000;
const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);
const HTML_CONTENT_TYPE_PATTERN = /^(text\/html|application\/xhtml\+xml)\b/i;
const PRIVATE_IPV4_PATTERNS = [/^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^0\./];

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

function readBodyWithLimit(response) {
  return response.text().then((html) => {
    if (html.length > MAX_HTML_LENGTH) {
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

function prepareArticleHtml(content, baseUrl) {
  const dom = new JSDOM(`<body>${content}</body>`, { url: baseUrl });
  const { document } = dom.window;

  document.querySelectorAll('script, style, iframe, form, noscript').forEach((node) => node.remove());
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

async function importArticle(requestedUrl) {
  const validatedRequestedUrl = validateArticleUrl(requestedUrl, '请填写有效的文章链接。');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(validatedRequestedUrl.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'User-Agent': 'alpaca-notes-importer/1.0',
      },
    });

    if (!response.ok) {
      throw new ArticleImportError(`抓取文章失败（${response.status}）。`, 502);
    }

    const finalUrl = validateArticleUrl(response.url || validatedRequestedUrl.toString(), '文章跳转后的链接无效。').toString();
    const contentType = response.headers.get('content-type') || '';
    if (!HTML_CONTENT_TYPE_PATTERN.test(contentType)) {
      throw new ArticleImportError('该链接不是可导入的 HTML 文章页面。', 415);
    }

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_HTML_LENGTH) {
      throw new ArticleImportError('文章内容过大，暂不支持导入。', 413);
    }

    const html = await readBodyWithLimit(response);
    const sourceDom = new JSDOM(html, { url: finalUrl });
    const { document } = sourceDom.window;
    const article = new Readability(document).parse();

    if (!article?.content) {
      throw new ArticleImportError('未能识别文章正文，请尝试手动复制内容。', 422);
    }

    const { dom: articleDom, html: articleHtml } = prepareArticleHtml(article.content, finalUrl);
    const markdown = normalizeMarkdown(createTurndownService().turndown(articleHtml));

    if (!markdown) {
      throw new ArticleImportError('未能提取出可用正文，请尝试手动复制内容。', 422);
    }

    const title = normalizeText(article.title || document.title || '');
    const desc = normalizeText(article.excerpt || readMetaContent(document, 'meta[name="description"]') || readMetaContent(document, 'meta[property="og:description"]'));
    const sourceName = normalizeText(article.siteName || readMetaContent(document, 'meta[property="og:site_name"]') || validatedRequestedUrl.hostname.replace(/^www\./, ''));

    sourceDom.window.close();
    articleDom.window.close();

    return {
      title,
      desc,
      sourceName,
      markdown,
      requestedUrl: validatedRequestedUrl.toString(),
      finalUrl,
    };
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
