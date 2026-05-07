const fs = require('fs');
const path = require('path');

const GENERATED_TOPIC_BACKLINKS_START = '<!-- topic-backlinks:start -->';
const GENERATED_TOPIC_BACKLINKS_END = '<!-- topic-backlinks:end -->';
const WIKI_LINK_PATTERN = /\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/g;
const SNIPPET_MAX_LENGTH = 100;
const SCANNED_SOURCE_DIRS = ['_posts', '_knowledge'];

function trimQuotes(value) {
  return value.trim().replace(/^['"]|['"]$/g, '').trim();
}

function readScalar(frontmatter, field) {
  const match = frontmatter.match(new RegExp(`^${field}:[ \\t]*([^\\n\\r]*)$`, 'm'));
  if (!match) {
    return null;
  }

  const value = match[1].trim();
  return value.length === 0 ? '' : trimQuotes(value);
}

function readList(frontmatter, field) {
  const match = frontmatter.match(new RegExp(`^${field}:[ \\t]*((?:\\n\\s*-\\s.*)*)`, 'm'));
  if (!match) {
    return [];
  }

  return match[1]
    .split('\n')
    .map((line) => line.match(/^\s*-\s*(.*)$/)?.[1] || '')
    .map(trimQuotes)
    .filter((value) => value.length > 0);
}

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/^\n/, '');
}

function normalizeInlineLabel(value) {
  return String(value || '')
    .replace(/\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]/g, (_, targetKey, label) => (label || targetKey).trim())
    .replace(/^>\s?/, '')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateSnippet(value, maxLength = SNIPPET_MAX_LENGTH) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(1, maxLength - 1)).trim()}...`;
}

function buildExcerpt(body, startIndex) {
  const lineStart = body.lastIndexOf('\n', startIndex);
  const lineEnd = body.indexOf('\n', startIndex);
  const rawLine = body.slice(lineStart < 0 ? 0 : lineStart + 1, lineEnd < 0 ? body.length : lineEnd);
  const normalizedLine = normalizeInlineLabel(rawLine);

  if (normalizedLine) {
    return truncateSnippet(normalizedLine);
  }

  const paragraphStart = Math.max(0, startIndex - 48);
  const paragraphEnd = Math.min(body.length, startIndex + 52);
  return truncateSnippet(normalizeInlineLabel(body.slice(paragraphStart, paragraphEnd)));
}

function parseWikiLinks(markdown) {
  const links = [];

  for (const match of String(markdown || '').matchAll(WIKI_LINK_PATTERN)) {
    const rawTargetKey = match[1]?.trim() || '';
    if (!rawTargetKey) {
      continue;
    }

    links.push({
      targetKey: rawTargetKey,
      start: match.index || 0,
    });
  }

  return links;
}

function parseContentFile(relativePath, content) {
  const frontmatterMatch = String(content || '').match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
  const body = stripFrontmatter(content);
  const fileName = path.basename(relativePath, path.extname(relativePath));
  const isKnowledge = relativePath.startsWith('_knowledge/');
  const publishedRaw = readScalar(frontmatter, 'published');
  const knowledgeRaw = readScalar(frontmatter, 'knowledge');
  const topicRaw = readScalar(frontmatter, 'topic');
  const knowledgeKindRaw = readScalar(frontmatter, 'knowledge_kind');
  const nodeKeyRaw = readScalar(frontmatter, 'node_key');

  return {
    sourcePath: relativePath.replace(/\\/g, '/'),
    title: readScalar(frontmatter, 'title') || fileName,
    date: readScalar(frontmatter, 'date') || '',
    body,
    published: isKnowledge ? false : publishedRaw === null ? true : publishedRaw === 'true',
    contentType: isKnowledge || knowledgeRaw === 'true' ? 'knowledge' : 'post',
    knowledgeKind: knowledgeKindRaw === 'topic' ? 'topic' : 'note',
    isTopic: topicRaw === 'true',
    nodeKey: nodeKeyRaw && nodeKeyRaw.trim() ? nodeKeyRaw.trim() : null,
    aliases: readList(frontmatter, 'aliases'),
  };
}

function isTopicNodePost(post) {
  if (!post?.nodeKey) {
    return false;
  }

  return post.isTopic === true || (post.contentType === 'knowledge' && post.knowledgeKind === 'topic');
}

function shouldIncludePublicBacklinkSource(post) {
  return post.contentType === 'post' && post.published !== false;
}

function isTrueValue(value) {
  return value === true || value === 'true';
}

function buildTopicNodeMap(posts) {
  const nodeMap = new Map();
  const aliasEntries = [];

  posts.forEach((post) => {
    if (!isTopicNodePost(post) || nodeMap.has(post.nodeKey)) {
      return;
    }

    nodeMap.set(post.nodeKey, post);
    (post.aliases || []).forEach((alias) => {
      const normalizedAlias = alias.trim();
      if (!normalizedAlias || normalizedAlias === post.nodeKey || nodeMap.has(normalizedAlias)) {
        return;
      }

      aliasEntries.push([normalizedAlias, post]);
    });
  });

  aliasEntries.forEach(([alias, post]) => {
    if (!nodeMap.has(alias)) {
      nodeMap.set(alias, post);
    }
  });

  return nodeMap;
}

function buildTopicBacklinkMap(posts) {
  const backlinkMap = new Map();
  const topicNodeMap = buildTopicNodeMap(posts);

  posts.forEach((post) => {
    if (!shouldIncludePublicBacklinkSource(post) || !post.body.trim()) {
      return;
    }

    parseWikiLinks(post.body).forEach((link) => {
      const resolvedTargetKey = topicNodeMap.get(link.targetKey)?.nodeKey || link.targetKey;
      const backlinks = backlinkMap.get(resolvedTargetKey) || [];

      backlinks.push({
        targetKey: resolvedTargetKey,
        sourcePath: post.sourcePath,
        sourceTitle: post.title,
        sourceDate: post.date,
        sourceContentType: post.contentType,
        excerpt: buildExcerpt(post.body, link.start),
      });

      backlinkMap.set(resolvedTargetKey, backlinks);
    });
  });

  backlinkMap.forEach((backlinks, targetKey) => {
    backlinkMap.set(
      targetKey,
      [...backlinks].sort((left, right) => {
        const dateCompare = right.sourceDate.localeCompare(left.sourceDate);
        if (dateCompare !== 0) {
          return dateCompare;
        }

        return left.sourceTitle.localeCompare(right.sourceTitle, 'zh-CN');
      }),
    );
  });

  return backlinkMap;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripGeneratedTopicBacklinks(markdown) {
  const generatedSectionPattern = new RegExp(
    `${escapeRegExp(GENERATED_TOPIC_BACKLINKS_START)}[\\s\\S]*?${escapeRegExp(GENERATED_TOPIC_BACKLINKS_END)}\\n?`,
    'g',
  );
  const normalizedMarkdown = String(markdown || '');
  const hadTrailingNewline = normalizedMarkdown.endsWith('\n');
  const strippedMarkdown = normalizedMarkdown.replace(generatedSectionPattern, '').replace(/\n{3,}/g, '\n\n').trimEnd();

  return hadTrailingNewline && strippedMarkdown.length > 0 ? `${strippedMarkdown}\n` : strippedMarkdown;
}

function renderBlockquote(value) {
  return String(value || '')
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

function dedupeTopicBacklinks(backlinks) {
  const seen = new Set();

  return backlinks.filter((backlink) => {
    const dedupeKey = [backlink.sourcePath, backlink.sourceDate, backlink.sourceTitle, backlink.excerpt].join('::');
    if (seen.has(dedupeKey)) {
      return false;
    }

    seen.add(dedupeKey);
    return true;
  });
}

function buildTopicBacklinksMarkdown(backlinks) {
  const normalizedBacklinks = dedupeTopicBacklinks(backlinks).filter((backlink) => backlink.excerpt.trim());
  if (normalizedBacklinks.length === 0) {
    return '';
  }

  const sections = normalizedBacklinks.flatMap((backlink) => [
    `### ${backlink.sourceTitle.trim() || '未命名内容'}`,
    `文章 · ${backlink.sourceDate.slice(0, 10) || '无日期'}`,
    renderBlockquote(backlink.excerpt),
  ]);

  return [
    GENERATED_TOPIC_BACKLINKS_START,
    '## 相关双链摘录',
    ...sections,
    GENERATED_TOPIC_BACKLINKS_END,
  ].join('\n\n');
}

function appendTopicBacklinksToMarkdown(markdown, backlinks) {
  const cleanedMarkdown = stripGeneratedTopicBacklinks(markdown);
  const backlinksMarkdown = buildTopicBacklinksMarkdown(backlinks);

  if (!backlinksMarkdown) {
    return cleanedMarkdown;
  }

  return cleanedMarkdown.trim()
    ? `${cleanedMarkdown}\n\n${backlinksMarkdown}`
    : backlinksMarkdown;
}

function scanContentFiles(sourceDir) {
  return SCANNED_SOURCE_DIRS.flatMap((dirName) => {
    const fullDirPath = path.join(sourceDir, dirName);
    if (!fs.existsSync(fullDirPath)) {
      return [];
    }

    return fs
      .readdirSync(fullDirPath)
      .filter((fileName) => /\.(md|txt|plaintxt)$/i.test(fileName))
      .map((fileName) => {
        const relativePath = path.join(dirName, fileName).replace(/\\/g, '/');
        const fullPath = path.join(fullDirPath, fileName);
        return parseContentFile(relativePath, fs.readFileSync(fullPath, 'utf8'));
      });
  });
}

function buildTopicTransclusionIndex(sourceDir) {
  const posts = scanContentFiles(sourceDir);

  return {
    posts,
    backlinkMap: buildTopicBacklinkMap(posts),
  };
}

function isTopicRenderData(data) {
  const knowledgeKind = typeof data.knowledge_kind === 'string' ? data.knowledge_kind.trim() : '';
  return isTrueValue(data.topic) || (isTrueValue(data.knowledge) && knowledgeKind === 'topic');
}

function applyTopicTransclusion(data, backlinkMap) {
  if (!isTopicRenderData(data)) {
    return data;
  }

  const nodeKey = typeof data.node_key === 'string' ? data.node_key.trim() : '';
  if (!nodeKey) {
    return data;
  }

  const sourcePath = String(data.source || '').replace(/\\/g, '/');
  const backlinks = (backlinkMap.get(nodeKey) || []).filter((backlink) => backlink.sourcePath !== sourcePath);
  data.content = appendTopicBacklinksToMarkdown(String(data.content || ''), backlinks);
  return data;
}

function registerTopicTransclusionFilters(hexoInstance) {
  let backlinkMap = new Map();

  hexoInstance.extend.filter.register('before_generate', function buildTopicBacklinksBeforeGenerate() {
    const sourceDir = this?.source_dir || hexoInstance.source_dir;
    backlinkMap = buildTopicTransclusionIndex(sourceDir).backlinkMap;
  });

  hexoInstance.extend.filter.register('before_post_render', function injectTopicBacklinks(data) {
    return applyTopicTransclusion(data, backlinkMap);
  });
}

if (typeof hexo !== 'undefined' && hexo?.extend?.filter) {
  registerTopicTransclusionFilters(hexo);
}

module.exports = {
  appendTopicBacklinksToMarkdown,
  applyTopicTransclusion,
  buildTopicBacklinkMap,
  buildTopicTransclusionIndex,
  parseContentFile,
  registerTopicTransclusionFilters,
  stripGeneratedTopicBacklinks,
};
