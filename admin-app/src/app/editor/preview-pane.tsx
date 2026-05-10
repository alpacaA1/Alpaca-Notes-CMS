import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { ResolvedContentFormat } from '../content-format'
import type { TopicBacklinkItem } from '../knowledge/wiki-links'
import type { ReadLaterSectionKey, ReadingStatus } from '../posts/parse-post'
import type { ContentType, KnowledgeSourceType } from '../posts/post-types'
import type { ReadLaterAnnotation } from '../read-later/item-types'
import { extractMarkdownHeadings, getReadLaterOutline, getReadLaterSectionAnchorId, parseReadLaterSections } from '../read-later/parse-item'

type ReadLaterAnnotationAction = 'highlight' | 'note'

type ReadLaterAnnotationDraft = Pick<ReadLaterAnnotation, 'sectionKey' | 'quote' | 'prefix' | 'suffix'>

type SelectionToolbarState = {
  top: number
  left: number
  quote: string
  annotationDraft: ReadLaterAnnotationDraft | null
}

type AnnotationActionPosition = {
  top: number
  left: number
  annotationId: string
}

type AnnotationNotePosition = {
  top: number
  left: number
  maxWidth: number
  annotationId: string
}

type PreviewImageState = {
  src: string
  alt: string
}

type OutlineScrollContainer = Window | HTMLElement

type StructuredMarkdownSection = {
  id: string
  title: string
  body: string
}

type MarkdownListKind = 'ordered' | 'unordered'

type ParsedMarkdownListItem = {
  content: string
  children: ParsedMarkdownListBlock[]
}

type ParsedMarkdownListBlock = {
  kind: MarkdownListKind
  indent: number
  items: ParsedMarkdownListItem[]
}

type TopicBacklinkDetailsBlock = {
  title: string
  meta: string
  body: string
}

type MarkdownHeadingSection = {
  id?: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  title: string
  body: string
  children: MarkdownHeadingSection[]
}

type PreviewPaneProps = {
  title: string
  date: string
  markdown: string
  contentFormat?: ResolvedContentFormat
  desc?: string
  cover?: string
  sourceName?: string
  externalUrl?: string
  readingStatus?: ReadingStatus
  sourceType?: KnowledgeSourceType
  sourceTitle?: string
  sourcePath?: string
  sourceUrl?: string
  contentType?: ContentType
  previewImageUrls?: Record<string, string>
  annotations?: ReadLaterAnnotation[]
  activeAnnotationId?: string | null
  editingAnnotationId?: string | null
  annotationNoteDraft?: string
  annotationScrollRequest?: number
  navigationRequest?: { targetId: string; requestId: number } | null
  onActiveOutlineTargetChange?: (targetId: string) => void
  onCreateAnnotation?: (draft: ReadLaterAnnotationDraft, action: ReadLaterAnnotationAction) => void
  onCreateKnowledge?: (quote: string) => void
  onSelectAnnotation?: (annotationId: string) => void
  onClearActiveAnnotation?: () => void
  onAnnotationNoteDraftChange?: (note: string) => void
  onEditAnnotation?: (annotationId: string) => void
  onSaveAnnotationNote?: (annotationId: string, note: string) => void
  onCancelAnnotationEdit?: () => void
  onDeleteAnnotation?: (annotationId: string) => void
  resolveWikiLinkTitle?: (targetKey: string) => string | null
  onOpenWikiLink?: (targetKey: string) => void
  topicBacklinks?: TopicBacklinkItem[]
  showTopicBacklinksDrawer?: boolean
}

type WikiLinkRenderOptions = {
  resolveWikiLinkTitle?: (targetKey: string) => string | null
  onOpenWikiLink?: (targetKey: string) => void
}

type MarkdownDestinationMatch = {
  value: string
  end: number
}

type MarkdownImageMatch = {
  altText: string
  imageUrl: string
  start: number
  end: number
}

const READ_LATER_ROOT_ID = 'read-later-content'
const POST_PREVIEW_ROOT_ID = 'post-preview-content'
const POST_PREVIEW_HEADING_PREFIX = 'post-preview-heading'
const SAFE_LINK_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])
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
const ACTIVE_OUTLINE_OFFSET = 120
const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': '\'',
}

function isReadLaterSectionKey(value: string | undefined): value is ReadLaterSectionKey {
  return value === 'articleExcerpt' || value === 'summary' || value === 'commentary'
}

function clearSelection() {
  window.getSelection()?.removeAllRanges()
}

function findElementById(root: ParentNode, targetId: string) {
  return Array.from(root.querySelectorAll<HTMLElement>('[id]')).find((element) => element.id === targetId) || null
}

function isWindowScrollContainer(container: OutlineScrollContainer): container is Window {
  return 'document' in container
}

function isScrollableOverflow(value: string) {
  return value === 'auto' || value === 'scroll' || value === 'overlay'
}

function findClosestScrollContainer(element: HTMLElement) {
  const ownerDocument = element.ownerDocument
  const defaultView = ownerDocument.defaultView ?? window
  let current = element.parentElement

  while (current) {
    if (current === ownerDocument.body || current === ownerDocument.documentElement) {
      break
    }

    const styles = defaultView.getComputedStyle(current)
    if (isScrollableOverflow(styles.overflowY) || isScrollableOverflow(styles.overflow)) {
      return current as OutlineScrollContainer
    }

    current = current.parentElement
  }

  return defaultView
}

function getReadLaterOutlineTargetIds(markdown: string, contentFormat: ResolvedContentFormat) {
  return [READ_LATER_ROOT_ID, ...getReadLaterOutline(markdown, contentFormat).map((item) => item.id)].filter(
    (targetId, index, ids) => ids.indexOf(targetId) === index,
  )
}

function normalizeOutlineLevels<T extends { level: number }>(items: T[]) {
  if (items.length === 0) {
    return items
  }

  const minLevel = Math.min(...items.map((item) => item.level))

  return items.map((item) => ({
    ...item,
    level: Math.max(1, item.level - minLevel + 1),
  }))
}

function buildOutlineTargetIds(rootId: string, items: Array<{ id: string }>) {
  return [rootId, ...items.map((item) => item.id)].filter((targetId, index, ids) => ids.indexOf(targetId) === index)
}

function getActiveOutlineTargetId(
  pane: HTMLElement,
  article: HTMLElement,
  targetIds: string[],
  rootId: string,
  scrollContainer: OutlineScrollContainer,
) {
  const paneTop = Math.max(
    isWindowScrollContainer(scrollContainer)
      ? pane.getBoundingClientRect().top
      : scrollContainer.getBoundingClientRect().top,
    0,
  )
  const anchorLine = paneTop + ACTIVE_OUTLINE_OFFSET
  let activeTargetId = rootId

  for (const targetId of targetIds) {
    const target = targetId === rootId ? article : findElementById(article, targetId)
    if (!target) {
      continue
    }

    if (target.getBoundingClientRect().top <= anchorLine) {
      activeTargetId = targetId
      continue
    }

    break
  }

  return activeTargetId
}

function scrollToOutlineTarget(
  pane: HTMLElement,
  article: HTMLElement,
  targetId: string,
  rootId: string,
  usePaneScroll: boolean,
  scrollContainer?: OutlineScrollContainer,
) {
  const target = targetId === rootId ? article : findElementById(article, targetId)
  if (!target) {
    return false
  }

  if (usePaneScroll) {
    const scrollPaneTo = (top: number) => {
      if (typeof pane.scrollTo === 'function') {
        pane.scrollTo({ top, behavior: 'smooth' })
        return
      }

      pane.scrollTop = top
    }

    if (targetId === rootId) {
      scrollPaneTo(0)
      return true
    }

    const paneRect = pane.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const nextTop = pane.scrollTop + targetRect.top - paneRect.top - 24
    scrollPaneTo(Math.max(0, nextTop))
    return true
  }

  const activeScrollContainer = scrollContainer ?? findClosestScrollContainer(pane)
  if (isWindowScrollContainer(activeScrollContainer)) {
    const nextTop = activeScrollContainer.scrollY + target.getBoundingClientRect().top - 108
    if (typeof activeScrollContainer.scrollTo === 'function') {
      activeScrollContainer.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
      return true
    }

    target.scrollIntoView({ block: 'start', behavior: 'smooth' })
    return true
  }

  const containerRect = activeScrollContainer.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  const nextTop = activeScrollContainer.scrollTop + targetRect.top - containerRect.top - 24

  if (typeof activeScrollContainer.scrollTo === 'function') {
    activeScrollContainer.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' })
    return true
  }

  activeScrollContainer.scrollTop = Math.max(0, nextTop)
  return true
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
  onSuppressAnnotationScroll?: () => void,
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
      onSuppressAnnotationScroll?.()
      onSelectAnnotation?.(annotation.id)
      onActivateAnnotationDelete?.(annotation.id)
    }
    mark.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        clearSelection()
        onSuppressAnnotationScroll?.()
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

function getSelectionToolbarState(selection: Selection, article: HTMLElement, isReadLater: boolean) {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (range.collapsed) {
    return null
  }

  if (!article.contains(range.commonAncestorContainer)) {
    return null
  }

  const quote = selection.toString().trim()
  if (!quote) {
    return null
  }

  const rect = range.getBoundingClientRect()
  if (!rect.width && !rect.height) {
    return null
  }

  let annotationDraft: ReadLaterAnnotationDraft | null = null
  if (isReadLater) {
    const startSection = getClosestSectionElement(range.startContainer)
    const endSection = getClosestSectionElement(range.endContainer)

    if (startSection && startSection === endSection) {
      const sectionKey = startSection.dataset.readLaterSectionKey

      if (isReadLaterSectionKey(sectionKey)) {
        const startOffset = getBoundaryTextOffset(startSection, range.startContainer, range.startOffset)
        const endOffset = getBoundaryTextOffset(startSection, range.endContainer, range.endOffset)

        if (startOffset !== null && endOffset !== null && endOffset > startOffset) {
          const fullText = startSection.textContent || ''
          annotationDraft = {
            sectionKey,
            quote: fullText.slice(startOffset, endOffset),
            prefix: fullText.slice(Math.max(0, startOffset - ANNOTATION_CONTEXT_LENGTH), startOffset),
            suffix: fullText.slice(endOffset, Math.min(fullText.length, endOffset + ANNOTATION_CONTEXT_LENGTH)),
          }
        }
      }
    }
  }

  return {
    top: Math.max(12, rect.top - 52),
    left: rect.left + rect.width / 2,
    quote,
    annotationDraft,
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

function getActiveAnnotationNotePosition(article: HTMLElement, annotationId: string): AnnotationNotePosition | null {
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

  const bottom = Math.max(...rects.map((rect) => rect.bottom))
  const left = Math.min(...rects.map((rect) => rect.left))
  const right = Math.max(...rects.map((rect) => rect.right))
  const viewportWidth = window.innerWidth || right || 0
  const maxWidth = viewportWidth ? Math.min(360, Math.max(220, viewportWidth - 32)) : 360
  const maxLeft = viewportWidth ? Math.max(16, viewportWidth - maxWidth - 16) : left

  return {
    top: bottom + 12,
    left: viewportWidth ? Math.min(Math.max(16, left), maxLeft) : left,
    maxWidth,
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

function parseMarkdownDestination(markdown: string, openParenIndex: number): MarkdownDestinationMatch | null {
  if (markdown[openParenIndex] !== '(') {
    return null
  }

  let index = openParenIndex + 1
  if (markdown[index] === '<') {
    index += 1
    const destinationStart = index

    while (index < markdown.length) {
      const character = markdown[index]
      if (character === '\\') {
        index += 2
        continue
      }

      if (character === '>') {
        const value = markdown.slice(destinationStart, index).trim()
        index += 1

        while (index < markdown.length && /\s/.test(markdown[index])) {
          index += 1
        }

        return markdown[index] === ')' ? { value, end: index + 1 } : null
      }

      index += 1
    }

    return null
  }

  const destinationStart = index
  let depth = 1

  while (index < markdown.length) {
    const character = markdown[index]
    if (character === '\\') {
      index += 2
      continue
    }

    if (character === '(') {
      depth += 1
      index += 1
      continue
    }

    if (character === ')') {
      depth -= 1
      if (depth === 0) {
        return {
          value: markdown.slice(destinationStart, index).trim(),
          end: index + 1,
        }
      }
    }

    index += 1
  }

  return null
}

function parseMarkdownImage(markdown: string, startIndex: number): MarkdownImageMatch | null {
  if (!markdown.startsWith('![', startIndex)) {
    return null
  }

  let altTextEnd = startIndex + 2
  while (altTextEnd < markdown.length) {
    const character = markdown[altTextEnd]
    if (character === '\\') {
      altTextEnd += 2
      continue
    }

    if (character === ']') {
      break
    }

    altTextEnd += 1
  }

  if (altTextEnd >= markdown.length || markdown[altTextEnd] !== ']' || markdown[altTextEnd + 1] !== '(') {
    return null
  }

  const destination = parseMarkdownDestination(markdown, altTextEnd + 1)
  if (!destination) {
    return null
  }

  return {
    altText: markdown.slice(startIndex + 2, altTextEnd),
    imageUrl: destination.value,
    start: startIndex,
    end: destination.end,
  }
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

function renderTextInline(markdown: string, wikiLinkOptions?: WikiLinkRenderOptions): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\[\[([^[\]|]+?)(?:\|([^[\]]+?))?\]\]|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g
  let lastIndex = 0
  let matchIndex = 0

  for (const match of markdown.matchAll(pattern)) {
    const [fullMatch, , wikiTargetKey, wikiLabel, linkLabel, linkHref, boldText, italicText, codeText] = match
    const start = match.index || 0

    if (start > lastIndex) {
      const renderedText = renderBareUrls(markdown.slice(lastIndex, start), matchIndex)
      nodes.push(...renderedText.nodes)
      matchIndex = renderedText.nextMatchIndex
    }

    if (wikiTargetKey) {
      const normalizedTargetKey = wikiTargetKey.trim()
      const resolvedTitle = wikiLinkOptions?.resolveWikiLinkTitle?.(normalizedTargetKey)?.trim() || ''
      const explicitLabel = wikiLabel?.trim() || ''
      const displayLabel = explicitLabel || (normalizedTargetKey.includes('/') ? resolvedTitle || normalizedTargetKey : normalizedTargetKey)
      const isResolved = Boolean(resolvedTitle)

      nodes.push(
        isResolved && wikiLinkOptions?.onOpenWikiLink ? (
          <button
            key={`inline-${matchIndex}`}
            type="button"
            className="preview-content__wiki-link"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              wikiLinkOptions.onOpenWikiLink?.(normalizedTargetKey)
            }}
          >
            {displayLabel}
          </button>
        ) : (
          <span
            key={`inline-${matchIndex}`}
            className={`preview-content__wiki-link${isResolved ? '' : ' preview-content__wiki-link--missing'}`}
          >
            {displayLabel}
          </span>
        ),
      )
    } else if (linkLabel && linkHref) {
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

function renderPlainTextInline(text: string): ReactNode[] {
  const renderedText = renderBareUrls(text, 0)
  return renderedText.nodes.length > 0 ? renderedText.nodes : [text]
}

function renderInline(markdown: string, previewImageUrls?: Record<string, string>, wikiLinkOptions?: WikiLinkRenderOptions): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let matchIndex = 0
  let searchIndex = 0

  while (searchIndex < markdown.length) {
    const imageStart = markdown.indexOf('![', searchIndex)
    if (imageStart === -1) {
      break
    }

    const imageMatch = parseMarkdownImage(markdown, imageStart)
    if (!imageMatch) {
      searchIndex = imageStart + 2
      continue
    }

    if (imageMatch.start > lastIndex) {
      nodes.push(...renderTextInline(markdown.slice(lastIndex, imageMatch.start), wikiLinkOptions))
    }

    const safeSrc = previewImageUrls?.[imageMatch.imageUrl] ?? sanitizeImageSrc(imageMatch.imageUrl)
    if (safeSrc) {
      nodes.push(<img key={`image-${matchIndex}`} src={safeSrc} alt={imageMatch.altText} referrerPolicy="no-referrer" />)
    }

    lastIndex = imageMatch.end
    searchIndex = imageMatch.end
    matchIndex += 1
  }

  if (lastIndex < markdown.length) {
    nodes.push(...renderTextInline(markdown.slice(lastIndex), wikiLinkOptions))
  }

  return nodes.length > 0 ? nodes : [markdown]
}

function parseTaskListItem(markdown: string) {
  const match = markdown.match(/^\[( |x|X)\]\s+(.*)$/)
  if (!match) {
    return null
  }

  return {
    checked: match[1].toLowerCase() === 'x',
    label: match[2],
  }
}

function getMarkdownIndentWidth(indent: string) {
  return indent.replace(/\t/g, '  ').length
}

function matchMarkdownListItem(line: string) {
  const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/)
  if (!match) {
    return null
  }

  return {
    indent: getMarkdownIndentWidth(match[1]),
    kind: /^\d+\.$/.test(match[2]) ? 'ordered' as const : 'unordered' as const,
    content: match[3],
  }
}

function appendMarkdownListContinuation(item: ParsedMarkdownListItem | undefined, line: string) {
  if (!item) {
    return
  }

  const continuation = line.trim()
  if (!continuation) {
    return
  }

  item.content = item.content ? `${item.content}\n${continuation}` : continuation
}

function parseMarkdownListBlock(lines: string[], startIndex: number) {
  const firstItem = matchMarkdownListItem(lines[startIndex])
  if (!firstItem) {
    return null
  }

  const block: ParsedMarkdownListBlock = {
    kind: firstItem.kind,
    indent: firstItem.indent,
    items: [],
  }
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      break
    }

    const matchedItem = matchMarkdownListItem(line)
    if (!matchedItem) {
      appendMarkdownListContinuation(block.items[block.items.length - 1], line)
      index += 1
      continue
    }

    if (matchedItem.indent < block.indent) {
      break
    }

    if (matchedItem.indent > block.indent) {
      const childBlock = parseMarkdownListBlock(lines, index)
      if (!childBlock) {
        appendMarkdownListContinuation(block.items[block.items.length - 1], line)
        index += 1
        continue
      }

      const parentItem = block.items[block.items.length - 1]
      if (!parentItem) {
        break
      }

      parentItem.children.push(childBlock.block)
      index = childBlock.nextIndex
      continue
    }

    if (matchedItem.kind !== block.kind) {
      break
    }

    block.items.push({
      content: matchedItem.content,
      children: [],
    })
    index += 1
  }

  return {
    block,
    nextIndex: index,
  }
}

function renderMarkdownListBlock(
  block: ParsedMarkdownListBlock,
  keyPrefix: string,
  previewImageUrls?: Record<string, string>,
  wikiLinkOptions?: WikiLinkRenderOptions,
): ReactNode {
  const isTaskList = block.kind === 'unordered' && block.items.every((item) => Boolean(parseTaskListItem(item.content)))
  const ListTag = block.kind === 'ordered' ? 'ol' : 'ul'

  return (
    <ListTag key={`${keyPrefix}-list`} className={isTaskList ? 'preview-content__task-list' : undefined}>
      {block.items.map((item, itemIndex) => {
        const task = isTaskList ? parseTaskListItem(item.content) : null

        return (
          <li key={`${keyPrefix}-item-${itemIndex}`} className={task ? 'preview-content__task-item' : undefined}>
            {task ? (
              <label className="preview-content__task-label">
                <input type="checkbox" checked={task.checked} readOnly disabled />
                <span>{renderInlineWithLineBreaks(task.label, previewImageUrls, wikiLinkOptions)}</span>
              </label>
            ) : (
              renderInlineWithLineBreaks(item.content, previewImageUrls, wikiLinkOptions)
            )}
            {item.children.map((childBlock, childIndex) =>
              renderMarkdownListBlock(childBlock, `${keyPrefix}-item-${itemIndex}-child-${childIndex}`, previewImageUrls, wikiLinkOptions),
            )}
          </li>
        )
      })}
    </ListTag>
  )
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

function renderInlineWithLineBreaks(markdown: string, previewImageUrls?: Record<string, string>, wikiLinkOptions?: WikiLinkRenderOptions) {
  const inlineNodes = renderInline(markdown, previewImageUrls, wikiLinkOptions)
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

function renderPlainTextWithLineBreaks(text: string) {
  const inlineNodes = renderPlainTextInline(text)
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
        nodes.push(<br key={`plain-line-break-${lineBreakIndex}`} />)
        lineBreakIndex += 1
      }

      if (segment) {
        nodes.push(segment)
      }
    })
  }

  return nodes.length > 0 ? nodes : [text]
}

function flushParagraph(
  lines: string[],
  nodes: ReactNode[],
  keyPrefix: string,
  previewImageUrls?: Record<string, string>,
  wikiLinkOptions?: WikiLinkRenderOptions,
) {
  if (lines.length === 0) {
    return
  }

  nodes.push(
    <p key={`${keyPrefix}-${nodes.length}`}>{renderInlineWithLineBreaks(lines.join('\n'), previewImageUrls, wikiLinkOptions)}</p>,
  )
  lines.length = 0
}

function flushPlainTextParagraph(lines: string[], nodes: ReactNode[], keyPrefix: string) {
  if (lines.length === 0) {
    return
  }

  nodes.push(
    <p key={`${keyPrefix}-${nodes.length}`}>{renderPlainTextWithLineBreaks(lines.join('\n'))}</p>,
  )
  lines.length = 0
}

function renderBlocks(
  markdown: string,
  previewImageUrls?: Record<string, string>,
  headingIdPrefix?: string,
  wikiLinkOptions?: WikiLinkRenderOptions,
) {
  const lines = markdown.split('\n')
  const nodes: ReactNode[] = []
  const paragraph: string[] = []
  const headingIds = headingIdPrefix ? extractMarkdownHeadings(markdown, headingIdPrefix) : []
  let headingIndex = 0

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls, wikiLinkOptions)
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls, wikiLinkOptions)
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6
      const HeadingTag = `h${level}` as const
      const headingId = headingIds[headingIndex]?.id
      headingIndex += 1
      nodes.push(
        <HeadingTag id={headingId} key={`heading-${nodes.length}`}>
          {renderInline(headingMatch[2], previewImageUrls, wikiLinkOptions)}
        </HeadingTag>,
      )
      continue
    }

    if (
      isTableRow(line) &&
      index + 1 < lines.length &&
      isTableDivider(lines[index + 1])
    ) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls, wikiLinkOptions)
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
                <th key={`table-head-${headerIndex}`}>{renderInline(header, previewImageUrls, wikiLinkOptions)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`table-row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`table-cell-${rowIndex}-${cellIndex}`}>{renderInline(cell, previewImageUrls, wikiLinkOptions)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
      continue
    }

    if (/^(```)/.test(trimmed)) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls, wikiLinkOptions)
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
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls, wikiLinkOptions)
      nodes.push(<hr key={`hr-${nodes.length}`} />)
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls, wikiLinkOptions)
      const quoteLines = [trimmed.replace(/^>\s?/, '')]
      while (index + 1 < lines.length && /^>\s?/.test(lines[index + 1].trim())) {
        index += 1
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''))
      }
      nodes.push(
        <blockquote key={`quote-${nodes.length}`}>
          <p>{renderInlineWithLineBreaks(quoteLines.join('\n'), previewImageUrls, wikiLinkOptions)}</p>
        </blockquote>,
      )
      continue
    }

    if (/^<details\b/.test(trimmed) && /topic-backlink-card/.test(trimmed)) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls, wikiLinkOptions)
      const detailLines = [line]
      while (index + 1 < lines.length && !/<\/details>\s*$/.test(lines[index].trim())) {
        index += 1
        detailLines.push(lines[index])
      }

      const detailBlock = parseTopicBacklinkDetailsBlock(detailLines.join('\n'))
      if (detailBlock) {
        nodes.push(
          renderTopicBacklinkDetailsBlock(
            detailBlock,
            `topic-backlink-${nodes.length}`,
            previewImageUrls,
            wikiLinkOptions,
          ),
        )
        continue
      }
    }

    const listBlock = matchMarkdownListItem(line) ? parseMarkdownListBlock(lines, index) : null
    if (listBlock) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls, wikiLinkOptions)
      nodes.push(renderMarkdownListBlock(listBlock.block, `list-${nodes.length}`, previewImageUrls, wikiLinkOptions))
      index = listBlock.nextIndex - 1
      continue
    }

    paragraph.push(trimmed)
  }

  flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls, wikiLinkOptions)

  return nodes
}

function renderPlainTextBlocks(text: string) {
  const lines = text.split('\n')
  const nodes: ReactNode[] = []
  const paragraph: string[] = []

  for (const line of lines) {
    if (!line.trim()) {
      flushPlainTextParagraph(paragraph, nodes, 'plain-paragraph')
      continue
    }

    paragraph.push(line)
  }

  flushPlainTextParagraph(paragraph, nodes, 'plain-paragraph')

  return nodes
}

function parseMarkdownHeadingSections(
  markdown: string,
  headingIdPrefix?: string,
): { lead: string; sections: MarkdownHeadingSection[] } {
  const lines = markdown.split('\n')
  const headingIds = headingIdPrefix ? extractMarkdownHeadings(markdown, headingIdPrefix) : []
  const leadLines: string[] = []
  const rootSections: MarkdownHeadingSection[] = []
  const stack: Array<MarkdownHeadingSection & { bodyLines: string[] }> = []
  let headingIndex = 0
  let isInCodeFence = false

  const appendLine = (line: string) => {
    if (stack.length > 0) {
      stack[stack.length - 1].bodyLines.push(line)
      return
    }

    leadLines.push(line)
  }

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      appendLine(line)
      isInCodeFence = !isInCodeFence
      continue
    }

    if (!isInCodeFence) {
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
      if (headingMatch) {
        const section = {
          id: headingIds[headingIndex]?.id,
          level: headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6,
          title: headingMatch[2],
          body: '',
          bodyLines: [],
          children: [],
        }
        headingIndex += 1

        while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
          const completedSection = stack.pop()
          if (!completedSection) {
            break
          }

          completedSection.body = completedSection.bodyLines.join('\n').trim()
        }

        if (stack.length > 0) {
          stack[stack.length - 1].children.push(section)
        } else {
          rootSections.push(section)
        }

        stack.push(section)
        continue
      }
    }

    appendLine(line)
  }

  while (stack.length > 0) {
    const completedSection = stack.pop()
    if (!completedSection) {
      break
    }

    completedSection.body = completedSection.bodyLines.join('\n').trim()
  }

  return {
    lead: leadLines.join('\n').trim(),
    sections: rootSections,
  }
}

function renderCollapsibleHeadingSection(
  section: MarkdownHeadingSection,
  key: string,
  previewImageUrls?: Record<string, string>,
  wikiLinkOptions?: WikiLinkRenderOptions,
): ReactNode {
  return (
    <details key={key} className={`preview-heading-group preview-heading-group--level-${section.level}`} open>
      <summary className="preview-heading-group__summary">
        <span className="preview-heading-group__icon" aria-hidden="true">
          ▸
        </span>
        <span id={section.id} className="preview-heading-group__summary-heading" role="heading" aria-level={section.level}>
          {renderInline(section.title, previewImageUrls, wikiLinkOptions)}
        </span>
      </summary>
      <div className="preview-heading-group__body">
        {section.body ? renderMarkdownContent(section.body, previewImageUrls, undefined, wikiLinkOptions) : null}
        {section.children.map((childSection, index) =>
          renderCollapsibleHeadingSection(
            childSection,
            `${key}-${childSection.id || `child-${index}`}`,
            previewImageUrls,
            wikiLinkOptions,
          ),
        )}
      </div>
    </details>
  )
}

function renderMarkdownContent(
  markdown: string,
  previewImageUrls?: Record<string, string>,
  headingIdPrefix?: string,
  wikiLinkOptions?: WikiLinkRenderOptions,
) {
  const { lead, sections } = parseMarkdownHeadingSections(markdown, headingIdPrefix)

  if (sections.length === 0) {
    return renderBlocks(markdown, previewImageUrls, headingIdPrefix, wikiLinkOptions)
  }

  return [
    ...(lead ? renderBlocks(lead, previewImageUrls, undefined, wikiLinkOptions) : []),
    ...sections.map((section, index) =>
      renderCollapsibleHeadingSection(section, section.id || `heading-section-${index}`, previewImageUrls, wikiLinkOptions),
    ),
  ]
}

export function renderContentBlocks(
  text: string,
  contentFormat: ResolvedContentFormat,
  previewImageUrls?: Record<string, string>,
  headingIdPrefix?: string,
  wikiLinkOptions?: WikiLinkRenderOptions,
) {
  return contentFormat === 'plaintext'
    ? renderPlainTextBlocks(text)
    : renderMarkdownContent(text, previewImageUrls, headingIdPrefix, wikiLinkOptions)
}

function getReadingStatusLabel(status?: ReadingStatus) {
  return status === 'done' ? '已读' : status === 'reading' ? '在读' : '未读'
}

function getReadingStatusTone(status?: ReadingStatus) {
  return status === 'done' ? 'done' : status === 'reading' ? 'reading' : 'unread'
}

function getTopicBacklinkTypeLabel(contentType: ContentType) {
  if (contentType === 'diary') {
    return '日记'
  }

  if (contentType === 'knowledge') {
    return '知识点'
  }

  return '文章'
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(amp|lt|gt|quot|#39);/g, (entity) => HTML_ENTITY_MAP[entity] || entity)
}

function parseTopicBacklinkDetailsBlock(markdown: string): TopicBacklinkDetailsBlock | null {
  const summaryMatch = markdown.match(
    /<summary[^>]*>\s*<span class="topic-backlink-card__title">([\s\S]*?)<\/span>\s*<span class="topic-backlink-card__meta">([\s\S]*?)<\/span>\s*<\/summary>/,
  )
  if (!summaryMatch) {
    return null
  }

  const body = markdown
    .replace(/^[\s\S]*?<\/summary>\s*/, '')
    .replace(/\s*<\/details>\s*$/, '')
    .trim()

  return {
    title: decodeHtmlEntities(summaryMatch[1]?.trim() || ''),
    meta: decodeHtmlEntities(summaryMatch[2]?.trim() || ''),
    body,
  }
}

function renderTopicBacklinkDetailsBlock(
  block: TopicBacklinkDetailsBlock,
  key: string,
  previewImageUrls?: Record<string, string>,
  wikiLinkOptions?: WikiLinkRenderOptions,
) {
  return (
    <details key={key} className="topic-backlink-card">
      <summary className="topic-backlink-card__summary">
        <span className="topic-backlink-card__title">{block.title}</span>
        <span className="topic-backlink-card__meta">{block.meta}</span>
        <span className="topic-backlink-card__summary-action" aria-hidden="true">
          <span className="topic-backlink-card__summary-action-label topic-backlink-card__summary-action-label--closed">展开引用</span>
          <span className="topic-backlink-card__summary-action-label topic-backlink-card__summary-action-label--open">收起引用</span>
        </span>
      </summary>
      <div className="topic-backlink-card__body">
        {renderBlocks(block.body, previewImageUrls, undefined, wikiLinkOptions)}
      </div>
    </details>
  )
}

function renderTopicBacklinkDrawerCard(backlink: TopicBacklinkItem, key: string) {
  const sourceTitle = backlink.sourceTitle.trim() || '未命名内容'
  const sourceDate = backlink.sourceDate.slice(0, 10) || '无日期'
  const sourceLabel = sourceDate !== '无日期' && sourceTitle.includes(sourceDate) ? '' : sourceTitle
  const sourceMeta = [sourceLabel, getTopicBacklinkTypeLabel(backlink.sourceContentType), sourceDate].filter(Boolean).join(' · ')
  const excerpt = backlink.excerpt.trim() || '暂无可展示摘录。'

  return (
    <details key={key} className="topic-backlink-card">
      <summary className="topic-backlink-card__summary">
        <span className="topic-backlink-card__meta">{sourceMeta}</span>
        <span className="topic-backlink-card__excerpt-preview">{excerpt}</span>
        <span className="topic-backlink-card__summary-action" aria-hidden="true">
          <span className="topic-backlink-card__summary-action-label topic-backlink-card__summary-action-label--closed">展开引用</span>
          <span className="topic-backlink-card__summary-action-label topic-backlink-card__summary-action-label--open">收起引用</span>
        </span>
      </summary>
      <div className="topic-backlink-card__body">
        <blockquote>
          <p>{renderPlainTextWithLineBreaks(excerpt)}</p>
        </blockquote>
      </div>
    </details>
  )
}

function renderReadLaterSection(
  title: string,
  content: string,
  contentFormat: ResolvedContentFormat,
  previewImageUrls: Record<string, string> | undefined,
  anchorId: string,
  sectionKey: ReadLaterSectionKey,
  wikiLinkOptions?: WikiLinkRenderOptions,
) {
  if (!content.trim()) {
    return null
  }

  return (
    <section key={title} id={anchorId} className="preview-content__section" data-read-later-section-key={sectionKey}>
      <h2>{title}</h2>
      <div className="preview-content__section-body">{renderContentBlocks(content, contentFormat, previewImageUrls, anchorId, wikiLinkOptions)}</div>
    </section>
  )
}

function renderPlainReadLaterContent(
  markdown: string,
  contentFormat: ResolvedContentFormat,
  previewImageUrls: Record<string, string> | undefined,
  wikiLinkOptions?: WikiLinkRenderOptions,
) {
  return (
    <section className="preview-content__section preview-content__section--plain" data-read-later-section-key="articleExcerpt">
      <div className="preview-content__section-body">{renderContentBlocks(markdown, contentFormat, previewImageUrls, 'read-later-content', wikiLinkOptions)}</div>
    </section>
  )
}

function renderStructuredMarkdownSection(
  section: StructuredMarkdownSection,
  previewImageUrls: Record<string, string> | undefined,
  wikiLinkOptions?: WikiLinkRenderOptions,
) {
  return (
    <details key={section.id} className="preview-content__section preview-content__section--collapsible" open>
      <summary className="preview-content__section-summary preview-heading-group__summary">
        <span className="preview-heading-group__icon" aria-hidden="true">
          ▸
        </span>
        <span id={section.id} className="preview-content__section-summary-heading" role="heading" aria-level={2}>
          {renderInline(section.title, previewImageUrls, wikiLinkOptions)}
        </span>
      </summary>
      <div className="preview-content__section-body">
        {renderContentBlocks(section.body, 'markdown', previewImageUrls, section.id, wikiLinkOptions)}
      </div>
    </details>
  )
}

function parseStructuredMarkdownSections(markdown: string): { lead: string; sections: StructuredMarkdownSection[] } {
  const lines = markdown.split('\n')
  const leadLines: string[] = []
  const sections: Array<{ title: string; lines: string[] }> = []
  let currentSection: { title: string; lines: string[] } | null = null

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/)
    if (headingMatch) {
      if (currentSection) {
        sections.push(currentSection)
      }

      currentSection = {
        title: headingMatch[1].trim(),
        lines: [],
      }
      continue
    }

    if (currentSection) {
      currentSection.lines.push(line)
    } else {
      leadLines.push(line)
    }
  }

  if (currentSection) {
    sections.push(currentSection)
  }

  return {
    lead: leadLines.join('\n').trim(),
    sections: sections
      .map((section, index) => ({
        id: `structured-section-${index + 1}`,
        title: section.title,
        body: section.lines.join('\n').trim(),
      }))
      .filter((section) => section.title || section.body),
  }
}

export default function PreviewPane({
  title,
  date,
  markdown,
  contentFormat = 'markdown',
  desc,
  cover,
  sourceName,
  externalUrl,
  readingStatus,
  sourceType,
  sourceTitle,
  sourcePath,
  sourceUrl,
  contentType = 'post',
  previewImageUrls,
  annotations = [],
  activeAnnotationId = null,
  editingAnnotationId = null,
  annotationNoteDraft,
  annotationScrollRequest = 0,
  navigationRequest = null,
  onActiveOutlineTargetChange,
  onCreateAnnotation,
  onCreateKnowledge,
  onSelectAnnotation,
  onClearActiveAnnotation,
  onAnnotationNoteDraftChange,
  onEditAnnotation,
  onSaveAnnotationNote,
  onCancelAnnotationEdit,
  onDeleteAnnotation,
  resolveWikiLinkTitle,
  onOpenWikiLink,
  topicBacklinks = [],
  showTopicBacklinksDrawer = false,
}: PreviewPaneProps) {
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null)
  const [annotationDeleteTargetId, setAnnotationDeleteTargetId] = useState<string | null>(null)
  const [activeAnnotationAction, setActiveAnnotationAction] = useState<AnnotationActionPosition | null>(null)
  const [activeAnnotationNotePosition, setActiveAnnotationNotePosition] = useState<AnnotationNotePosition | null>(null)
  const [activePostOutlineTargetId, setActivePostOutlineTargetId] = useState<string | null>(null)
  const [isTopicBacklinksDrawerOpen, setIsTopicBacklinksDrawerOpen] = useState(false)
  const [previewImage, setPreviewImage] = useState<PreviewImageState | null>(null)
  const [internalAnnotationNoteDraft, setInternalAnnotationNoteDraft] = useState('')
  const paneRef = useRef<HTMLElement | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const postOutlinePanelRef = useRef<HTMLDivElement | null>(null)
  const handledAnnotationScrollRequestRef = useRef(0)
  const suppressNextAnnotationScrollRef = useRef(false)
  const activeOutlineTargetRef = useRef<string | null>(null)
  const postOutlineScrollTimeoutRef = useRef<number | null>(null)
  const isReadLater = contentType === 'read-later'
  const isDiary = contentType === 'diary'
  const isKnowledge = contentType === 'knowledge'
  const isPreviewPost = contentType === 'post'
  const canCreateKnowledge = (contentType === 'post' || contentType === 'read-later' || contentType === 'diary') && Boolean(onCreateKnowledge)
  const readLaterSections = isReadLater ? parseReadLaterSections(markdown) : null
  const structuredSections = !isReadLater && contentFormat === 'markdown' && (isDiary || isKnowledge)
    ? parseStructuredMarkdownSections(markdown)
    : null
  const articleRootId = isReadLater ? READ_LATER_ROOT_ID : POST_PREVIEW_ROOT_ID
  const postHeadingIdPrefix = isPreviewPost && contentFormat === 'markdown' ? POST_PREVIEW_HEADING_PREFIX : undefined
  const postOutlineItems = useMemo(
    () => (
      postHeadingIdPrefix
        ? normalizeOutlineLevels(extractMarkdownHeadings(markdown, postHeadingIdPrefix))
        : []
    ),
    [markdown, postHeadingIdPrefix],
  )
  const shouldShowPostOutline = isPreviewPost && postOutlineItems.length > 0
  const readLaterOutlineTargetIds = isReadLater ? getReadLaterOutlineTargetIds(markdown, contentFormat) : []
  const outlineTargetIds = isReadLater
    ? readLaterOutlineTargetIds
    : shouldShowPostOutline
      ? buildOutlineTargetIds(articleRootId, postOutlineItems)
      : []
  const hasStructuredReadLaterSections = isReadLater
    ? Object.values(readLaterSections ?? {}).some((section) => section.trim().length > 0)
    : false
  const safeExternalUrl = externalUrl?.trim() ? sanitizeLinkHref(externalUrl.trim()) : null
  const safeCoverUrl = cover?.trim() ? sanitizeImageSrc(cover.trim()) : null
  const safeSourceUrl = sourceUrl?.trim() ? sanitizeLinkHref(sourceUrl.trim()) : null
  const shouldShowTopicBacklinksDrawer = showTopicBacklinksDrawer
  const activeAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.id === activeAnnotationId) || null,
    [activeAnnotationId, annotations],
  )
  const currentAnnotationNoteDraft = annotationNoteDraft ?? internalAnnotationNoteDraft
  const isInlineAnnotationEditing = isReadLater && activeAnnotation?.id === editingAnnotationId
  const wikiLinkOptions = useMemo(
    () => ({ resolveWikiLinkTitle, onOpenWikiLink }),
    [onOpenWikiLink, resolveWikiLinkTitle],
  )

  useEffect(() => {
    setSelectionToolbar(null)
  }, [markdown, annotations, activeAnnotationId, contentType])

  useEffect(() => {
    if (!previewImage) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewImage(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewImage])

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
    if (!editingAnnotationId) {
      setInternalAnnotationNoteDraft('')
      return
    }

    setInternalAnnotationNoteDraft(
      annotations.find((annotation) => annotation.id === editingAnnotationId)?.note || '',
    )
  }, [annotations, editingAnnotationId])

  useEffect(() => {
    setAnnotationDeleteTargetId(null)
  }, [markdown])

  useEffect(() => {
    if (!shouldShowTopicBacklinksDrawer) {
      return
    }

    setIsTopicBacklinksDrawerOpen(false)
  }, [shouldShowTopicBacklinksDrawer, sourcePath])

  useEffect(() => {
    const panel = postOutlinePanelRef.current
    if (!shouldShowPostOutline || !panel) {
      return
    }

    const clearScrollStateTimer = () => {
      if (postOutlineScrollTimeoutRef.current !== null) {
        window.clearTimeout(postOutlineScrollTimeoutRef.current)
        postOutlineScrollTimeoutRef.current = null
      }
    }

    const handleScroll = () => {
      panel.classList.add('is-scrolling')
      clearScrollStateTimer()
      postOutlineScrollTimeoutRef.current = window.setTimeout(() => {
        panel.classList.remove('is-scrolling')
        postOutlineScrollTimeoutRef.current = null
      }, 420)
    }

    panel.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      clearScrollStateTimer()
      panel.classList.remove('is-scrolling')
      panel.removeEventListener('scroll', handleScroll)
    }
  }, [shouldShowPostOutline])

  useEffect(() => {
    const shouldSyncExternalOutline = isReadLater && Boolean(onActiveOutlineTargetChange)
    const shouldSyncInternalOutline = !isReadLater && shouldShowPostOutline

    if (!shouldSyncExternalOutline && !shouldSyncInternalOutline) {
      activeOutlineTargetRef.current = null
      if (!isReadLater) {
        setActivePostOutlineTargetId(null)
      }
      return
    }

    const pane = paneRef.current
    const article = articleRef.current
    if (!pane || !article) {
      return
    }

    const scrollContainer = isReadLater ? pane : findClosestScrollContainer(pane)

    const updateActiveOutlineTarget = () => {
      const nextTargetId = getActiveOutlineTargetId(pane, article, outlineTargetIds, articleRootId, scrollContainer)
      if (activeOutlineTargetRef.current === nextTargetId) {
        return
      }

      activeOutlineTargetRef.current = nextTargetId
      if (isReadLater) {
        onActiveOutlineTargetChange?.(nextTargetId)
        return
      }

      setActivePostOutlineTargetId(nextTargetId)
    }

    updateActiveOutlineTarget()
    scrollContainer.addEventListener('scroll', updateActiveOutlineTarget, { passive: true })
    window.addEventListener('resize', updateActiveOutlineTarget)

    return () => {
      scrollContainer.removeEventListener('scroll', updateActiveOutlineTarget)
      window.removeEventListener('resize', updateActiveOutlineTarget)
    }
  }, [articleRootId, isReadLater, onActiveOutlineTargetChange, outlineTargetIds, shouldShowPostOutline])

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
        () => {
          suppressNextAnnotationScrollRef.current = true
        },
      )
    })
  }, [activeAnnotationId, annotations, isReadLater, markdown, onSelectAnnotation])

  useEffect(() => {
    if (!isReadLater || !activeAnnotationId) {
      return
    }

    if (annotationScrollRequest === 0) {
      handledAnnotationScrollRequestRef.current = 0
      return
    }

    if (handledAnnotationScrollRequestRef.current === annotationScrollRequest) {
      return
    }

    if (suppressNextAnnotationScrollRef.current) {
      suppressNextAnnotationScrollRef.current = false
      handledAnnotationScrollRequestRef.current = annotationScrollRequest
      return
    }

    const article = articleRef.current
    const activeHighlight = article?.querySelector<HTMLElement>(`mark[data-reader-annotation-id="${activeAnnotationId}"]`)
    if (activeHighlight && typeof activeHighlight.scrollIntoView === 'function') {
      handledAnnotationScrollRequestRef.current = annotationScrollRequest
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
    if (!isReadLater || !isInlineAnnotationEditing || !activeAnnotation) {
      setActiveAnnotationNotePosition(null)
      return
    }

    const pane = paneRef.current
    const article = articleRef.current
    if (!pane || !article) {
      setActiveAnnotationNotePosition(null)
      return
    }

    const updateNotePosition = () => {
      setActiveAnnotationNotePosition(getActiveAnnotationNotePosition(article, activeAnnotation.id))
    }

    updateNotePosition()
    pane.addEventListener('scroll', updateNotePosition, { passive: true })
    window.addEventListener('resize', updateNotePosition)

    return () => {
      pane.removeEventListener('scroll', updateNotePosition)
      window.removeEventListener('resize', updateNotePosition)
    }
  }, [activeAnnotation, annotations, isInlineAnnotationEditing, isReadLater, markdown])

  useEffect(() => {
    if (!isReadLater || !navigationRequest) {
      return
    }

    const pane = paneRef.current
    const article = articleRef.current
    if (!pane || !article) {
      return
    }

    scrollToOutlineTarget(pane, article, navigationRequest.targetId, articleRootId, true)
  }, [articleRootId, isReadLater, markdown, navigationRequest])

  const handlePostOutlineNavigation = (targetId: string) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()

    const pane = paneRef.current
    const article = articleRef.current
    if (!pane || !article) {
      return
    }

    activeOutlineTargetRef.current = targetId
    setActivePostOutlineTargetId(targetId)
    scrollToOutlineTarget(pane, article, targetId, articleRootId, false, findClosestScrollContainer(pane))
  }

  const previewCanvasClassName = [
    'preview-pane__canvas',
    shouldShowPostOutline && shouldShowTopicBacklinksDrawer
      ? (isTopicBacklinksDrawerOpen
        ? 'preview-pane__canvas--with-post-outline-and-topic-backlinks'
        : 'preview-pane__canvas--with-post-outline-and-topic-backlinks-collapsed')
      : shouldShowPostOutline
        ? 'preview-pane__canvas--with-post-outline'
        : shouldShowTopicBacklinksDrawer
          ? `preview-pane__canvas--with-topic-backlinks${!isTopicBacklinksDrawerOpen ? ' preview-pane__canvas--with-topic-backlinks-collapsed' : ''}`
          : '',
  ].filter(Boolean).join(' ')

  const handleSelectionChange = () => {
    const article = articleRef.current
    if ((!isReadLater || !onCreateAnnotation) && !canCreateKnowledge) {
      if (selectionToolbar) {
        setSelectionToolbar(null)
      }
      return
    }

    const selection = window.getSelection()
    if (!selection || !article) {
      setSelectionToolbar(null)
      return
    }

    const nextToolbar = getSelectionToolbarState(selection, article, isReadLater)
    setSelectionToolbar(nextToolbar)
  }

  const handleCreateAnnotationClick = (action: ReadLaterAnnotationAction) => {
    if (!selectionToolbar?.annotationDraft || !onCreateAnnotation) {
      return
    }

    onCreateAnnotation(selectionToolbar.annotationDraft, action)
    clearSelection()
    setSelectionToolbar(null)
  }

  const handleCreateKnowledgeClick = () => {
    if (!selectionToolbar || !onCreateKnowledge) {
      return
    }

    onCreateKnowledge(selectionToolbar.quote)
    clearSelection()
    setSelectionToolbar(null)
  }

  const handleArticleClick = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    const image = target.closest('img')
    if (image instanceof HTMLImageElement) {
      const nextSrc = image.currentSrc || image.getAttribute('src') || ''
      if (nextSrc) {
        setPreviewImage({
          src: nextSrc,
          alt: image.getAttribute('alt') || '预览图片',
        })
      }
      return
    }

    if (target.closest('mark[data-reader-annotation-id]')) {
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

  const handleAnnotationNoteDraftChange = (value: string) => {
    setInternalAnnotationNoteDraft(value)
    onAnnotationNoteDraftChange?.(value)
  }

  const handleInlineAnnotationSave = () => {
    if (!activeAnnotation || !onSaveAnnotationNote) {
      return
    }

    onSaveAnnotationNote(activeAnnotation.id, currentAnnotationNoteDraft)
  }

  const handleInlineAnnotationCancel = () => {
    const nextDraft = activeAnnotation?.note || ''
    setInternalAnnotationNoteDraft(nextDraft)
    onAnnotationNoteDraftChange?.(nextDraft)
    onCancelAnnotationEdit?.()
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
          {selectionToolbar.annotationDraft && onCreateAnnotation ? (
            <>
              <button type="button" onClick={() => handleCreateAnnotationClick('highlight')}>
                高亮
              </button>
              <button type="button" onClick={() => handleCreateAnnotationClick('note')}>
                批注
              </button>
            </>
          ) : null}
          {canCreateKnowledge ? (
            <button type="button" onClick={handleCreateKnowledgeClick}>
              知识点
            </button>
          ) : null}
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
      {isInlineAnnotationEditing && activeAnnotationNotePosition ? (
        <div
          className="preview-content__annotation-note-editor settings-panel__document-note-editor settings-panel__document-note-editor--annotation"
          style={{
            top: `${activeAnnotationNotePosition.top}px`,
            left: `${activeAnnotationNotePosition.left}px`,
            width: `${activeAnnotationNotePosition.maxWidth}px`,
          }}
        >
          <div className="preview-content__annotation-note-editor-header">
            <span className="settings-panel__annotation-note-label">批注</span>
            {activeAnnotation ? (
              <button
                type="button"
                className="preview-content__annotation-note-link"
                onClick={() => onEditAnnotation?.(activeAnnotation.id)}
              >
                定位到右侧
              </button>
            ) : null}
          </div>
          <textarea
            aria-label="Inline highlight document note"
            placeholder="Add a document note..."
            value={currentAnnotationNoteDraft}
            onChange={(event) => handleAnnotationNoteDraftChange(event.target.value)}
          />
          <div className="settings-panel__document-note-actions">
            <button type="button" className="settings-panel__document-note-action" onClick={handleInlineAnnotationCancel}>
              取消批注
            </button>
            <button
              type="button"
              className="settings-panel__document-note-action settings-panel__document-note-action--primary"
              onClick={handleInlineAnnotationSave}
            >
              保存批注
            </button>
          </div>
        </div>
      ) : null}
      {previewImage ? (
        <div className="confirm-dialog__overlay preview-image-viewer__overlay" onClick={() => setPreviewImage(null)}>
          <div
            className="preview-image-viewer"
            role="dialog"
            aria-modal="true"
            aria-label="图片预览"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="preview-image-viewer__close"
              aria-label="关闭图片预览"
              onClick={() => setPreviewImage(null)}
            >
              ×
            </button>
            <img src={previewImage.src} alt={previewImage.alt} referrerPolicy="no-referrer" />
            {previewImage.alt.trim() ? <p className="preview-image-viewer__caption">{previewImage.alt.trim()}</p> : null}
          </div>
        </div>
      ) : null}
      <div className={previewCanvasClassName}>
        {shouldShowPostOutline ? (
          <aside className="preview-post-outline" aria-label="文章目录">
            <div ref={postOutlinePanelRef} className="preview-post-outline__panel">
              <div className="preview-post-outline__header">
                <p className="preview-post-outline__eyebrow">文章预览</p>
                <h2>当前目录</h2>
              </div>
              <nav className="preview-post-outline__nav" aria-label="文章目录">
                <a
                  className={`preview-post-outline__item preview-post-outline__item--top${activePostOutlineTargetId === articleRootId ? ' is-active' : ''}`}
                  href={`#${articleRootId}`}
                  onClick={handlePostOutlineNavigation(articleRootId)}
                  aria-current={activePostOutlineTargetId === articleRootId ? 'location' : undefined}
                >
                  回到顶部
                </a>
                {postOutlineItems.map((item) => {
                  const isActive = activePostOutlineTargetId === item.id

                  return (
                    <a
                      key={item.id}
                      className={`preview-post-outline__item preview-post-outline__item--level-${Math.min(item.level, 4)}${isActive ? ' is-active' : ''}`}
                      href={`#${item.id}`}
                      onClick={handlePostOutlineNavigation(item.id)}
                      aria-current={isActive ? 'location' : undefined}
                    >
                      {item.label}
                    </a>
                  )
                })}
              </nav>
            </div>
          </aside>
        ) : null}
        <article
          ref={articleRef}
          className={`preview-content${isReadLater ? ' preview-content--reader' : ''}`}
          id={articleRootId}
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
            ) : isKnowledge ? (
              <div className="preview-content__read-later-meta">
                <div className="preview-content__meta-grid">
                  <span className="preview-content__meta-chip">
                    <strong>来源类型</strong>
                    <span>{sourceType === 'read-later' ? '待读' : sourceType === 'post' ? '文章' : sourceType === 'diary' ? '日记' : '手动整理'}</span>
                  </span>
                  {sourceTitle?.trim() ? (
                    <span className="preview-content__meta-chip">
                      <strong>来源内容</strong>
                      <span>{sourceTitle.trim()}</span>
                    </span>
                  ) : null}
                  {safeSourceUrl ? (
                    <a className="preview-content__meta-chip preview-content__meta-chip--link" href={safeSourceUrl} rel="noreferrer" target="_blank">
                      <strong>原链接</strong>
                      <span>打开原文</span>
                    </a>
                  ) : null}
                  {sourcePath?.trim() ? (
                    <span className="preview-content__meta-chip">
                      <strong>来源路径</strong>
                      <span>{sourcePath.trim()}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </header>
          {isReadLater && hasStructuredReadLaterSections ? (
            <div className="preview-content__sections">
              {renderReadLaterSection(
                '原文摘录',
                readLaterSections?.articleExcerpt || '',
                contentFormat,
                previewImageUrls,
                getReadLaterSectionAnchorId('articleExcerpt'),
                'articleExcerpt',
                wikiLinkOptions,
              )}
              {renderReadLaterSection(
                '我的总结',
                readLaterSections?.summary || '',
                contentFormat,
                previewImageUrls,
                getReadLaterSectionAnchorId('summary'),
                'summary',
                wikiLinkOptions,
              )}
              {renderReadLaterSection(
                '我的评论',
                readLaterSections?.commentary || '',
                contentFormat,
                previewImageUrls,
                getReadLaterSectionAnchorId('commentary'),
                'commentary',
                wikiLinkOptions,
              )}
            </div>
          ) : isReadLater ? (
            renderPlainReadLaterContent(markdown, contentFormat, previewImageUrls, wikiLinkOptions)
          ) : structuredSections && structuredSections.sections.length > 0 ? (
            <>
              {structuredSections.lead ? (
                <section className="preview-content__section preview-content__section--lead">
                  <div className="preview-content__section-body">
                    {renderContentBlocks(structuredSections.lead, contentFormat, previewImageUrls, undefined, wikiLinkOptions)}
                  </div>
                </section>
              ) : null}
              <div className="preview-content__sections">
                {structuredSections.sections.map((section) =>
                  renderStructuredMarkdownSection(section, previewImageUrls, wikiLinkOptions),
                )}
              </div>
            </>
          ) : (
            renderContentBlocks(markdown, contentFormat, previewImageUrls, postHeadingIdPrefix, wikiLinkOptions)
          )}
        </article>
        {shouldShowTopicBacklinksDrawer ? (
          <aside
            className={`preview-topic-backlinks-drawer${isTopicBacklinksDrawerOpen ? '' : ' preview-topic-backlinks-drawer--collapsed'}`}
            aria-label="反向引用抽屉"
          >
            <div className="preview-topic-backlinks-drawer__panel" id="preview-topic-backlinks-drawer-panel">
              <div className="preview-topic-backlinks-drawer__header">
                {isTopicBacklinksDrawerOpen ? (
                  <div className="preview-topic-backlinks-drawer__header-main">
                    <p className="preview-topic-backlinks-drawer__eyebrow">主题预览</p>
                    <h2>反向引用</h2>
                    <p className="preview-topic-backlinks-drawer__summary">
                      {topicBacklinks.length > 0 ? `共 ${topicBacklinks.length} 条` : '还没有其它内容引用这篇主题文章。'}
                    </p>
                  </div>
                ) : null}
                <button
                  type="button"
                  className="preview-topic-backlinks-drawer__toggle"
                  aria-label={isTopicBacklinksDrawerOpen ? '折叠反向引用抽屉' : '展开反向引用抽屉'}
                  aria-expanded={isTopicBacklinksDrawerOpen}
                  aria-controls="preview-topic-backlinks-drawer-panel"
                  onClick={() => setIsTopicBacklinksDrawerOpen((current) => !current)}
                >
                  <span className="preview-topic-backlinks-drawer__toggle-icon" aria-hidden="true">
                    {isTopicBacklinksDrawerOpen ? '→' : '←'}
                  </span>
                </button>
              </div>
              {isTopicBacklinksDrawerOpen ? (
                <>
                  {topicBacklinks.length > 0 ? (
                    <div className="preview-topic-backlinks-drawer__list">
                      {topicBacklinks.map((backlink, index) =>
                        renderTopicBacklinkDrawerCard(
                          backlink,
                          `${backlink.sourcePath}-${backlink.targetKey}-${backlink.excerpt}-${index}`,
                        ),
                      )}
                    </div>
                  ) : (
                    <p className="preview-topic-backlinks-drawer__empty">还没有其它内容引用这篇主题文章。</p>
                  )}
                </>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  )
}
