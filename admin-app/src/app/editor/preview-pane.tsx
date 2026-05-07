import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { ResolvedContentFormat } from '../content-format'
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
  annotationScrollRequest?: number
  navigationRequest?: { targetId: string; requestId: number } | null
  onActiveOutlineTargetChange?: (targetId: string) => void
  onCreateAnnotation?: (draft: ReadLaterAnnotationDraft, action: ReadLaterAnnotationAction) => void
  onCreateKnowledge?: (quote: string) => void
  onSelectAnnotation?: (annotationId: string) => void
  onClearActiveAnnotation?: () => void
  onDeleteAnnotation?: (annotationId: string) => void
  resolveWikiLinkTitle?: (targetKey: string) => string | null
  onOpenWikiLink?: (targetKey: string) => void
}

type WikiLinkRenderOptions = {
  resolveWikiLinkTitle?: (targetKey: string) => string | null
  onOpenWikiLink?: (targetKey: string) => void
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
const ACTIVE_OUTLINE_OFFSET = 120

function isReadLaterSectionKey(value: string | undefined): value is ReadLaterSectionKey {
  return value === 'articleExcerpt' || value === 'summary' || value === 'commentary'
}

function clearSelection() {
  window.getSelection()?.removeAllRanges()
}

function findElementById(root: ParentNode, targetId: string) {
  return Array.from(root.querySelectorAll<HTMLElement>('[id]')).find((element) => element.id === targetId) || null
}

function getReadLaterOutlineTargetIds(markdown: string, contentFormat: ResolvedContentFormat) {
  return ['read-later-content', ...getReadLaterOutline(markdown, contentFormat).map((item) => item.id)].filter(
    (targetId, index, ids) => ids.indexOf(targetId) === index,
  )
}

function getActiveOutlineTargetId(pane: HTMLElement, article: HTMLElement, targetIds: string[]) {
  const paneTop = Math.max(pane.getBoundingClientRect().top, 0)
  const anchorLine = paneTop + ACTIVE_OUTLINE_OFFSET
  let activeTargetId = 'read-later-content'

  for (const targetId of targetIds) {
    const target = targetId === 'read-later-content' ? article : findElementById(article, targetId)
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

  for (const match of markdown.matchAll(IMAGE_MARKDOWN_PATTERN)) {
    const [fullMatch, altText, imageUrl] = match
    const start = match.index || 0

    if (start > lastIndex) {
      nodes.push(...renderTextInline(markdown.slice(lastIndex, start), wikiLinkOptions))
    }

    const safeSrc = previewImageUrls?.[imageUrl] ?? sanitizeImageSrc(imageUrl)
    if (safeSrc) {
      nodes.push(<img key={`image-${matchIndex}`} src={safeSrc} alt={altText} referrerPolicy="no-referrer" />)
    }

    lastIndex = start + fullMatch.length
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

export function renderContentBlocks(
  text: string,
  contentFormat: ResolvedContentFormat,
  previewImageUrls?: Record<string, string>,
  headingIdPrefix?: string,
  wikiLinkOptions?: WikiLinkRenderOptions,
) {
  return contentFormat === 'plaintext'
    ? renderPlainTextBlocks(text)
    : renderBlocks(text, previewImageUrls, headingIdPrefix, wikiLinkOptions)
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
  annotationScrollRequest = 0,
  navigationRequest = null,
  onActiveOutlineTargetChange,
  onCreateAnnotation,
  onCreateKnowledge,
  onSelectAnnotation,
  onClearActiveAnnotation,
  onDeleteAnnotation,
  resolveWikiLinkTitle,
  onOpenWikiLink,
}: PreviewPaneProps) {
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarState | null>(null)
  const [annotationDeleteTargetId, setAnnotationDeleteTargetId] = useState<string | null>(null)
  const [activeAnnotationAction, setActiveAnnotationAction] = useState<AnnotationActionPosition | null>(null)
  const paneRef = useRef<HTMLElement | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const handledAnnotationScrollRequestRef = useRef(0)
  const suppressNextAnnotationScrollRef = useRef(false)
  const activeOutlineTargetRef = useRef<string | null>(null)
  const isReadLater = contentType === 'read-later'
  const isDiary = contentType === 'diary'
  const isKnowledge = contentType === 'knowledge'
  const canCreateKnowledge = (contentType === 'post' || contentType === 'read-later' || contentType === 'diary') && Boolean(onCreateKnowledge)
  const readLaterSections = isReadLater ? parseReadLaterSections(markdown) : null
  const structuredSections = !isReadLater && contentFormat === 'markdown' && (isDiary || isKnowledge)
    ? parseStructuredMarkdownSections(markdown)
    : null
  const readLaterOutlineTargetIds = isReadLater ? getReadLaterOutlineTargetIds(markdown, contentFormat) : []
  const hasStructuredReadLaterSections = isReadLater
    ? Object.values(readLaterSections ?? {}).some((section) => section.trim().length > 0)
    : false
  const safeExternalUrl = externalUrl?.trim() ? sanitizeLinkHref(externalUrl.trim()) : null
  const safeCoverUrl = cover?.trim() ? sanitizeImageSrc(cover.trim()) : null
  const safeSourceUrl = sourceUrl?.trim() ? sanitizeLinkHref(sourceUrl.trim()) : null
  const wikiLinkOptions = useMemo(
    () => ({ resolveWikiLinkTitle, onOpenWikiLink }),
    [onOpenWikiLink, resolveWikiLinkTitle],
  )

  useEffect(() => {
    setSelectionToolbar(null)
  }, [markdown, annotations, activeAnnotationId, contentType])

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
    if (!isReadLater || !onActiveOutlineTargetChange) {
      activeOutlineTargetRef.current = null
      return
    }

    const pane = paneRef.current
    const article = articleRef.current
    if (!pane || !article) {
      return
    }

    const updateActiveOutlineTarget = () => {
      const nextTargetId = getActiveOutlineTargetId(pane, article, readLaterOutlineTargetIds)
      if (activeOutlineTargetRef.current === nextTargetId) {
        return
      }

      activeOutlineTargetRef.current = nextTargetId
      onActiveOutlineTargetChange(nextTargetId)
    }

    updateActiveOutlineTarget()
    pane.addEventListener('scroll', updateActiveOutlineTarget, { passive: true })
    window.addEventListener('scroll', updateActiveOutlineTarget, { passive: true })
    window.addEventListener('resize', updateActiveOutlineTarget)

    return () => {
      pane.removeEventListener('scroll', updateActiveOutlineTarget)
      window.removeEventListener('scroll', updateActiveOutlineTarget)
      window.removeEventListener('resize', updateActiveOutlineTarget)
    }
  }, [isReadLater, onActiveOutlineTargetChange, readLaterOutlineTargetIds])

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
              {structuredSections.sections.map((section) => (
                <section key={section.id} id={section.id} className="preview-content__section">
                  <h2>{renderInline(section.title, previewImageUrls, wikiLinkOptions)}</h2>
                  <div className="preview-content__section-body">
                    {renderContentBlocks(section.body, contentFormat, previewImageUrls, section.id, wikiLinkOptions)}
                  </div>
                </section>
              ))}
            </div>
          </>
        ) : (
          renderContentBlocks(markdown, contentFormat, previewImageUrls, undefined, wikiLinkOptions)
        )}
      </article>
    </section>
  )
}
