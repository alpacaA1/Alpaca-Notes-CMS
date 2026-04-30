const { extname } = require('path');

const PLAIN_TEXT_FORMAT_ALIASES = new Set(['plain', 'plaintext', 'plaintxt', 'text', 'txt']);
const PLAIN_TEXT_EXTENSIONS = new Set(['.txt', '.text', '.plaintext', '.plaintxt']);

function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeFormatAlias(format) {
  return typeof format === 'string' ? format.trim().toLowerCase().replace(/[\s_-]+/g, '') : '';
}

function isPlainTextFormat(format) {
  return PLAIN_TEXT_FORMAT_ALIASES.has(normalizeFormatAlias(format));
}

function hasPlainTextExtension(source) {
  return PLAIN_TEXT_EXTENSIONS.has(extname(source || '').toLowerCase());
}

function renderPlainTextParagraph(paragraph) {
  return `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>\n')}</p>`;
}

function renderPlainTextToHtml(text) {
  const normalizedText = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!normalizedText) {
    return '';
  }

  return normalizedText
    .split(/\n\s*\n/g)
    .filter(Boolean)
    .map(renderPlainTextParagraph)
    .join('\n');
}

hexo.extend.filter.register('before_post_render', function renderExplicitPlainTextFormat(data) {
  if (!isPlainTextFormat(data.format) || hasPlainTextExtension(data.source)) {
    return data;
  }

  data.content = renderPlainTextToHtml(data.content);
  return data;
});

function plainTextRenderer(data) {
  return renderPlainTextToHtml(data.text);
}

['txt', 'text', 'plaintext', 'plaintxt'].forEach((extension) => {
  hexo.extend.renderer.register(extension, 'html', plainTextRenderer, true);
});
