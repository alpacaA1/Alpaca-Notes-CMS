'use strict';

// 删除非文章页面里被 hexo-prism-plugin 无条件注入的 prism css/js。
// 判断依据：渲染后的 HTML 里是否存在 <pre class="language-xxx">。
// 若不存在，说明该页没有代码高亮，剥离 prism 资源以减少渲染阻塞。

const PRISM_LINK_RE = /<link\b[^>]*href="[^"]*\/css\/prism[^"]*\.css"[^>]*>\s*/gi;
const PRISM_SCRIPT_RE = /<script\b[^>]*src="[^"]*\/js\/prism[^"]*\.js"[^>]*><\/script>\s*/gi;
const PRISM_PRE_RE = /<pre\b[^>]*class="[^"]*\blanguage-/i;

hexo.extend.filter.register('after_render:html', function cleanupPrismAssets(str, data) {
  if (!str || typeof str !== 'string') {
    return str;
  }
  // 只对页面级 html 生效（data.path 形如 "index.html"、"archives/index.html"）
  if (!data || !/\.html$/.test(data.path || '')) {
    return str;
  }
  // 包含 prism 渲染产物则保留
  if (PRISM_PRE_RE.test(str)) {
    return str;
  }
  const next = str.replace(PRISM_LINK_RE, '').replace(PRISM_SCRIPT_RE, '');
  return next === str ? str : next;
});