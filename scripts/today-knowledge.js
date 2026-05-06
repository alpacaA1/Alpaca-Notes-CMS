const fs = require('fs');
const path = require('path');

const KNOWLEDGE_SOURCE_DIR = '_knowledge';
const OUTPUT_PATH = 'today-knowledge/data.json';

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

function stripFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '');
}

function readSection(body, heading, nextHeading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedNextHeading = nextHeading ? nextHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  const pattern = nextHeading
    ? new RegExp(`## ${escapedHeading}\\n([\\s\\S]*?)\\n## ${escapedNextHeading}(?:\\n|$)`)
    : new RegExp(`## ${escapedHeading}\\n([\\s\\S]*)$`);
  const match = body.match(pattern);

  return (match && match[1] ? match[1] : '').trim();
}

function normalizeLine(line) {
  return line
    .replace(/^>\s?/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/^#{1,6}\s+/, '')
    .trim();
}

function readFirstMeaningfulLine(body) {
  const lines = String(body || '')
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  return lines[0] || '';
}

function buildPreview(body, title) {
  const normalizedTitle = normalizeLine(title);
  const lines = String(body || '')
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const preferred = lines.find((line) => line !== normalizedTitle);
  return preferred || lines[0] || '';
}

function normalizeBlock(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^>\s?/, ''))
    .join('\n')
    .trim();
}

function buildKnowledgeItem(fileName, content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
  const body = stripFrontmatter(content).trim();
  const title =
    readScalar(frontmatter, 'title') ||
    readScalar(frontmatter, 'desc') ||
    readFirstMeaningfulLine(body) ||
    fileName.replace(/\.md$/i, '');
  const date = readScalar(frontmatter, 'date') || '';
  const quote = normalizeBlock(readSection(body, '原文摘录', '我的理解'));
  const note = normalizeBlock(readSection(body, '我的理解', null));
  const fallbackContent = normalizeBlock(body);
  const desc = buildPreview(note || quote || fallbackContent, title) || readScalar(frontmatter, 'desc') || '';

  return {
    id: fileName.replace(/\.md$/i, ''),
    path: `source/${KNOWLEDGE_SOURCE_DIR}/${fileName}`,
    title,
    date,
    desc,
    quote,
    note,
    content: fallbackContent,
  };
}

function readKnowledgeItems(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    return [];
  }

  return fs
    .readdirSync(sourceDir)
    .filter((fileName) => fileName.toLowerCase().endsWith('.md'))
    .sort((left, right) => right.localeCompare(left, 'zh-CN'))
    .map((fileName) => {
      const fullPath = path.join(sourceDir, fileName);
      const content = fs.readFileSync(fullPath, 'utf8');
      return buildKnowledgeItem(fileName, content);
    });
}

hexo.extend.generator.register('today-knowledge-data', function generateTodayKnowledgeData() {
  const sourceDir = path.join(this.source_dir, KNOWLEDGE_SOURCE_DIR);
  const items = readKnowledgeItems(sourceDir);

  return [
    {
      path: OUTPUT_PATH,
      data: JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          timeZone: this.config.timezone || 'Asia/Shanghai',
          items,
        },
        null,
        2,
      ),
    },
  ];
});
