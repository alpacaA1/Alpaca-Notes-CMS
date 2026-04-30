export type ResolvedContentFormat = 'markdown' | 'plaintext'

const MARKDOWN_FORMAT_ALIASES = new Set([
  'markdown',
  'md',
  'mdown',
  'mkd',
  'mkdn',
  'mdtext',
  'mdtxt',
])

const PLAINTEXT_FORMAT_ALIASES = new Set([
  'plain',
  'plaintext',
  'plaintxt',
  'text',
  'txt',
])

const MARKDOWN_FILE_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.mdown',
  '.mkd',
  '.mkdn',
  '.mdtext',
  '.mdtxt',
])

const PLAINTEXT_FILE_EXTENSIONS = new Set([
  '.txt',
  '.text',
  '.plaintext',
  '.plaintxt',
])

function normalizeFormatAlias(format?: string | null) {
  return format?.trim().toLowerCase().replace(/[\s_-]+/g, '') || ''
}

export function getFileExtension(path?: string | null) {
  const normalizedPath = path?.trim()
  if (!normalizedPath) {
    return ''
  }

  const matchedExtension = normalizedPath.match(/(\.[^./\\]+)$/)
  return matchedExtension?.[1]?.toLowerCase() || ''
}

export function isSupportedContentFileName(name: string) {
  const extension = getFileExtension(name)
  return MARKDOWN_FILE_EXTENSIONS.has(extension) || PLAINTEXT_FILE_EXTENSIONS.has(extension)
}

export function resolveContentFormat(path?: string | null, explicitFormat?: string | null): ResolvedContentFormat {
  const normalizedFormat = normalizeFormatAlias(explicitFormat)

  if (PLAINTEXT_FORMAT_ALIASES.has(normalizedFormat)) {
    return 'plaintext'
  }

  if (MARKDOWN_FORMAT_ALIASES.has(normalizedFormat)) {
    return 'markdown'
  }

  const extension = getFileExtension(path)

  if (PLAINTEXT_FILE_EXTENSIONS.has(extension)) {
    return 'plaintext'
  }

  return 'markdown'
}
