export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024

const DEFAULT_IMAGE_BASENAME = 'pasted-image'
const MIME_EXTENSION_MAP: Record<(typeof ALLOWED_IMAGE_MIME_TYPES)[number], string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function isAllowedImageMimeType(value: string): value is (typeof ALLOWED_IMAGE_MIME_TYPES)[number] {
  return ALLOWED_IMAGE_MIME_TYPES.includes(value as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])
}

function sanitizeFilenamePart(value: string) {
  const sanitized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return sanitized || DEFAULT_IMAGE_BASENAME
}

function splitFileName(name: string) {
  const trimmed = name.trim()
  const extensionIndex = trimmed.lastIndexOf('.')

  if (extensionIndex <= 0 || extensionIndex === trimmed.length - 1) {
    return {
      basename: trimmed,
    }
  }

  return {
    basename: trimmed.slice(0, extensionIndex),
  }
}

function resolveImageExtension(file: File) {
  if (!isAllowedImageMimeType(file.type)) {
    throw new Error('仅支持 PNG、JPG、WEBP 或 GIF 图片。')
  }

  return MIME_EXTENSION_MAP[file.type]
}

function resolveDefaultAlt(file: File) {
  const { basename } = splitFileName(file.name)
  return sanitizeFilenamePart(basename)
}

export function validateImageFile(file: File) {
  if (!isAllowedImageMimeType(file.type)) {
    throw new Error('仅支持 PNG、JPG、WEBP 或 GIF 图片。')
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    throw new Error('图片大小不能超过 10 MB。')
  }
}

export function buildImageUploadDescriptor(file: File, now = new Date()) {
  validateImageFile(file)

  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const timestamp = now.getTime()
  const defaultAlt = resolveDefaultAlt(file)
  const extension = resolveImageExtension(file)
  const filename = `${timestamp}-${defaultAlt}.${extension}`

  return {
    repoPath: `source/images/${year}/${month}/${filename}`,
    publicUrl: `/images/${year}/${month}/${filename}`,
    defaultAlt,
  }
}

export function buildImageMarkdown(defaultAlt: string, publicUrl: string) {
  return `![${defaultAlt}](${publicUrl})`
}
