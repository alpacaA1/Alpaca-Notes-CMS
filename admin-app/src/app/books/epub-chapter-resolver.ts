import type { BookAnnotation, BookTocItem, StoredBookMeta } from './book-types'
import { getBookFile, listBookAnnotations, putBookAnnotation, putBookFile } from './book-store'
import { formatContributor, formatLanguageMap } from './book-utils'

export interface FlattenedTocItem {
  label: string
  href: string
  normalizedPath: string
  fragment: string | null
}

const PLACEHOLDER_CHAPTERS = new Set(['划线片段', '读书想法', '未知章节', '未知页码', '电子书章节'])

export function isMeaningfulChapter(chapter?: string | null): boolean {
  if (!chapter) return false
  const trimmed = chapter.trim()
  return Boolean(trimmed && !PLACEHOLDER_CHAPTERS.has(trimmed))
}

/**
 * Normalize whitespace and common invisible characters for search.
 */
export function normalizeTextForSearch(text: string): string {
  return text
    .replace(/[\r\n\t\f\v]/g, ' ')
    .replace(/[\u00A0\u3000\u200B\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Canonicalize text by stripping punctuation, whitespace, and normalizing quotes.
 * This guarantees "不能只看前20个字，要看所有内容": all characters in the quote must match
 * the section text in sequence, without failing due to minor typography/punctuation variations.
 */
export function canonicalizeFullText(text: string): string {
  return text
    .replace(/[“”"「」『』]/g, '"')
    .replace(/[‘’'']/g, "'")
    .replace(/[—–-]/g, '-')
    .replace(/[…\.]+/g, '…')
    .replace(/[\s\u3000\r\n\t\u00A0\u200B\uFEFF]/g, '')
    .toLowerCase()
}

/**
 * Strip punctuation entirely for full character-content match.
 */
export function stripPunctuation(text: string): string {
  return text
    .replace(/[\s\p{P}\p{S}\u3000\r\n\t\u00A0\u200B\uFEFF]/gu, '')
    .toLowerCase()
}

/**
 * Flatten a hierarchical TOC tree into a linear list with paths and fragments.
 */
export function flattenToc(toc: BookTocItem[] | null | undefined): FlattenedTocItem[] {
  if (!toc || !Array.isArray(toc)) return []
  const result: FlattenedTocItem[] = []

  function walk(items: BookTocItem[]) {
    for (const item of items) {
      if (!item) continue
      const label = (item.label || '').trim()
      const rawHref = (item.href || '').trim()

      if (label && rawHref) {
        const [rawPath, fragment] = rawHref.split('#')
        const normalizedPath = (rawPath || '').replace(/^(\.\/|\/)+/, '')
        result.push({
          label,
          href: rawHref,
          normalizedPath,
          fragment: fragment || null,
        })
      }

      if (item.subitems && Array.isArray(item.subitems)) {
        walk(item.subitems)
      }
    }
  }

  walk(toc)
  return result
}

function normalizePathString(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^(\.\/|\/)+/, '')
    .toLowerCase()
}

export function matchesPath(tocPath: string, sectionId: string): boolean {
  if (!tocPath || !sectionId) return false
  const p1 = normalizePathString(tocPath)
  const p2 = normalizePathString(sectionId)
  if (p1 === p2) return true
  if (p2.endsWith('/' + p1)) return true
  if (p1.endsWith('/' + p2)) return true

  // Compare file basenames
  const name1 = p1.split('/').pop()
  const name2 = p2.split('/').pop()
  return Boolean(name1 && name2 && name1 === name2)
}

export interface ResolvedSectionContent {
  sectionIndex: number
  sectionId: string
  doc: Document | null
  textContent: string
  normalizedText: string
  canonicalText: string
  strippedText: string
  associatedChapterTitle: string | null
}

/**
 * Match an annotation's quote against a section's text content.
 * Checks ALL content of the quote rather than just a prefix.
 */
export function matchQuoteInSection(
  quote: string,
  section: Pick<ResolvedSectionContent, 'normalizedText' | 'canonicalText' | 'strippedText'>,
): boolean {
  const cleanQuote = quote.trim()
  if (!cleanQuote) return false

  // Level 1: Strict normalized full text matching
  const normQuote = normalizeTextForSearch(cleanQuote)
  if (normQuote.length > 0 && section.normalizedText.includes(normQuote)) {
    return true
  }

  // Level 2: Canonical full content matching (ignoring whitespace differences & quote marks)
  const canonQuote = canonicalizeFullText(cleanQuote)
  if (canonQuote.length > 0 && section.canonicalText.includes(canonQuote)) {
    return true
  }

  // Level 3: Punctuation-agnostic full character sequence matching
  const strippedQuote = stripPunctuation(cleanQuote)
  if (strippedQuote.length >= 6 && section.strippedText.includes(strippedQuote)) {
    return true
  }

  return false
}

/**
 * Resolves the best chapter title for an annotation within a matched section.
 */
export function resolveChapterForMatchedQuote(
  quote: string,
  section: ResolvedSectionContent,
  flatToc: FlattenedTocItem[],
): string | null {
  // 1. If section has DOM and multiple TOC fragments for this section, find nearest preceding anchor
  if (section.doc && flatToc.length > 0) {
    const fragmentItems = flatToc.filter(
      (item) => item.fragment && matchesPath(item.normalizedPath, section.sectionId),
    )

    if (fragmentItems.length > 1) {
      try {
        // Find which anchor element appears before the text containing the quote
        const docText = section.textContent
        const normQuote = normalizeTextForSearch(quote)
        const quoteIndex = docText.indexOf(normQuote)

        if (quoteIndex !== -1) {
          let bestFragmentItem: FlattenedTocItem | null = null
          let bestAnchorIndex = -1

          for (const item of fragmentItems) {
            if (!item.fragment) continue
            const anchorEl = section.doc.getElementById(item.fragment)
            if (anchorEl) {
              const anchorText = anchorEl.textContent || ''
              const anchorIndex = docText.indexOf(anchorText)
              if (anchorIndex !== -1 && anchorIndex <= quoteIndex && anchorIndex > bestAnchorIndex) {
                bestAnchorIndex = anchorIndex
                bestFragmentItem = item
              }
            }
          }

          if (bestFragmentItem) {
            return bestFragmentItem.label
          }
        }
      } catch {
        // Fallback to section's default associated chapter
      }
    }
  }

  // 2. Use section's pre-associated chapter title from TOC
  if (section.associatedChapterTitle) {
    return section.associatedChapterTitle
  }

  // 3. Fallback: check section DOM heading tags (<h1>, <h2>, etc.)
  if (section.doc) {
    const headingEl = section.doc.querySelector('h1, h2, h3, .chapter-title, .title')
    const headingText = headingEl?.textContent?.trim()
    if (headingText && isMeaningfulChapter(headingText)) {
      return headingText
    }
  }

  return null
}

/**
 * Reads and indexes EPUB sections and TOC from a file blob.
 */
export async function parseEpubForResolution(file: File | Blob): Promise<{
  sections: ResolvedSectionContent[]
  flatToc: FlattenedTocItem[]
}> {
  const { makeBook } = await import('foliate-js/view.js')

  // Ensure file is wrapped with name if it's a bare Blob
  const namedFile =
    file instanceof File && file.name
      ? file
      : new File([file], 'book.epub', { type: 'application/epub+zip' })

  const book = await makeBook(namedFile)
  const rawToc = (book.toc as BookTocItem[] | null) ?? []
  const flatToc = flattenToc(rawToc)

  const rawSections = (book.sections as Array<{
    id?: string
    createDocument?: () => Promise<Document>
    load?: () => Promise<Document | Element | string>
  }>) ?? []

  const sections: ResolvedSectionContent[] = []
  let lastKnownChapter: string | null = null

  for (let i = 0; i < rawSections.length; i++) {
    const rawSection = rawSections[i]
    if (!rawSection) continue
    const sectionId = rawSection.id || `section-${i}`

    let doc: Document | null = null
    let textContent = ''

    try {
      if (typeof rawSection.createDocument === 'function') {
        doc = await rawSection.createDocument()
      } else if (typeof rawSection.load === 'function') {
        const loaded = await rawSection.load()
        if (loaded instanceof Document) {
          doc = loaded
        }
      }
    } catch {
      // Continue next section if document creation fails
    }

    if (doc?.body) {
      textContent = doc.body.textContent || ''
    }

    // Determine associated chapter title for this section from TOC
    const matchingTocItem = flatToc.find((item) => matchesPath(item.normalizedPath, sectionId))
    let associatedChapterTitle = matchingTocItem ? matchingTocItem.label : null

    // If this section has an explicit heading, prioritize or record it
    if (!associatedChapterTitle && doc) {
      const headingEl = doc.querySelector('h1, h2, h3')
      const hText = headingEl?.textContent?.trim()
      if (hText && isMeaningfulChapter(hText)) {
        associatedChapterTitle = hText
      }
    }

    // Carry forward chapter if this section is an untitled continuation
    if (associatedChapterTitle) {
      lastKnownChapter = associatedChapterTitle
    } else if (lastKnownChapter) {
      associatedChapterTitle = lastKnownChapter
    }

    sections.push({
      sectionIndex: i,
      sectionId,
      doc,
      textContent,
      normalizedText: normalizeTextForSearch(textContent),
      canonicalText: canonicalizeFullText(textContent),
      strippedText: stripPunctuation(textContent),
      associatedChapterTitle,
    })
  }

  return { sections, flatToc }
}

/**
 * Resolves chapter titles for a list of annotations using an EPUB file.
 * Returns enriched annotations and the count of updated items.
 */
export async function resolveAnnotationsWithEpub(
  file: File | Blob,
  annotations: BookAnnotation[],
  onProgress?: (message: string, current: number, total: number) => void,
): Promise<{ enrichedAnnotations: BookAnnotation[]; updatedCount: number }> {
  // Filter annotations needing enrichment
  const pendingAnnotations = annotations.filter((ann) => !isMeaningfulChapter(ann.chapter))
  if (pendingAnnotations.length === 0) {
    return { enrichedAnnotations: annotations, updatedCount: 0 }
  }

  onProgress?.('正在解析本地 EPUB 目录与正文…', 0, pendingAnnotations.length)
  const { sections, flatToc } = await parseEpubForResolution(file)

  let updatedCount = 0
  const nowIso = new Date().toISOString()
  const enrichedMap = new Map<string, BookAnnotation>()

  for (let idx = 0; idx < pendingAnnotations.length; idx++) {
    const ann = pendingAnnotations[idx]
    onProgress?.(`正在匹配第 ${idx + 1}/${pendingAnnotations.length} 条批注章节…`, idx + 1, pendingAnnotations.length)

    if (!ann.quote || !ann.quote.trim()) {
      continue
    }

    // Search across sections for full content match
    for (const section of sections) {
      if (matchQuoteInSection(ann.quote, section)) {
        const resolvedChapter = resolveChapterForMatchedQuote(ann.quote, section, flatToc)
        if (resolvedChapter && isMeaningfulChapter(resolvedChapter)) {
          const updated: BookAnnotation = {
            ...ann,
            chapter: resolvedChapter,
            updatedAt: ann.updatedAt || ann.createdAt || nowIso,
          }
          enrichedMap.set(ann.id, updated)
          updatedCount++
          break
        }
      }
    }
  }

  const enrichedAnnotations = annotations.map((ann) => enrichedMap.get(ann.id) ?? ann)
  return { enrichedAnnotations, updatedCount }
}

/**
 * Enriches annotations for a specific book stored in IndexedDB using an EPUB file.
 */
export async function enrichBookAnnotationsFromEpubFile(
  bookId: string,
  file: File | Blob,
  onProgress?: (message: string, current: number, total: number) => void,
): Promise<number> {
  const localAnnotations = await listBookAnnotations(bookId)
  if (localAnnotations.length === 0) {
    return 0
  }

  const { enrichedAnnotations, updatedCount } = await resolveAnnotationsWithEpub(
    file,
    localAnnotations,
    onProgress,
  )

  if (updatedCount > 0) {
    for (const ann of enrichedAnnotations) {
      await putBookAnnotation(ann)
    }
  }

  return updatedCount
}

/**
 * Automatically checks if a book has a stored EPUB file in IndexedDB,
 * and if so, enriches any annotations lacking chapter titles.
 */
export async function enrichBookAnnotationsIfFileAvailable(bookId: string): Promise<number> {
  const storedFile = await getBookFile(bookId)
  if (!storedFile || !storedFile.blob) {
    return 0
  }

  return enrichBookAnnotationsFromEpubFile(bookId, storedFile.blob)
}

/**
 * Attempt to match an EPUB file to one of the stored books by title/creator or filename.
 */
export async function findMatchingBookForEpub(
  file: File,
  books: StoredBookMeta[],
): Promise<StoredBookMeta | null> {
  const fileNameWithoutExt = file.name.replace(/\.epub$/i, '').trim()
  const cleanFileName = normalizePathString(fileNameWithoutExt)

  // 1. Try metadata title if foliate can parse it quickly
  let epubTitle = ''
  let epubAuthor = ''
  try {
    const { makeBook } = await import('foliate-js/view.js')
    const book = await makeBook(file)
    epubTitle = (formatLanguageMap(book.metadata?.title) || '').trim()
    epubAuthor = (formatContributor(book.metadata?.author) || '').trim()
  } catch {
    // Ignore and fallback to filename
  }

  const normEpubTitle = normalizePathString(epubTitle || fileNameWithoutExt)

  for (const book of books) {
    const normBookTitle = normalizePathString(book.title)
    if (!normBookTitle) continue

    if (
      normBookTitle === normEpubTitle ||
      normBookTitle === cleanFileName ||
      cleanFileName.includes(normBookTitle) ||
      normBookTitle.includes(cleanFileName)
    ) {
      return book
    }

    // Match by author if present
    if (epubAuthor && book.creator) {
      const normAuthor = normalizePathString(epubAuthor)
      const normBookAuthor = normalizePathString(book.creator)
      if (normAuthor === normBookAuthor && normBookTitle.includes(normEpubTitle)) {
        return book
      }
    }
  }

  return null
}

/**
 * Takes one or more user-selected EPUB files, matches them to books in the system,
 * associates the file blob into IndexedDB, and enriches all annotations' chapters.
 */
export async function batchEnrichAnnotationsWithEpubFiles(
  files: File[],
  books: StoredBookMeta[],
  targetBookId?: string | null,
  onProgress?: (message: string, current: number, total: number) => void,
): Promise<{
  matchedBooksCount: number
  enrichedCount: number
  enrichedBookTitles: string[]
}> {
  let matchedBooksCount = 0
  let totalEnrichedCount = 0
  const enrichedBookTitles: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (!file.name.toLowerCase().endsWith('.epub')) {
      continue
    }

    onProgress?.(`正在处理文件《${file.name}》 (${i + 1}/${files.length})…`, i + 1, files.length)

    // If targetBookId was explicitly specified, use that book
    let targetBook = targetBookId ? books.find((b) => b.id === targetBookId) ?? null : null
    if (!targetBook) {
      targetBook = await findMatchingBookForEpub(file, books)
    }

    if (!targetBook) {
      continue
    }

    matchedBooksCount++
    // Persist file into IndexedDB so it's permanently linked
    await putBookFile(targetBook.id, file).catch(() => {})

    // Run resolution
    const enriched = await enrichBookAnnotationsFromEpubFile(targetBook.id, file, onProgress)
    if (enriched > 0) {
      totalEnrichedCount += enriched
      if (!enrichedBookTitles.includes(targetBook.title)) {
        enrichedBookTitles.push(targetBook.title)
      }
    }
  }

  return {
    matchedBooksCount,
    enrichedCount: totalEnrichedCount,
    enrichedBookTitles,
  }
}
