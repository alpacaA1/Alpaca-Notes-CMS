const fs = require('fs');
const path = require('path');
const { stripGeneratedTopicBacklinks } = require('./topic-transclusion.js');

const DEFAULT_SITE_ROOT_PATH = '/Alpaca-Notes-CMS';
const DEFAULT_CONTENT_ROOT = 'private-content';

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function resetDirectory(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  ensureDirectory(dirPath);
}

function trimQuotes(value) {
  return value.trim().replace(/^['"]|['"]$/g, '').trim();
}

function readFrontmatterScalar(content, field) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
  const match = frontmatter.match(new RegExp(`^${field}:[ \\t]*([^\\n\\r]*)$`, 'm'));

  if (!match) {
    return null;
  }

  const value = match[1].trim();
  return value.length === 0 ? '' : trimQuotes(value);
}

function isPublishedPost(content) {
  const publishedRaw = readFrontmatterScalar(content, 'published');
  return publishedRaw === null ? true : publishedRaw === 'true';
}

function normalizeImagePath(imagePath) {
  return imagePath.replace(/^\/+/, '').replace(/^Alpaca-Notes-CMS\//, '');
}

function collectMarkdownImagePaths(content, siteRootPath) {
  const paths = new Set();
  const escapedSiteRoot = siteRootPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`${escapedSiteRoot}/images/([^\\s)"'>]+)`, 'g'),
    /(?:^|["'(=\s])\/images\/([^\s)"'>]+)/g,
  ];

  for (const pattern of patterns) {
    let match = pattern.exec(content);
    while (match) {
      paths.add(normalizeImagePath(`images/${match[1]}`));
      match = pattern.exec(content);
    }
  }

  const coverPath = readFrontmatterScalar(content, 'cover');
  if (coverPath && (/^\/?Alpaca-Notes-CMS\/images\//.test(coverPath) || /^\/images\//.test(coverPath))) {
    paths.add(normalizeImagePath(coverPath));
  }

  return paths;
}

function copyDirectory(sourceDir, destinationDir) {
  ensureDirectory(destinationDir);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
      continue;
    }

    ensureDirectory(path.dirname(destinationPath));
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

function stripGeneratedBacklinksInDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      stripGeneratedBacklinksInDirectory(fullPath);
      continue;
    }

    if (!/\.(md|txt|plaintxt)$/i.test(entry.name)) {
      continue;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const strippedContent = stripGeneratedTopicBacklinks(content);
    if (strippedContent !== content) {
      fs.writeFileSync(fullPath, strippedContent);
    }
  }
}

function countMarkdownFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  return fs.readdirSync(dirPath).filter((fileName) => /\.(md|txt|plaintxt)$/i.test(fileName)).length;
}

function syncOptionalContentDirectory(sourceDir, destinationDir) {
  fs.rmSync(destinationDir, { recursive: true, force: true });

  if (!fs.existsSync(sourceDir)) {
    return 0;
  }

  copyDirectory(sourceDir, destinationDir);
  stripGeneratedBacklinksInDirectory(destinationDir);
  return countMarkdownFiles(destinationDir);
}

function collectDirectoryImagePaths(contentDir, siteRootPath, options = {}) {
  if (!fs.existsSync(contentDir)) {
    return new Set();
  }

  const imagePaths = new Set();
  const publishedOnly = options.publishedOnly === true;

  for (const fileName of fs.readdirSync(contentDir)) {
    if (!/\.(md|txt|plaintxt)$/i.test(fileName)) {
      continue;
    }

    const content = fs.readFileSync(path.join(contentDir, fileName), 'utf8');
    if (publishedOnly && !isPublishedPost(content)) {
      continue;
    }

    for (const imagePath of collectMarkdownImagePaths(content, siteRootPath)) {
      imagePaths.add(imagePath);
    }
  }

  return imagePaths;
}

function collectPublishedImagePaths(postsDir, siteRootPath) {
  return collectDirectoryImagePaths(postsDir, siteRootPath, { publishedOnly: true });
}

function copyReferencedImages(contentImagesDir, publicImagesDir, imagePaths) {
  for (const imagePath of imagePaths) {
    const relativeImagePath = imagePath.replace(/^images\//, '');
    const sourcePath = path.join(contentImagesDir, relativeImagePath);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(`私有内容仓库缺少公开内容引用的图片：${imagePath}`);
    }

    const destinationPath = path.join(publicImagesDir, relativeImagePath);
    ensureDirectory(path.dirname(destinationPath));
    fs.copyFileSync(sourcePath, destinationPath);
  }
}

function syncPrivateContent(options = {}) {
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const contentRootInput = options.contentRoot || process.env.PRIVATE_CONTENT_PATH || DEFAULT_CONTENT_ROOT;
  const contentRoot = path.resolve(workspaceRoot, contentRootInput);
  const publicSourceDir = options.publicSourceDir || path.join(workspaceRoot, 'source');
  const siteRootPath = options.siteRootPath || DEFAULT_SITE_ROOT_PATH;
  const contentSourceDir = path.join(contentRoot, 'source');
  const contentPostsDir = path.join(contentSourceDir, '_posts');
  const contentImagesDir = path.join(contentSourceDir, 'images');
  const contentReadLaterDir = path.join(contentSourceDir, 'read-later-items');
  const contentKnowledgeDir = path.join(contentSourceDir, '_knowledge');
  const publicPostsDir = path.join(publicSourceDir, '_posts');
  const publicImagesDir = path.join(publicSourceDir, 'images');
  const publicReadLaterDir = path.join(publicSourceDir, 'read-later-items');
  const publicKnowledgeDir = path.join(publicSourceDir, '_knowledge');

  if (!fs.existsSync(contentSourceDir)) {
    throw new Error(`未找到私有内容目录：${contentSourceDir}`);
  }

  if (!fs.existsSync(contentPostsDir)) {
    throw new Error(`私有内容仓库缺少文章目录：${contentPostsDir}`);
  }

  resetDirectory(publicPostsDir);
  resetDirectory(publicImagesDir);

  fs.rmSync(path.join(publicSourceDir, 'diary'), { recursive: true, force: true });

  copyDirectory(contentPostsDir, publicPostsDir);
  stripGeneratedBacklinksInDirectory(publicPostsDir);
  const copiedReadLater = syncOptionalContentDirectory(contentReadLaterDir, publicReadLaterDir);
  const copiedKnowledge = syncOptionalContentDirectory(contentKnowledgeDir, publicKnowledgeDir);

  const publishedImagePaths = new Set([
    ...collectPublishedImagePaths(contentPostsDir, siteRootPath),
    ...collectDirectoryImagePaths(contentReadLaterDir, siteRootPath),
    ...collectDirectoryImagePaths(contentKnowledgeDir, siteRootPath),
  ]);
  if (publishedImagePaths.size > 0) {
    if (!fs.existsSync(contentImagesDir)) {
      throw new Error(`私有内容仓库缺少图片目录：${contentImagesDir}`);
    }
    copyReferencedImages(contentImagesDir, publicImagesDir, publishedImagePaths);
  }

  return {
    contentRoot,
    copiedPosts: countMarkdownFiles(publicPostsDir),
    copiedReadLater,
    copiedKnowledge,
    copiedImages: publishedImagePaths.size,
  };
}

if (require.main === module) {
  try {
    const summary = syncPrivateContent();
    console.log(`Synced private content from ${summary.contentRoot}`);
    console.log(`Posts: ${summary.copiedPosts}`);
    console.log(`Images: ${summary.copiedImages}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : '同步私有内容失败。');
    process.exit(1);
  }
}

module.exports = {
  collectMarkdownImagePaths,
  collectPublishedImagePaths,
  isPublishedPost,
  syncPrivateContent,
};
