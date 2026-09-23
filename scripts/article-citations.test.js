const test = require('node:test');
const assert = require('node:assert/strict');
const { marked } = require('marked');

const { renderArticleCitations } = require('./article-citations');

test('renders generated article citations as linked superscript references', () => {
  const markdown = `正文引用[^1]。\n\n<!-- article-references:start -->\n## 引用文章\n\n1. <!-- article-reference:1 -->《示例》\n<!-- article-references:end -->`;
  const rendered = renderArticleCitations(markdown);

  assert.match(rendered, /<sup class="article-citation-ref"><a href="#article-reference-1"/);
  assert.match(rendered, /<span id="article-reference-1" class="article-citation-target"/);
  assert.doesNotMatch(rendered, /正文引用\[\^1\]/);
});

test('leaves ordinary footnote-like text and fenced code unchanged without a generated section', () => {
  assert.equal(renderArticleCitations('普通内容[^1]'), '普通内容[^1]');

  const markdown = `正文[^9]\n\n行内代码 \`[^1]\`\n\n<!-- topic-backlinks:start -->\n摘录[^1]\n<!-- topic-backlinks:end -->\n\n\`\`\`md\n代码[^1]\n\`\`\`\n\n<!-- article-references:start -->\n## 引用文章\n\n1. <!-- article-reference:1 -->《示例》\n<!-- article-references:end -->`;
  const rendered = renderArticleCitations(markdown);
  assert.match(rendered, /正文\[\^9\]/);
  assert.match(rendered, /行内代码 `\[\^1\]`/);
  assert.match(rendered, /摘录\[\^1\]/);
  assert.match(rendered, /代码\[\^1\]/);
});

test('keeps hostile URL punctuation inside one safe rendered link', () => {
  const markdown = `正文[^1]\n\n<!-- article-references:start -->\n## 引用文章\n\n1. <!-- article-reference:1 -->[《安全标题》](<https://example.com/%29[x]%28javascript:alert%28document.domain%29%29>)\n<!-- article-references:end -->`;
  const html = marked(renderArticleCitations(markdown));

  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(html, /<img/i);
  assert.equal((html.match(/<a\s/g) || []).length, 2);
});
