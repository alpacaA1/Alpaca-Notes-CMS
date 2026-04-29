import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { ReadLaterSectionKey, ReadingStatus } from '../posts/parse-post'
import type { ReadLaterAnnotation } from '../read-later/item-types'
import { extractMarkdownHeadings, getReadLaterSectionAnchorId, parseReadLaterSections } from '../read-later/parse-item'

type ContentType = 'post' | 'read-later'

type ReadLaterAnnotationAction = 'highlight' | 'note'

type ReadLaterAnnotationDraft = Pick<ReadLaterAnnotation, 'sectionKey' | 'quote' | 'prefix' | 'suffix'>

type SelectionToolbarState = {
  top: number
  left: number
  draft: ReadLaterAnnotationDraft
}

type AnnotationActionPosition = {
  top: number
  left: number
  annotationId: string
}

type PreviewPaneProps = {
  title: string
  date: string
  markdown: string
  desc?: string
  cover?: string
  sourceName?: string
  externalUrl?: string
  readingStatus?: ReadingStatus
  contentType?: ContentType
  previewImageUrls?: Record<string, string>
  annotations?: ReadLaterAnnotation[]
  activeAnnotationId?: string | null
  annotationScrollRequest?: number
  navigationRequest?: { targetId: string; requestId: number } | null
  onCreateAnnotation?: (draft: ReadLaterAnnotationDraft, action: ReadLaterAnnotationAction) => void
  onSelectAnnotation?: (annotationId: string) => void
  onClearActiveAnnotation?: () => void
  onDeleteAnnotation?: (annotationId: string) => void
}

const SAFE_LINK_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])
const IMAGE_MARKDOWN_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g
const BARE_URL_SCHEME_PATTERN = /https?:\/\//gi
const BARE_URL_TERMINATOR_PATTERN = /[\s<>]/
const MID_URL_BARE_URL_TERMINATOR_CHARS = new Set(['，', '。', '！', '？', '；', '：', '“', '”', '‘', '’'])
const ALWAYS_TRAILING_BARE_URL_CHARS = new Set([
  '.',
  ',',
  '!',
  '?',
  ';',
  ':',
  '，',
  '。',
  '！',
  '？',
  '；',
  '：',
  '"',
  "'",
  '“',
  '”',
  '‘',
  '’',
])
const BARE_URL_ATTACHED_TEXT_PATTERN = /^[\p{L}\p{N}]+$/u
const BALANCED_BARE_URL_PAIRS = [
  ['(', ')'],
  ['（', '）'],
  ['[', ']'],
  ['【', '】'],
  ['{', '}'],
  ['｛', '｝'],
] as const
const ANNOTATION_CONTEXT_LENGTH = 48

function isReadLaterSectionKey(value: string | undefined): value is ReadLaterSectionKey {
  return value === 'articleExcerpt' || value === 'summary' || value === 'commentary'
}

function clearSelection() {
  window.getSelection()?.removeAllRanges()
}

function unwrapHighlight(mark: HTMLElement) {
  const parent = mark.parentNode
  if (!parent) {
    return
  }

  parent.replaceChild(mark.ownerDocument.createTextNode(mark.textContent || ''), mark)
  parent.normalize()
}

function collectTextNodes(root: Node) {
  const nodes: Text[] = []
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentNode = walker.nextNode()

  while (currentNode) {
    if (currentNode.textContent) {
      nodes.push(currentNode as Text)
    }
    currentNode = walker.nextNode()
  }

  return nodes
}

function getBoundaryTextOffset(root: HTMLElement, container: Node, offset: number) {
  const textNodes = collectTextNodes(root)
  let currentOffset = 0

  for (const textNode of textNodes) {
    if (textNode === container) {
      return currentOffset + offset
    }

    currentOffset += textNode.textContent?.length || 0
  }

  const range = root.ownerDocument.createRange()
  range.setStart(root, 0)

  try {
    range.setEnd(container, offset)
  } catch {
    return null
  }

  return range.toString().length
}

function findAnnotationTextRange(fullText: string, annotation: ReadLaterAnnotation) {
  let searchFrom = 0

  while (searchFrom <= fullText.length) {
    const start = fullText.indexOf(annotation.quote, searchFrom)
    if (start === -1) {
      return null
    }

    const end = start + annotation.quote.length
    const prefixMatches = !annotation.prefix || fullText.slice(Math.max(0, start - annotation.prefix.length), start) === annotation.prefix
    const suffixMatches = !annotation.suffix || fullText.slice(end, end + annotation.suffix.length) === annotation.suffix

    if (prefixMatches && suffixMatches) {
      return { start, end }
    }

    searchFrom = start + 1
  }

  return null
}

function highlightAnnotationInSection(
  sectionRoot: HTMLElement,
  annotation: ReadLaterAnnotation,
  isActive: boolean,
  onSelectAnnotation?: (annotationId: string) => void,
  onActivateAnnotationDelete?: (annotationId: string) => void,
) {
  const fullText = sectionRoot.textContent || ''
  if (!fullText) {
    return
  }

  const range = findAnnotationTextRange(fullText, annotation)
  if (!range || range.end <= range.start) {
    return
  }

  const textNodes = collectTextNodes(sectionRoot)
  let cursor = 0
  const segments: Array<{ node: Text; start: number; end: number }> = []

  for (const textNode of textNodes) {
    const nodeLength = textNode.textContent?.length || 0
    const nodeStart = cursor
    const nodeEnd = cursor + nodeLength
    const overlapStart = Math.max(range.start, nodeStart)
    const overlapEnd = Math.min(range.end, nodeEnd)

    if (overlapEnd > overlapStart) {
      segments.push({
        node: textNode,
        start: overlapStart - nodeStart,
        end: overlapEnd - nodeStart,
      })
    }

    cursor = nodeEnd
  }

  segments.reverse().forEach((segment) => {
    const sourceText = segment.node.textContent || ''
    const before = sourceText.slice(0, segment.start)
    const middle = sourceText.slice(segment.start, segment.end)
    const after = sourceText.slice(segment.end)
    if (!middle) {
      return
    }

    const fragment = sectionRoot.ownerDocument.createDocumentFragment()
    if (before) {
      fragment.append(sectionRoot.ownerDocument.createTextNode(before))
    }

    const mark = sectionRoot.ownerDocument.createElement('mark')
    mark.className = `preview-content__highlight${isActive ? ' is-active' : ''}`
    mark.dataset.readerAnnotationId = annotation.id
    mark.setAttribute('role', 'button')
    mark.setAttribute('tabindex', '0')
    mark.setAttribute('aria-label', `高亮：${annotation.quote.trim() || '未命名高亮'}`)
    mark.textContent = middle
    mark.onclick = () => {
      clearSelection()
      onSelectAnnotation?.(annotation.id)
      onActivateAnnotationDelete?.(annotation.id)
    }
    mark.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        clearSelection()
        onSelectAnnotation?.(annotation.id)
        onActivateAnnotationDelete?.(annotation.id)
      }
    }
    fragment.append(mark)

    if (after) {
      fragment.append(sectionRoot.ownerDocument.createTextNode(after))
    }

    segment.node.parentNode?.replaceChild(fragment, segment.node)
  })
}

function getClosestSectionElement(node: Node | null) {
  if (!node) {
    return null
  }

  if (node instanceof HTMLElement) {
    return node.closest<HTMLElement>('[data-read-later-section-key]')
  }

  return node.parentElement?.closest<HTMLElement>('[data-read-later-section-key]') || null
}

function getSelectionToolbarState(selection: Selection) {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (range.collapsed) {
    return null
  }

  const startSection = getClosestSectionElement(range.startContainer)
  const endSection = getClosestSectionElement(range.endContainer)
  if (!startSection || startSection !== endSection) {
    return null
  }

  const sectionKey = startSection.dataset.readLaterSectionKey
  if (!isReadLaterSectionKey(sectionKey)) {
    return null
  }

  const startOffset = getBoundaryTextOffset(startSection, range.startContainer, range.startOffset)
  const endOffset = getBoundaryTextOffset(startSection, range.endContainer, range.endOffset)
  if (startOffset === null || endOffset === null || endOffset <= startOffset) {
    return null
  }

  const fullText = startSection.textContent || ''
  const quote = fullText.slice(startOffset, endOffset)
  if (!quote.trim()) {
    return null
  }

  const rect = range.getBoundingClientRect()
  if (!rect.width && !rect.height) {
    return null
  }

  return {
    top: Math.max(12, rect.top - 52),
    left: rect.left + rect.width / 2,
    draft: {
      sectionKey,
      quote,
      prefix: fullText.slice(Math.max(0, startOffset - ANNOTATION_CONTEXT_LENGTH), startOffset),
      suffix: fullText.slice(endOffset, Math.min(fullText.length, endOffset + ANNOTATION_CONTEXT_LENGTH)),
    },
  }
}

function getActiveAnnotationActionPosition(article: HTMLElement, annotationId: string): AnnotationActionPosition | null {
  const highlights = Array.from(article.querySelectorAll<HTMLElement>(`mark[data-reader-annotation-id="${annotationId}"]`))
  if (highlights.length === 0) {
    return null
  }

  const rects = highlights
    .map((highlight) => highlight.getBoundingClientRect())
    .filter(
      (rect) =>
        Number.isFinite(rect.top) &&
        Number.isFinite(rect.left) &&
        Number.isFinite(rect.bottom) &&
        Number.isFinite(rect.right),
    )
  if (rects.length === 0) {
    return null
  }

  const top = Math.min(...rects.map((rect) => rect.top))
  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  const left = Math.min(...rects.map((rect) => rect.left))
  const right = Math.max(...rects.map((rect) => rect.right))
  const viewportWidth = window.innerWidth || right || 0
  const horizontalCenter = left + (right - left) / 2

  return {
    top: top > 72 ? Math.max(12, top - 44) : bottom + 12,
    left: viewportWidth ? Math.min(Math.max(24, horizontalCenter), viewportWidth - 24) : horizontalCenter,
    annotationId,
  }
}

function sanitizeLinkHref(linkHref: string) {
  const trimmedHref = linkHref.trim()

  if (!trimmedHref) {
    return null
  }

  if (trimmedHref.startsWith('//')) {
    return null
  }

  if (/^(#|\/(?!\/)|\.\.?\/|\?)/.test(trimmedHref)) {
    return trimmedHref
  }

  const normalizedHref = trimmedHref.replace(/[\u0000-\u0020\u007F]+/g, '')
  const protocolMatch = normalizedHref.match(/^([a-z][a-z0-9+.-]*):/i)
  if (!protocolMatch) {
    return trimmedHref
  }

  return SAFE_LINK_PROTOCOLS.has(protocolMatch[1].toLowerCase()) ? trimmedHref : null
}

function sanitizeImageSrc(imageSrc: string) {
  const sanitizedHref = sanitizeLinkHref(imageSrc)
  if (!sanitizedHref) {
    return null
  }

  return /^https?:|^(#|\/(?!\/)|\.\.?\/|\?)/.test(sanitizedHref) ? sanitizedHref : null
}

function hasUnmatchedBareUrlClosingCharacter(url: string, closingCharacter: string) {
  const balancedPair = BALANCED_BARE_URL_PAIRS.find(([, closing]) => closing === closingCharacter)
  if (!balancedPair) {
    return false
  }

  const [openingCharacter] = balancedPair
  const openingCount = [...url].filter((character) => character === openingCharacter).length
  const closingCount = [...url].filter((character) => character === closingCharacter).length

  return closingCount > openingCount
}

function getBareUrlAttachedTextSplitIndex(url: string) {
  const lastCommaIndex = url.lastIndexOf(',')
  if (lastCommaIndex > 0 && lastCommaIndex < url.length - 1) {
    const commaSuffix = url.slice(lastCommaIndex + 1)
    if (
      BARE_URL_ATTACHED_TEXT_PATTERN.test(commaSuffix) &&
      /[A-Za-z]/.test(commaSuffix) &&
      !url.slice(0, lastCommaIndex).includes('?') &&
      !url.slice(0, lastCommaIndex).includes('#')
    ) {
      return lastCommaIndex
    }
  }

  const lastPeriodIndex = url.lastIndexOf('.')
  if (lastPeriodIndex > 0 && lastPeriodIndex < url.length - 1) {
    const periodSuffix = url.slice(lastPeriodIndex + 1)
    if (BARE_URL_ATTACHED_TEXT_PATTERN.test(periodSuffix) && /[^\x00-\x7F]/.test(periodSuffix)) {
      return lastPeriodIndex
    }
  }

  const lastExclamationIndex = url.lastIndexOf('!')
  if (lastExclamationIndex > 0 && lastExclamationIndex < url.length - 1) {
    const exclamationSuffix = url.slice(lastExclamationIndex + 1)
    if (BARE_URL_ATTACHED_TEXT_PATTERN.test(exclamationSuffix) && /[A-Za-z]/.test(exclamationSuffix)) {
      return lastExclamationIndex
    }
  }

  const lastColonIndex = url.lastIndexOf(':')
  const schemeSeparatorIndex = url.indexOf('://')
  if (lastColonIndex > 'https://'.length && lastColonIndex < url.length - 1 && schemeSeparatorIndex >= 0) {
    const colonSuffix = url.slice(lastColonIndex + 1)
    const afterSchemeBeforeColon = url.slice(schemeSeparatorIndex + 3, lastColonIndex)
    if (
      BARE_URL_ATTACHED_TEXT_PATTERN.test(colonSuffix) &&
      /[^\x00-\x7F]/.test(colonSuffix) &&
      !afterSchemeBeforeColon.includes('/') &&
      !afterSchemeBeforeColon.includes('?') &&
      !afterSchemeBeforeColon.includes('#')
    ) {
      return lastColonIndex
    }
  }

  return -1
}

function trimBareUrlCandidate(url: string) {
  let trimmedUrl = url
  let trailingText = ''

  while (trimmedUrl) {
    const lastCharacter = trimmedUrl[trimmedUrl.length - 1]
    if (!lastCharacter) {
      break
    }

    if (lastCharacter === '/' || lastCharacter === '\\') {
      // no-op
    }

    if (ALWAYS_TRAILING_BARE_URL_CHARS.has(lastCharacter)) {
      trimmedUrl = trimmedUrl.slice(0, -1)
      trailingText = `${lastCharacter}${trailingText}`
      continue
    }

    if (hasUnmatchedBareUrlClosingCharacter(trimmedUrl, lastCharacter)) {
      trimmedUrl = trimmedUrl.slice(0, -1)
      trailingText = `${lastCharacter}${trailingText}`
      continue
    }

    const splitIndex = getBareUrlAttachedTextSplitIndex(trimmedUrl)
    if (splitIndex >= 0) {
      trailingText = `${trimmedUrl.slice(splitIndex)}${trailingText}`
      trimmedUrl = trimmedUrl.slice(0, splitIndex)
      continue
    }

    break
  }

  return { trimmedUrl, trailingText }
}

function renderBareUrls(markdown: string, startIndex: number) {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let matchIndex = startIndex

  for (const match of markdown.matchAll(BARE_URL_SCHEME_PATTERN)) {
    const start = match.index || 0
    let end = start

    while (end < markdown.length && !BARE_URL_TERMINATOR_PATTERN.test(markdown[end])) {
      const character = markdown[end]
      if (MID_URL_BARE_URL_TERMINATOR_CHARS.has(character)) {
        break
      }

      if (hasUnmatchedBareUrlClosingCharacter(markdown.slice(start, end + 1), character)) {
        break
      }

      end += 1
    }

    const matchedUrl = markdown.slice(start, end)
    const { trimmedUrl, trailingText } = trimBareUrlCandidate(matchedUrl)

    if (start > lastIndex) {
      nodes.push(markdown.slice(lastIndex, start))
    }

    const sanitizedHref = sanitizeLinkHref(trimmedUrl)

    if (sanitizedHref) {
      nodes.push(
        <a key={`inline-${matchIndex}`} href={sanitizedHref} rel="noreferrer" target="_blank">
          {trimmedUrl}
        </a>,
      )
      if (trailingText) {
        nodes.push(trailingText)
      }
    } else {
      nodes.push(matchedUrl)
    }

    lastIndex = end
    matchIndex += 1
  }

  if (lastIndex < markdown.length) {
    nodes.push(markdown.slice(lastIndex))
  }

  return {
    nodes: nodes.length > 0 ? nodes : [markdown],
    nextMatchIndex: matchIndex,
  }
}

function renderTextInline(markdown: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g
  let lastIndex = 0
  let matchIndex = 0

  for (const match of markdown.matchAll(pattern)) {
    const [fullMatch, , linkLabel, linkHref, boldText, italicText, codeText] = match
    const start = match.index || 0

    if (start > lastIndex) {
      const renderedText = renderBareUrls(markdown.slice(lastIndex, start), matchIndex)
      nodes.push(...renderedText.nodes)
      matchIndex = renderedText.nextMatchIndex
    }

    if (linkLabel && linkHref) {
      const sanitizedHref = sanitizeLinkHref(linkHref)
      nodes.push(
        sanitizedHref ? (
          <a key={`inline-${matchIndex}`} href={sanitizedHref} rel="noreferrer" target="_blank">
            {linkLabel}
          </a>
        ) : (
          <span key={`inline-${matchIndex}`}>{linkLabel}</span>
        ),
      )
    } else if (boldText) {
      nodes.push(<strong key={`inline-${matchIndex}`}>{boldText}</strong>)
    } else if (italicText) {
      nodes.push(<em key={`inline-${matchIndex}`}>{italicText}</em>)
    } else if (codeText) {
      nodes.push(<code key={`inline-${matchIndex}`}>{codeText}</code>)
    }

    lastIndex = start + fullMatch.length
    matchIndex += 1
  }

  if (lastIndex < markdown.length) {
    const renderedText = renderBareUrls(markdown.slice(lastIndex), matchIndex)
    nodes.push(...renderedText.nodes)
  }

  return nodes.length > 0 ? nodes : [markdown]
}

function renderInline(markdown: string, previewImageUrls?: Record<string, string>): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let matchIndex = 0

  for (const match of markdown.matchAll(IMAGE_MARKDOWN_PATTERN)) {
    const [fullMatch, altText, imageUrl] = match
    const start = match.index || 0

    if (start > lastIndex) {
      nodes.push(...renderTextInline(markdown.slice(lastIndex, start)))
    }

    const safeSrc = previewImageUrls?.[imageUrl] ?? sanitizeImageSrc(imageUrl)
    if (safeSrc) {
      nodes.push(<img key={`image-${matchIndex}`} src={safeSrc} alt={altText} referrerPolicy="no-referrer" />)
    }

    lastIndex = start + fullMatch.length
    matchIndex += 1
  }

  if (lastIndex < markdown.length) {
    nodes.push(...renderTextInline(markdown.slice(lastIndex)))
  }

  return nodes.length > 0 ? nodes : [markdown]
}

function splitTableCells(line: string) {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
}

function isTableRow(line: string) {
  return splitTableCells(line).length > 1
}

function isTableDivider(line: string) {
  return splitTableCells(line).every((cell) => /^:?-{3,}:?$/.test(cell))
}

function normalizeTableCells(cells: string[], columnCount: number) {
  return Array.from({ length: columnCount }, (_, index) => cells[index] ?? '')
}

function renderInlineWithLineBreaks(markdown: string, previewImageUrls?: Record<string, string>) {
  const inlineNodes = renderInline(markdown, previewImageUrls)
  const nodes: ReactNode[] = []
  let lineBreakIndex = 0

  for (const node of inlineNodes) {
    if (typeof node !== 'string') {
      nodes.push(node)
      continue
    }

    const segments = node.split('\n')
    segments.forEach((segment, index) => {
      if (index > 0) {
        nodes.push(<br key={`line-break-${lineBreakIndex}`} />)
        lineBreakIndex += 1
      }

      if (segment) {
        nodes.push(segment)
      }
    })
  }

  return nodes.length > 0 ? nodes : [markdown]
}

function flushParagraph(
  lines: string[],
  nodes: ReactNode[],
  keyPrefix: string,
  previewImageUrls?: Record<string, string>,
) {
  if (lines.length === 0) {
    return
  }

  nodes.push(
    <p key={`${keyPrefix}-${nodes.length}`}>{renderInlineWithLineBreaks(lines.join('\n'), previewImageUrls)}</p>,
  )
  lines.length = 0
}

function renderBlocks(markdown: string, previewImageUrls?: Record<string, string>, headingIdPrefix?: string) {
  const lines = markdown.split('\n')
  const nodes: ReactNode[] = []
  const paragraph: string[] = []
  const headingIds = headingIdPrefix ? extractMarkdownHeadings(markdown, headingIdPrefix) : []
  let headingIndex = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6
      const HeadingTag = `h${level}` as const
      const headingId = headingIds[headingIndex]?.id
      headingIndex += 1
      nodes.push(
        <HeadingTag id={headingId} key={`heading-${nodes.length}`}>
          {renderInline(headingMatch[2], previewImageUrls)}
        </HeadingTag>,
      )
      continue
    }

    if (
      isTableRow(line) &&
      index + 1 < lines.length &&
      isTableDivider(lines[index + 1])
    ) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      const headers = splitTableCells(line)
      const columnCount = headers.length
      const rows: string[][] = []

      index += 2
      while (index < lines.length && lines[index].trim() && isTableRow(lines[index])) {
        rows.push(normalizeTableCells(splitTableCells(lines[index]), columnCount))
        index += 1
      }
      index -= 1

      nodes.push(
        <table key={`table-${nodes.length}`}>
          <thead>
            <tr>
              {headers.map((header, headerIndex) => (
                <th key={`table-head-${headerIndex}`}>{renderInline(header, previewImageUrls)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`table-row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`table-cell-${rowIndex}-${cellIndex}`}>{renderInline(cell, previewImageUrls)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
      continue
    }

    if (/^(```)/.test(trimmed)) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```/.test(lines[index].trim())) {
        codeLines.push(lines[index])
        index += 1
      }
      nodes.push(
        <pre key={`code-${nodes.length}`}>
          <code>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      nodes.push(<hr key={`hr-${nodes.length}`} />)
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      const quoteLines = [trimmed.replace(/^>\s?/, '')]
      while (index + 1 < lines.length && /^>\s?/.test(lines[index + 1].trim())) {
        index += 1
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''))
      }
      nodes.push(
        <blockquote key={`quote-${nodes.length}`}>
          <p>{renderInlineWithLineBreaks(quoteLines.join('\n'), previewImageUrls)}</p>
        </blockquote>,
      )
      continue
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.*)$/)
    if (unorderedMatch) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      const items = [unorderedMatch[1]]
      while (index + 1 < lines.length) {
        const nextMatch = lines[index + 1].match(/^\s*[-*+]\s+(.*)$/)
        if (!nextMatch) {
          break
        }
        index += 1
        items.push(nextMatch[1])
      }
      nodes.push(
        <ul key={`ul-${nodes.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`ul-item-${itemIndex}`}>{renderInline(item, previewImageUrls)}</li>
          ))}
        </ul>,
      )
      continue
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/)
    if (orderedMatch) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      const items = [orderedMatch[1]]
      while (index + 1 < lines.length) {
        const nextMatch = lines[index + 1].match(/^\s*\d+\.\s+(.*)$/)
        if (!nextMatch) {
          break
        }
        index += 1
        items.push(nextMatch[1])
      }
      nodes.push(
        <ol key={`ol-${nodes.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`ol-item-${itemIndex}`}>{renderInline(item, previewImageUrls)}</li>
          ))}
        </ol>,
      )
      continue
    }

    paragraph.push(trimmed)
  }

  flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)

  return nodes
}

function getReadingStatusLabel(status?: ReadingStatus) {
  return status === 'done' ? '已读' : status === 'reading' ? '在读' : '未读'
}

function getReadingStatusTone(status?: ReadingStatus) {
  return status === 'done' ? 'done' : status === 'reading' ? 'reading' : 'unread'
}

function renderReadLaterSection(
  title: string,
  content: string,
  previewImageUrls: Record<string, string> | undefined,
  anchorId: string,
  sectionKey: ReadLaterSectionKey,
) {
  if (!content.trim()) {
    return null
  }

  return (
    <section key={title} id={anchorId} className="preview-content__section" data-read-later-section-key={sectionKey}>
      <h2>{title}</h2>
      <div className="preview-content__section-body">{renderBlocks(content, previewImageUrls, anchorId)}</div>
    </section>
  )
}

function renderPlainReadLaterContent(markdown: string, previewImageUrls: Record<string, string> | undefined) {
  return (
    <section className="preview-content__section preview-content__section--plain" data-read-later-section-key="articleExcerpt">
      <div className="preview-content__section-body">{renderBlocks(markdown, previewImageUrls, 'read-later-content')}</div>
    </section>
  )
}

export default function PreviewPane({
  title,
  date,
  markdown,
  desc,
  cover,
  sourceName,
  externalUrl,
  readingStatus,
  contentType = 'post',
  previewImageUrls,
  annotations = [],
  activeAnnotationId = null,
  annotationScrollRequest = 0,
  navigationRequest = null,
  onCreateAnnotation,
  onSelectAnnotation,
  onClearActiveAnnotation,
  onDeleteAnnotation,
}: PreviewPaneProps) {
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null)
  const [annotationDeleteTargetId, setAnnotationDeleteTargetId] = useState<string | null>(null)
  const [activeAnnotationAction, setActiveAnnotationAction] = useState<AnnotationActionPosition | null>(null)
  const paneRef = useRef<HTMLElement | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const isReadLater = contentType === 'read-later'
  const readLaterSections = isReadLater ? parseReadLaterSections(markdown) : null
  const hasStructuredReadLaterSections = isReadLater
    ? Object.values(readLaterSections ?? {}).some((section) => section.trim().length > 0)
    : false
  const safeExternalUrl = externalUrl?.trim() ? sanitizeLinkHref(externalUrl.trim()) : null
  const safeCoverUrl = cover?.trim() ? sanitizeImageSrc(cover.trim()) : null

  useEffect(() => {
    setSelectionToolbar(null)
  }, [markdown, annotations, activeAnnotationId])

  useEffect(() => {
    if (!annotationDeleteTargetId || annotations.some((annotation) => annotation.id === annotationDeleteTargetId)) {
      return
    }

    setAnnotationDeleteTargetId(null)
  }, [annotationDeleteTargetId, annotations])

  useEffect(() => {
    if (annotationDeleteTargetId && activeAnnotationId && activeAnnotationId !== annotationDeleteTargetId) {
      setAnnotationDeleteTargetId(null)
    }
  }, [activeAnnotationId, annotationDeleteTargetId])

  useEffect(() => {
    setAnnotationDeleteTargetId(null)
  }, [markdown])

  useEffect(() => {
    const article = articleRef.current
    if (!isReadLater || !article) {
      return
    }

    article.querySelectorAll<HTMLElement>('mark[data-reader-annotation-id]').forEach(unwrapHighlight)

    annotations.forEach((annotation) => {
      const sectionRoot = article.querySelector<HTMLElement>(`[data-read-later-section-key="${annotation.sectionKey}"]`)
      if (!sectionRoot) {
        return
      }

      highlightAnnotationInSection(
        sectionRoot,
        annotation,
        annotation.id === activeAnnotationId,
        onSelectAnnotation,
        setAnnotationDeleteTargetId,
      )
    })
  }, [activeAnnotationId, annotations, isReadLater, markdown, onSelectAnnotation])

  useEffect(() => {
    if (!isReadLater || !activeAnnotationId) {
      return
    }

    const article = articleRef.current
    const activeHighlight = article?.querySelector<HTMLElement>(`mark[data-reader-annotation-id="${activeAnnotationId}"]`)
    if (activeHighlight && typeof activeHighlight.scrollIntoView === 'function') {
      activeHighlight.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
    }
  }, [activeAnnotationId, annotationScrollRequest, annotations.length, isReadLater])

  useEffect(() => {
    if (!isReadLater || !annotationDeleteTargetId) {
      setActiveAnnotationAction(null)
      return
    }

    const pane = paneRef.current
    const article = articleRef.current
    if (!pane || !article) {
      setActiveAnnotationAction(null)
      return
    }

    const updateActionPosition = () => {
      setActiveAnnotationAction(getActiveAnnotationActionPosition(article, annotationDeleteTargetId))
    }

    updateActionPosition()
    pane.addEventListener('scroll', updateActionPosition, { passive: true })
    window.addEventListener('resize', updateActionPosition)

    return () => {
      pane.removeEventListener('scroll', updateActionPosition)
      window.removeEventListener('resize', updateActionPosition)
    }
  }, [annotationDeleteTargetId, annotations, isReadLater, markdown])

  useEffect(() => {
    if (!isReadLater || !navigationRequest) {
      return
    }

    const pane = paneRef.current
    const article = articleRef.current
    if (!pane || !article) {
      return
    }

    const scrollPaneTo = (top: number) => {
      if (typeof pane.scrollTo === 'function') {
        pane.scrollTo({ top, behavior: 'smooth' })
        return
      }

      pane.scrollTop = top
    }

    if (navigationRequest.targetId === 'read-later-content') {
      scrollPaneTo(0)
      return
    }

    const target = Array.from(article.querySelectorAll<HTMLElement>('[id]')).find(
      (element) => element.id === navigationRequest.targetId,
    )
    if (!target) {
      return
    }

    const paneRect = pane.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const nextTop = pane.scrollTop + targetRect.top - paneRect.top - 24
    scrollPaneTo(Math.max(0, nextTop))
  }, [isReadLater, markdown, navigationRequest])

  const handleSelectionChange = () => {
    if (!isReadLater || !onCreateAnnotation) {
      if (selectionToolbar) {
        setSelectionToolbar(null)
      }
      return
    }

    const selection = window.getSelection()
    if (!selection) {
      setSelectionToolbar(null)
      return
    }

    const nextToolbar = getSelectionToolbarState(selection)
    setSelectionToolbar(nextToolbar)
  }

  const handleCreateAnnotationClick = (action: ReadLaterAnnotationAction) => {
    if (!selectionToolbar || !onCreateAnnotation) {
      return
    }

    onCreateAnnotation(selectionToolbar.draft, action)
    clearSelection()
    setSelectionToolbar(null)
  }

  const handleArticleClick = (event: ReactMouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('mark[data-reader-annotation-id]')) {
      return
    }

    setAnnotationDeleteTargetId(null)
    onClearActiveAnnotation?.()
  }

  const handleDeleteAnnotationClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!activeAnnotationAction || !onDeleteAnnotation) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    clearSelection()
    onDeleteAnnotation(activeAnnotationAction.annotationId)
  }

  return (
    <section ref={paneRef} className="preview-pane preview-pane--reading-canvas">
      {selectionToolbar ? (
        <div
          className="preview-content__selection-toolbar"
          role="toolbar"
          aria-label="文本批注工具栏"
          style={{ top: `${selectionToolbar.top}px`, left: `${selectionToolbar.left}px` }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button type="button" onClick={() => handleCreateAnnotationClick('highlight')}>
            高亮
          </button>
          <button type="button" onClick={() => handleCreateAnnotationClick('note')}>
            批注
          </button>
        </div>
      ) : null}
      {activeAnnotationAction && onDeleteAnnotation ? (
        <button
          type="button"
          className="preview-content__annotation-delete"
          style={{ top: `${activeAnnotationAction.top}px`, left: `${activeAnnotationAction.left}px` }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleDeleteAnnotationClick}
        >
          删除高亮
        </button>
      ) : null}
      <article
        ref={articleRef}
        className={`preview-content${isReadLater ? ' preview-content--reader' : ''}`}
        id="read-later-content"
        onClick={handleArticleClick}
        onMouseUp={handleSelectionChange}
        onKeyUp={handleSelectionChange}
      >
        <header className={`preview-content__header${isReadLater ? ' preview-content__header--reader' : ''}`}>
          <h1>{title.trim() || '未命名草稿'}</h1>
          <p className="preview-content__date">{date}</p>
          {isReadLater ? (
            <div className="preview-content__read-later-meta">
              {desc?.trim() ? <p className="preview-content__summary preview-content__summary--reader">{desc.trim()}</p> : null}
              <div className="preview-content__meta-grid">
                {sourceName?.trim() ? (
                  <span className="preview-content__meta-chip">
                    <strong>来源</strong>
                    <span>{sourceName.trim()}</span>
                  </span>
                ) : null}
                <span className={`preview-content__meta-chip preview-content__meta-chip--status preview-content__meta-chip--${getReadingStatusTone(readingStatus)}`}>
                  <strong>状态</strong>
                  <span>{getReadingStatusLabel(readingStatus)}</span>
                </span>
                {safeExternalUrl ? (
                  <a className="preview-content__meta-chip preview-content__meta-chip--link" href={safeExternalUrl} rel="noreferrer" target="_blank">
                    <strong>原文</strong>
                    <span>阅读原文</span>
                  </a>
                ) : null}
              </div>
              {safeCoverUrl ? <img className="preview-content__cover" src={safeCoverUrl} alt={title.trim() || '待读封面'} referrerPolicy="no-referrer" /> : null}
            </div>
          ) : null}
        </header>
        {isReadLater && hasStructuredReadLaterSections ? (
          <div className="preview-content__sections">
            {renderReadLaterSection(
              '原文摘录',
              readLaterSections?.articleExcerpt || '',
              previewImageUrls,
              getReadLaterSectionAnchorId('articleExcerpt'),
              'articleExcerpt',
            )}
            {renderReadLaterSection(
              '我的总结',
              readLaterSections?.summary || '',
              previewImageUrls,
              getReadLaterSectionAnchorId('summary'),
              'summary',
            )}
            {renderReadLaterSection(
              '我的评论',
              readLaterSections?.commentary || '',
              previewImageUrls,
              getReadLaterSectionAnchorId('commentary'),
              'commentary',
            )}
          </div>
        ) : isReadLater ? (
          renderPlainReadLaterContent(markdown, previewImageUrls)
        ) : (
          renderBlocks(markdown, previewImageUrls)
        )}
      </article>
    </section>
  )
}
