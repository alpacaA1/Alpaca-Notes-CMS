const GENERATED_ARTICLE_REFERENCES_START = '<!-- article-references:start -->';
const GENERATED_ARTICLE_REFERENCES_END = '<!-- article-references:end -->';

function renderBodyReferenceMarkers(markdown, validReferenceNumbers) {
  let isInCodeFence = false;
  let isInTopicBacklinks = false;

  return markdown.split('\n').map((line) => {
    if (line.includes('<!-- topic-backlinks:start -->')) {
      isInTopicBacklinks = true;
    }
    if (/^\s*```/.test(line)) {
      isInCodeFence = !isInCodeFence;
      return line;
    }
    if (isInCodeFence || isInTopicBacklinks) {
      if (line.includes('<!-- topic-backlinks:end -->')) {
        isInTopicBacklinks = false;
      }
      return line;
    }

    return line.split(/(!?\[[^\]]*\]\([^)]*\)|`[^`]*`|<[^>]+>)/g).map((segment) => {
      if (/^(?:!?\[[^\]]*\]\([^)]*\)|`[^`]*`|<[^>]+>)$/.test(segment)) {
        return segment;
      }
      return segment.replace(/\[\^(\d+)\]/g, (fullMatch, referenceNumber) => (
        validReferenceNumbers.has(referenceNumber)
          ? `<sup class="article-citation-ref"><a href="#article-reference-${referenceNumber}" aria-label="查看引用 ${referenceNumber}">${referenceNumber}</a></sup>`
          : fullMatch
      ));
    }).join('');
  }).join('\n');
}

function renderArticleCitations(markdown) {
  const source = String(markdown || '');
  const sectionStart = source.indexOf(GENERATED_ARTICLE_REFERENCES_START);
  const sectionEnd = source.indexOf(GENERATED_ARTICLE_REFERENCES_END, sectionStart);
  if (sectionStart < 0 || sectionEnd < 0) {
    return source;
  }

  const rawReferenceSection = source.slice(sectionStart, sectionEnd + GENERATED_ARTICLE_REFERENCES_END.length);
  const validReferenceNumbers = new Set(
    [...rawReferenceSection.matchAll(/<!--\s*article-reference:(\d+)\s*-->/g)].map((match) => match[1]),
  );
  const body = renderBodyReferenceMarkers(source.slice(0, sectionStart), validReferenceNumbers);
  const referenceSection = rawReferenceSection
    .replace(/<!--\s*article-reference:(\d+)\s*-->/g, (_, referenceNumber) => (
      `<span id="article-reference-${referenceNumber}" class="article-citation-target" aria-hidden="true"></span>`
    ));
  return `${body}${referenceSection}${source.slice(sectionEnd + GENERATED_ARTICLE_REFERENCES_END.length)}`;
}

function registerArticleCitationFilter(hexoInstance) {
  hexoInstance.extend.filter.register('before_post_render', function renderArticleCitationReferences(data) {
    data.content = renderArticleCitations(data.content);
    return data;
  });
}

if (typeof hexo !== 'undefined' && hexo?.extend?.filter) {
  registerArticleCitationFilter(hexo);
}

module.exports = {
  registerArticleCitationFilter,
  renderArticleCitations,
};
