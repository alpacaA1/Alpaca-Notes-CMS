export const BOOK_HIGHLIGHT_COLOR = '#D4A574'

const EPUB_FILE_NAME_PATTERN = /\.epub$/i
const PDF_FILE_NAME_PATTERN = /\.pdf$/i

export function isEpubFile(file: { name: string; type?: string }) {
  return file.type === 'application/epub+zip' || EPUB_FILE_NAME_PATTERN.test(file.name)
}

export function isPdfFile(file: { name: string; type?: string }) {
  return file.type === 'application/pdf' || PDF_FILE_NAME_PATTERN.test(file.name)
}

export function isSupportedBookFile(file: { name: string; type?: string }) {
  return isEpubFile(file) || isPdfFile(file)
}

export function createBookId() {
  return `book-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createBookAnnotationId() {
  return `book-annotation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function formatLanguageMap(value: unknown): string {
  if (!value) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'object') {
    const first = Object.values(value as Record<string, unknown>)[0]
    return typeof first === 'string' ? first : ''
  }
  return ''
}

export function formatContributor(value: unknown): string {
  if (!value) {
    return ''
  }
  if (Array.isArray(value)) {
    return value.map(formatContributor).filter(Boolean).join('、')
  }
  if (typeof value === 'object') {
    return formatLanguageMap((value as { name?: unknown }).name)
  }
  return typeof value === 'string' ? value : ''
}

export function normalizeBookQuote(value: string) {
  return value.replace(/\s+/g, ' ').trim().slice(0, 500)
}

export function formatBookProgress(fraction: number) {
  const percent = Math.round(Math.min(Math.max(fraction, 0), 1) * 100)
  return `${percent}%`
}

const FALLBACK_COVER_COLORS = ['#8B4513', '#7A6A53', '#5C6650', '#6B5B73', '#51606B']

export function getFallbackCoverColor(seed: number) {
  const index = Math.abs(Math.floor(seed)) % FALLBACK_COVER_COLORS.length
  return FALLBACK_COVER_COLORS[index]
}

export function flattenBookTocLabels(items: Array<{ label: string; subitems?: unknown }>): string[] {
  const labels: string[] = []
  for (const item of items) {
    labels.push(item.label)
    const subitems = Array.isArray(item.subitems) ? (item.subitems as Array<{ label: string; subitems?: unknown }>) : []
    labels.push(...flattenBookTocLabels(subitems))
  }
  return labels
}
