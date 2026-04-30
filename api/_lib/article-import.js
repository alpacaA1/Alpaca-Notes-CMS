const net = require('node:net');
const dns = require('node:dns').promises;
const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');

const FETCH_TIMEOUT_MS = 12000;
const MAX_HTML_LENGTH = 2_000_000;
const WECHAT_MAX_HTML_LENGTH = 12_000_000;
const MAX_JSON_LENGTH = 2_000_000;
const MAX_REDIRECTS = 5;
const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:']);
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const HTML_CONTENT_TYPE_PATTERN = /^(text\/html|application\/xhtml\+xml)\b/i;
const PRIVATE_IPV4_PATTERNS = [/^127\./, /^10\./, /^192\.168\./, /^169\.254\./, /^0\./];
const MOWEN_NOTE_HOSTNAME_PATTERN = /^(?:dev-|d-)?note\.mowen\.cn$/i;
const MOWEN_DETAIL_PATH_PATTERN = /^\/detail\/([^/?#]+)/i;
const MOWEN_NOTE_SHOW_API_PATH = '/api/note/wxa/v1/note/show';
const DEFAULT_ARTICLE_REQUEST_HEADERS = {
  Accept: 'text/html,application/xhtml+xml',
  'User-Agent': 'alpaca-notes-importer/1.0',
};
const JSON_REQUEST_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Content-Type': 'application/json',
  'User-Agent': 'alpaca-notes-importer/1.0',
};
const WECHAT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
let dnsLookup = dns.lookup.bind(dns);

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

function normalizeHostname(hostname) {
  return String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
}

function isWeChatArticleUrl(url) {
  return url.hostname.toLowerCase() === 'mp.weixin.qq.com';
}

function isMowenArticleUrl(url) {
  return MOWEN_NOTE_HOSTNAME_PATTERN.test(url.hostname) && MOWEN_DETAIL_PATH_PATTERN.test(url.pathname);
}

function readMowenArticleId(url) {
  return url.pathname.match(MOWEN_DETAIL_PATH_PATTERN)?.[1]?.trim() || '';
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

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local') || isPrivateIPAddress(hostname)) {
    throw new ArticleImportError('暂不支持导入该地址。', 400);
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
    throw new ArticleImportError('暂时无法解析该地址，请稍后重试。', 502);
  }

  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new ArticleImportError('暂时无法解析该地址，请稍后重试。', 502);
  }

  if (addresses.some((entry) => isPrivateIPAddress(normalizeHostname(entry?.address)))) {
    throw new ArticleImportError('暂不支持导入该地址。', 400);
  }
}

function isRedirectResponse(response) {
  return REDIRECT_STATUS_CODES.has(response.status);
}

async function fetchArticleResponse(initialUrl, signal) {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    await assertPublicResolvedAddress(currentUrl);

    const response = await fetch(currentUrl.toString(), {
      redirect: 'manual',
      signal,
      headers: buildArticleRequestHeaders(currentUrl),
    });

    if (!isRedirectResponse(response)) {
      return { response, finalUrl: currentUrl };
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new ArticleImportError('文章跳转次数过多，暂不支持导入。', 508);
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new ArticleImportError('文章跳转后的链接无效。', 502);
    }

    currentUrl = validateArticleUrl(new URL(location, currentUrl).toString(), '文章跳转后的链接无效。');
  }

  throw new ArticleImportError('导入正文失败。', 500);
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

function sanitizeCodeFenceLanguage(value) {
  const language = String(value || '').trim();
  if (!language || language.toLowerCase() === 'text') {
    return '';
  }

  return /^[a-z0-9_+#.-]+$/i.test(language) ? language : '';
}

function buildCodeFence(code) {
  const matches = String(code || '').match(/`{3,}/g) || [];
  const fenceLength = matches.reduce((maxLength, fence) => Math.max(maxLength, fence.length + 1), 3);
  return '`'.repeat(fenceLength);
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

function readBackgroundImageUrl(styleValue) {
  const match = String(styleValue || '').match(/background(?:-image)?\s*:\s*url\((['"]?)(.*?)\1\)/i);
  return match?.[2]?.trim() || '';
}

function readLazyImageSource(element) {
  return [
    element.getAttribute('data-src'),
    element.getAttribute('data-original'),
    element.getAttribute('data-actualsrc'),
    element.getAttribute('data-backsrc'),
    element.getAttribute('data-croporisrc'),
    readBackgroundImageUrl(element.getAttribute('style')),
  ].find((value) => typeof value === 'string' && value.trim()) || '';
}

function applyLazyImageSources(document) {
  document.querySelectorAll('img').forEach((element) => {
    const lazySource = readLazyImageSource(element);

    if (lazySource) {
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
  service.addRule('mowenCodeblock', {
    filter(node) {
      return node.nodeName === 'CODEBLOCK';
    },
    replacement(_content, node) {
      const code = String(node.textContent || '').replace(/\r\n/g, '\n').trim();
      if (!code) {
        return '\n\n';
      }

      const language = sanitizeCodeFenceLanguage(node.getAttribute('language'));
      const fence = buildCodeFence(code);
      return `\n\n${fence}${language ? language : ''}\n${code}\n${fence}\n\n`;
    },
  });
  return service;
}

function normalizeMarkdown(markdown) {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeHeadingComparisonText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function getMarkdownHeadingTexts(markdown) {
  const headingTexts = [];
  let openFence = null;

  for (const line of String(markdown || '').split('\n')) {
    const trimmedLine = line.trimStart();
    const fenceMatch = trimmedLine.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!openFence) {
        openFence = { character: marker[0], length: marker.length };
      } else if (marker[0] === openFence.character && marker.length >= openFence.length) {
        openFence = null;
      }
      continue;
    }

    if (openFence) {
      continue;
    }

    const headingMatch = line.match(/^\s{0,3}#{1,6}\s+(.*)$/);
    if (!headingMatch) {
      continue;
    }

    const label = normalizeText(headingMatch[1].replace(/\s+#+\s*$/, ''));
    if (label) {
      headingTexts.push(label);
    }
  }

  return headingTexts;
}

function hasMarkdownHeadings(markdown) {
  return getMarkdownHeadingTexts(markdown).length > 0;
}

function readStrongOnlyParagraphText(block) {
  const trimmedBlock = String(block || '').trim();
  if (!trimmedBlock || trimmedBlock.includes('\n')) {
    return '';
  }

  const match = trimmedBlock.match(/^\*\*([^*\n]+?)\*\*(?:\s*[：:])?$/);
  return match ? normalizeText(match[1]) : '';
}

function enhanceImportedMarkdown(markdown, title) {
  const normalizedTitle = normalizeText(title);
  const normalizedTitleForComparison = normalizeHeadingComparisonText(normalizedTitle);
  let enhancedMarkdown = normalizeMarkdown(markdown);

  if (!enhancedMarkdown || hasMarkdownHeadings(enhancedMarkdown)) {
    return enhancedMarkdown;
  }

  const blocks = enhancedMarkdown.split(/\n{2,}/);
  enhancedMarkdown = normalizeMarkdown(
    blocks
      .map((block) => {
        const strongOnlyText = readStrongOnlyParagraphText(block);
        if (!strongOnlyText) {
          return block.trim();
        }

        if (
          normalizedTitleForComparison &&
          normalizeHeadingComparisonText(strongOnlyText) === normalizedTitleForComparison
        ) {
          return `# ${normalizedTitle}`;
        }

        return `## ${strongOnlyText}`;
      })
      .join('\n\n')
  );

  if (!normalizedTitle) {
    return enhancedMarkdown;
  }

  const hasTitleHeading = getMarkdownHeadingTexts(enhancedMarkdown).some(
    (headingText) => normalizeHeadingComparisonText(headingText) === normalizedTitleForComparison
  );

  if (hasTitleHeading) {
    return enhancedMarkdown;
  }

  return normalizeMarkdown(`# ${normalizedTitle}\n\n${enhancedMarkdown}`);
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

  const title = normalizeText(
    document.querySelector('#activity-name')?.textContent ||
      readMetaContent(document, 'meta[property="og:title"]') ||
      document.title ||
      ''
  );

  return {
    title,
    desc: normalizeText(
      readMetaContent(document, 'meta[property="og:description"]') ||
        readMetaContent(document, 'meta[name="description"]')
    ),
    sourceName: normalizeText(
      document.querySelector('#js_name')?.textContent ||
        readMetaContent(document, 'meta[property="og:site_name"]')
    ),
    markdown: enhanceImportedMarkdown(markdown, title),
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

  const title = normalizeText(article.title || document.title || '');

  return {
    title,
    desc: normalizeText(
      article.excerpt ||
        readMetaContent(document, 'meta[name="description"]') ||
        readMetaContent(document, 'meta[property="og:description"]')
    ),
    sourceName: normalizeText(
      article.siteName ||
        readMetaContent(document, 'meta[property="og:site_name"]')
    ),
    markdown: enhanceImportedMarkdown(markdown, title),
  };
}

function parseJsonPayload(text, invalidMessage) {
  try {
    return JSON.parse(text);
  } catch {
    throw new ArticleImportError(invalidMessage, 502);
  }
}

function readTextWithLimit(response, maxLength, overflowMessage) {
  return response.text().then((text) => {
    if (text.length > maxLength) {
      throw new ArticleImportError(overflowMessage, 413);
    }
    return text;
  });
}

async function importMowenArticle(finalArticleUrl, signal) {
  const articleId = readMowenArticleId(finalArticleUrl);
  if (!articleId) {
    throw new ArticleImportError('墨问文章链接格式无效。', 400);
  }

  const requestBody = { uuid: articleId };
  const peekKey = finalArticleUrl.searchParams.get('code')?.trim();
  if (peekKey) {
    requestBody.peekKey = peekKey;
  }

  const apiUrl = new URL(MOWEN_NOTE_SHOW_API_PATH, finalArticleUrl.origin);
  const response = await fetch(apiUrl.toString(), {
    method: 'POST',
    signal,
    headers: JSON_REQUEST_HEADERS,
    body: JSON.stringify(requestBody),
  });

  const payload = parseJsonPayload(
    await readTextWithLimit(response, MAX_JSON_LENGTH, '墨问正文返回内容过大，暂不支持导入。'),
    '墨问正文返回格式无效。'
  );

  if (!response.ok) {
    throw new ArticleImportError(
      normalizeText(payload?.message) || `抓取文章失败（${response.status}）。`,
      response.status >= 400 ? response.status : 502
    );
  }

  const content = String(payload?.detail?.noteBase?.content || '').replace(/&nbsp;/g, ' ');
  const markdown = convertArticleHtmlToMarkdown(content, finalArticleUrl.toString());
  if (!markdown) {
    throw new ArticleImportError('未能提取出可用正文，请尝试手动复制内容。', 422);
  }

  const title = normalizeText(payload?.detail?.noteBase?.title);

  return {
    title,
    desc: normalizeText(payload?.detail?.noteBase?.digest),
    sourceName:
      normalizeText([payload?.user?.base?.name, '墨问'].filter(Boolean).join(' · ')) || '墨问',
    markdown: enhanceImportedMarkdown(markdown, title),
  };
}

async function importArticle(requestedUrl) {
  const validatedRequestedUrl = validateArticleUrl(requestedUrl, '请填写有效的文章链接。');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const { response, finalUrl: finalArticleUrl } = await fetchArticleResponse(validatedRequestedUrl, controller.signal);

    if (!response.ok) {
      throw new ArticleImportError(`抓取文章失败（${response.status}）。`, 502);
    }

    const finalUrl = finalArticleUrl.toString();
    if (isMowenArticleUrl(finalArticleUrl)) {
      const extractedArticle = await importMowenArticle(finalArticleUrl, controller.signal);
      return {
        title: extractedArticle.title,
        desc: extractedArticle.desc,
        sourceName: extractedArticle.sourceName,
        markdown: extractedArticle.markdown,
        requestedUrl: validatedRequestedUrl.toString(),
        finalUrl,
      };
    }

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
  setDnsLookupForTesting(lookup) {
    dnsLookup = lookup;
  },
  resetDnsLookupForTesting() {
    dnsLookup = dns.lookup.bind(dns);
  },
};
