import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type Ref } from 'react'
import type { ResolvedContentFormat } from '../content-format'
import type { InternalReferenceCandidate } from '../internal-links'
import type { ContentType, KnowledgeSourceType } from '../posts/post-types'
import MarkdownEditor, { type MarkdownEditorHandle, type MarkdownEditorSelectionBoundaryDrag, type SelectionRange } from './markdown-editor'
import LiveRichParagraphEditor, {
  hasRenderableInlineMarkdown,
  type LiveRichParagraphEditorHandle,
} from './live-rich-paragraph-editor'
import { renderContentBlocks } from './preview-pane'

type EditableLiveContentType = Exclude<ContentType, 'read-later'>

type LiveMarkdownEditorProps = {
  documentKey?: string
  value: string
  title: string
  date: string
  contentType: EditableLiveContentType
  contentFormat?: ResolvedContentFormat
  sourceType?: KnowledgeSourceType
  sourceTitle?: string
  sourcePath?: string
  sourceUrl?: string
  previewImageUrls?: Record<string, string>
  onChange: (value: string) => void
  onToggleImmersive?: () => void
  isImmersive?: boolean
  onUploadImage?: (file: File) => Promise<{ markdown: string }>
  internalReferenceCandidates?: InternalReferenceCandidate[]
  resolveWikiLinkTitle?: (targetKey: string) => string | null
  onOpenWikiLink?: (targetKey: string) => void
  resolveInternalReferenceTitle?: (targetKey: string) => string | null
  onOpenInternalReference?: (targetKey: string) => void
}

type FocusPlacement = SelectionRange | 'start' | 'end'

type LiveNodeKind = 'paragraph' | 'heading' | 'list' | 'blockquote' | 'code-fence' | 'thematic-break'

type LiveNode = {
  id: string
  kind: LiveNodeKind
  text: string
}

type LiveEditorHistoryEntry = {
  value: string
  nodes: LiveNode[]
  activeNodeIndex: number
  focusPlacement: FocusPlacement
  richEditingNodeId: string | null
  plainSelectionNodeId: string | null
}

type ParsedNode = {
  kind: LiveNodeKind
  text: string
}

type ParsedHeadingNode = {
  level: number
  prefix: string
  content: string
}

type LiveEditableHandle = MarkdownEditorHandle | LiveRichParagraphEditorHandle

type SelectionRestoreRequest = MarkdownEditorSelectionBoundaryDrag & {
  nodeId: string
}

type SelectionNodeBoundary = {
  nodeIndex: number
  offset: number
}

const MAX_LIVE_EDITOR_HISTORY_ENTRIES = 200

function isBlankLine(line: string) {
  return line.trim().length === 0
}

function isFenceLine(line: string) {
  return /^(\s*)(```+|~~~+)/.test(line)
}

function getFenceMarker(line: string) {
  return line.match(/^(\s*)(```+|~~~+)/)?.[2] ?? null
}

function isHeadingLine(line: string) {
  return /^#{1,6}\s+/.test(line)
}

function isHorizontalRule(line: string) {
  return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
}

function isListLine(line: string) {
  return /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line)
}

function isBlockquoteLine(line: string) {
  return /^\s*>\s?/.test(line)
}

function isIndentedContinuationLine(line: string) {
  return /^\s{2,}\S/.test(line)
}

function sliceLines(lines: string[], startLine: number, endLine: number) {
  return lines.slice(startLine, endLine + 1).join('\n')
}

function inferNodeKind(markdown: string): LiveNodeKind {
  const firstLine = markdown.split('\n').find((line) => line.trim().length > 0) ?? ''

  if (isFenceLine(firstLine)) {
    return 'code-fence'
  }

  if (isHeadingLine(firstLine)) {
    return 'heading'
  }

  if (isHorizontalRule(firstLine)) {
    return 'thematic-break'
  }

  if (isListLine(firstLine)) {
    return 'list'
  }

  if (isBlockquoteLine(firstLine)) {
    return 'blockquote'
  }

  return 'paragraph'
}

function getHeadingLevel(markdown: string) {
  const firstLine = markdown.split('\n').find((line) => line.trim().length > 0) ?? ''
  const match = firstLine.match(/^(#{1,6})\s+/)
  return match ? match[1].length : null
}

function parseHeadingNode(markdown: string): ParsedHeadingNode | null {
  const firstLine = markdown.split('\n').find((line) => line.trim().length > 0) ?? ''
  const match = firstLine.match(/^(#{1,6}\s+)(.*)$/)
  if (!match) {
    return null
  }

  return {
    level: match[1].trim().length,
    prefix: match[1],
    content: match[2],
  }
}

function normalizeSingleLineText(value: string) {
  return value.replace(/\r/g, '').replace(/\s*\n+\s*/g, ' ')
}

function parseMarkdownNodes(markdown: string): ParsedNode[] {
  if (!markdown.trim()) {
    return []
  }

  const lines = markdown.split('\n')
  const nodes: ParsedNode[] = []
  let lineIndex = 0

  while (lineIndex < lines.length) {
    if (isBlankLine(lines[lineIndex])) {
      lineIndex += 1
      continue
    }

    const startLine = lineIndex
    let endLine = lineIndex
    const kind = inferNodeKind(lines[lineIndex])

    if (kind === 'code-fence') {
      const marker = getFenceMarker(lines[lineIndex])
      lineIndex += 1

      while (lineIndex < lines.length) {
        endLine = lineIndex
        if (marker && lines[lineIndex].trim().startsWith(marker)) {
          lineIndex += 1
          break
        }
        lineIndex += 1
      }
    } else if (kind === 'heading' || kind === 'thematic-break') {
      lineIndex += 1
    } else if (kind === 'list') {
      lineIndex += 1

      while (lineIndex < lines.length) {
        const currentLine = lines[lineIndex]
        if (isBlankLine(currentLine)) {
          break
        }
        if (isListLine(currentLine) || isIndentedContinuationLine(currentLine)) {
          endLine = lineIndex
          lineIndex += 1
          continue
        }
        break
      }
    } else if (kind === 'blockquote') {
      lineIndex += 1

      while (lineIndex < lines.length && isBlockquoteLine(lines[lineIndex])) {
        endLine = lineIndex
        lineIndex += 1
      }
    } else {
      lineIndex += 1

      while (lineIndex < lines.length) {
        const currentLine = lines[lineIndex]
        if (
          isBlankLine(currentLine) ||
          isFenceLine(currentLine) ||
          isHeadingLine(currentLine) ||
          isHorizontalRule(currentLine) ||
          isListLine(currentLine) ||
          isBlockquoteLine(currentLine)
        ) {
          break
        }

        endLine = lineIndex
        lineIndex += 1
      }
    }

    nodes.push({
      kind,
      text: sliceLines(lines, startLine, endLine),
    })
  }

  return nodes
}

function serializeNodes(nodes: LiveNode[]) {
  const compactNodes = nodes
    .map((node) => node.text.trim().length === 0 ? null : node.text.replace(/\n+$/g, ''))
    .filter((node): node is string => Boolean(node))

  if (compactNodes.length === 0) {
    return ''
  }

  return compactNodes.join('\n\n')
}

function cloneNodes(nodes: LiveNode[]) {
  return nodes.map((node) => ({ ...node }))
}

function getSafeActiveIndex(nodes: LiveNode[], requestedIndex: number) {
  if (nodes.length === 0) {
    return 0
  }

  return Math.min(Math.max(requestedIndex, 0), nodes.length - 1)
}

function hasNonCollapsedTextSelection(ownerDocument: Document) {
  const selection = ownerDocument.defaultView?.getSelection()
  return Boolean(selection && !selection.isCollapsed && selection.toString().length > 0)
}

function rangeIntersectsElement(range: Range, element: HTMLElement) {
  try {
    return range.intersectsNode(element)
  } catch {
    return false
  }
}

function getCaretRangeFromPoint(ownerDocument: Document, clientX: number, clientY: number) {
  const documentWithCaret = ownerDocument as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }

  const caretRange = documentWithCaret.caretRangeFromPoint?.(clientX, clientY)
  if (caretRange) {
    return caretRange
  }

  const caretPosition = documentWithCaret.caretPositionFromPoint?.(clientX, clientY)
  if (!caretPosition) {
    return null
  }

  const range = ownerDocument.createRange()
  range.setStart(caretPosition.offsetNode, caretPosition.offset)
  range.collapse(true)
  return range
}

function getTextNodeForElement(element: HTMLElement) {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  return walker.nextNode() as Text | null
}

function clampTextOffset(textNode: Text, offset: number) {
  return Math.min(Math.max(offset, 0), textNode.data.length)
}

function clampOffset(offset: number, maxOffset: number) {
  return Math.min(Math.max(offset, 0), maxOffset)
}

function getCaretRangeWithinElement(element: HTMLElement, clientX: number, clientY: number) {
  const ownerDocument = element.ownerDocument
  const caretRange = getCaretRangeFromPoint(ownerDocument, clientX, clientY)
  if (!caretRange || !element.contains(caretRange.startContainer)) {
    return null
  }

  return caretRange
}

function getRenderedTextOffsetFromRange(element: HTMLElement, caretRange: Range) {
  if (caretRange.startContainer.nodeType === Node.TEXT_NODE) {
    const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let offset = 0

    while (true) {
      const textNode = walker.nextNode() as Text | null
      if (!textNode) {
        break
      }

      if (textNode === caretRange.startContainer) {
        return offset + caretRange.startOffset
      }

      offset += textNode.data.length
    }
  }

  const ownerDocument = element.ownerDocument
  const offsetRange = ownerDocument.createRange()
  try {
    offsetRange.selectNodeContents(element)
    offsetRange.setEnd(caretRange.startContainer, caretRange.startOffset)
  } catch {
    return null
  }

  return offsetRange.toString().length
}

function getElementFromNode(node: Node) {
  return node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement
}

function isVisibleRenderedTextNode(textNode: Text) {
  const parentElement = textNode.parentElement
  if (!parentElement || textNode.data.length === 0) {
    return false
  }

  return !parentElement.closest('[aria-hidden="true"], button, input, textarea, select, option')
}

function findFirstVisibleTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text
    return isVisibleRenderedTextNode(textNode) ? textNode : null
  }

  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return null
  }

  for (const childNode of Array.from(node.childNodes)) {
    const textNode = findFirstVisibleTextNode(childNode)
    if (textNode) {
      return textNode
    }
  }

  return null
}

function findLastVisibleTextNode(node: Node): Text | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const textNode = node as Text
    return isVisibleRenderedTextNode(textNode) ? textNode : null
  }

  if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
    return null
  }

  const childNodes = Array.from(node.childNodes)
  for (let index = childNodes.length - 1; index >= 0; index -= 1) {
    const textNode = findLastVisibleTextNode(childNodes[index])
    if (textNode) {
      return textNode
    }
  }

  return null
}

function findFirstVisibleTextNodeAtOrAfter(root: HTMLElement, container: Node, offset: number) {
  if (container.nodeType === Node.TEXT_NODE) {
    const textNode = container as Text
    if (isVisibleRenderedTextNode(textNode)) {
      return {
        textNode,
        offset: clampTextOffset(textNode, offset),
      }
    }
  }

  let currentNode: Node | null = container
  let childOffset = offset

  while (currentNode && root.contains(currentNode)) {
    const childNodes = Array.from(currentNode.childNodes)
    for (let index = childOffset; index < childNodes.length; index += 1) {
      const textNode = findFirstVisibleTextNode(childNodes[index])
      if (textNode) {
        return {
          textNode,
          offset: 0,
        }
      }
    }

    if (currentNode === root) {
      break
    }

    const parentNode = currentNode.parentNode
    if (!parentNode) {
      break
    }

    childOffset = Array.prototype.indexOf.call(parentNode.childNodes, currentNode) + 1
    currentNode = parentNode
  }

  return null
}

function findLastVisibleTextNodeAtOrBefore(root: HTMLElement, container: Node, offset: number) {
  if (container.nodeType === Node.TEXT_NODE) {
    const textNode = container as Text
    if (isVisibleRenderedTextNode(textNode)) {
      return {
        textNode,
        offset: clampTextOffset(textNode, offset),
      }
    }
  }

  let currentNode: Node | null = container
  let childOffset = offset

  while (currentNode && root.contains(currentNode)) {
    const childNodes = Array.from(currentNode.childNodes)
    for (let index = childOffset - 1; index >= 0; index -= 1) {
      const textNode = findLastVisibleTextNode(childNodes[index])
      if (textNode) {
        return {
          textNode,
          offset: textNode.data.length,
        }
      }
    }

    if (currentNode === root) {
      break
    }

    const parentNode = currentNode.parentNode
    if (!parentNode) {
      break
    }

    childOffset = Array.prototype.indexOf.call(parentNode.childNodes, currentNode)
    currentNode = parentNode
  }

  return null
}

function getMarkdownOffsetForTextNode(root: HTMLElement, markdown: string, targetTextNode: Text, targetOffset: number) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let searchStart = 0

  while (true) {
    const textNode = walker.nextNode() as Text | null
    if (!textNode) {
      break
    }

    if (!isVisibleRenderedTextNode(textNode)) {
      continue
    }

    const text = textNode.data
    const foundOffset = markdown.indexOf(text, searchStart)
    if (textNode === targetTextNode) {
      if (foundOffset === -1) {
        return null
      }

      return foundOffset + clampTextOffset(textNode, targetOffset)
    }

    if (foundOffset !== -1) {
      searchStart = foundOffset + text.length
    }
  }

  return null
}

function getMarkdownOffsetFromDomBoundary(
  root: HTMLElement,
  markdown: string,
  container: Node,
  offset: number,
  boundary: 'start' | 'end',
) {
  const textPosition = boundary === 'start'
    ? findFirstVisibleTextNodeAtOrAfter(root, container, offset)
    : findLastVisibleTextNodeAtOrBefore(root, container, offset)

  if (!textPosition) {
    return boundary === 'start' ? markdown.length : 0
  }

  return getMarkdownOffsetForTextNode(root, markdown, textPosition.textNode, textPosition.offset)
}

function getSelectedNodeBoundary(
  blockElement: HTMLElement,
  node: LiveNode,
  container: Node,
  offset: number,
  boundary: 'start' | 'end',
): SelectionNodeBoundary | null {
  const nodeIndex = Number(blockElement.dataset.liveNodeIndex)
  if (!Number.isInteger(nodeIndex)) {
    return null
  }

  return {
    nodeIndex,
    offset: clampOffset(
      getMarkdownOffsetFromDomBoundary(blockElement, node.text, container, offset, boundary) ??
        (boundary === 'start' ? 0 : node.text.length),
      node.text.length,
    ),
  }
}

function isSelectionInsideSingleRichEditor(article: HTMLElement, range: Range) {
  const startEditable = getElementFromNode(range.startContainer)?.closest<HTMLElement>('[contenteditable="true"]')
  const endEditable = getElementFromNode(range.endContainer)?.closest<HTMLElement>('[contenteditable="true"]')
  return Boolean(startEditable && startEditable === endEditable && article.contains(startEditable))
}

function getNodeBlockElements(article: HTMLElement) {
  return Array.from(article.querySelectorAll<HTMLElement>('[data-live-node-index]'))
}

function getNodeBlockFromBoundary(article: HTMLElement, container: Node, boundary: 'start' | 'end') {
  const containerElement = getElementFromNode(container)
  const containingBlock = containerElement?.closest<HTMLElement>('[data-live-node-index]')
  if (containingBlock && article.contains(containingBlock)) {
    return containingBlock
  }

  const blocks = getNodeBlockElements(article)
  return boundary === 'start' ? blocks[0] ?? null : blocks[blocks.length - 1] ?? null
}

function getSelectedNodeBoundaries(article: HTMLElement, range: Range, nodes: LiveNode[]) {
  const allBlocks = getNodeBlockElements(article)
  const startBlock = getNodeBlockFromBoundary(article, range.startContainer, 'start')
  const endBlock = getNodeBlockFromBoundary(article, range.endContainer, 'end')

  if (!startBlock || !endBlock) {
    return null
  }

  const startBlockPosition = allBlocks.indexOf(startBlock)
  const endBlockPosition = allBlocks.indexOf(endBlock)
  if (startBlockPosition === -1 || endBlockPosition === -1 || startBlockPosition > endBlockPosition) {
    return null
  }

  const startNodeIndex = Number(startBlock.dataset.liveNodeIndex)
  const endNodeIndex = Number(endBlock.dataset.liveNodeIndex)
  const startNode = nodes[startNodeIndex]
  const endNode = nodes[endNodeIndex]

  if (!startNode || !endNode) {
    return null
  }

  const start = startBlock.contains(range.startContainer)
    ? getSelectedNodeBoundary(startBlock, startNode, range.startContainer, range.startOffset, 'start')
    : { nodeIndex: startNodeIndex, offset: 0 }
  const end = endBlock.contains(range.endContainer)
    ? getSelectedNodeBoundary(endBlock, endNode, range.endContainer, range.endOffset, 'end')
    : { nodeIndex: endNodeIndex, offset: endNode.text.length }

  if (!start || !end) {
    return null
  }

  return { start, end }
}

function getDeleteFocusPlacement(markdown: string, rawOffset: number): SelectionRange {
  const parsedHeadingNode = parseHeadingNode(markdown)
  if (parsedHeadingNode) {
    const headingOffset = clampOffset(rawOffset - parsedHeadingNode.prefix.length, parsedHeadingNode.content.length)
    return { start: headingOffset, end: headingOffset }
  }

  const safeOffset = clampOffset(rawOffset, markdown.length)
  return { start: safeOffset, end: safeOffset }
}

function getRenderedClickFocusPlacement(node: LiveNode, element: HTMLElement, clientX: number, clientY: number): FocusPlacement {
  const caretRange = getCaretRangeWithinElement(element, clientX, clientY)
  if (!caretRange) {
    return 'end'
  }

  const parsedHeadingNode = node.kind === 'heading' ? parseHeadingNode(node.text) : null
  if (parsedHeadingNode) {
    const targetElement = getElementFromNode(caretRange.startContainer)
    const headingElement = targetElement?.closest<HTMLElement>('h1, h2, h3, h4, h5, h6, [role="heading"]')
    const renderedOffset = headingElement && element.contains(headingElement)
      ? getRenderedTextOffsetFromRange(headingElement, caretRange)
      : getRenderedTextOffsetFromRange(element, caretRange)
    if (renderedOffset === null) {
      return 'end'
    }

    const nextOffset = clampOffset(renderedOffset, parsedHeadingNode.content.length)
    return { start: nextOffset, end: nextOffset }
  }

  const renderedOffset = getRenderedTextOffsetFromRange(element, caretRange)
  if (renderedOffset === null) {
    return 'end'
  }

  const renderedText = element.textContent ?? ''
  const canUseRenderedOffset =
    node.kind === 'paragraph' &&
    (hasRenderableInlineMarkdown(node.text) || renderedText === node.text)

  if (!canUseRenderedOffset) {
    return 'end'
  }

  const nextOffset = clampOffset(renderedOffset, node.text.length)
  return { start: nextOffset, end: nextOffset }
}

export default function LiveMarkdownEditor({
  documentKey,
  value,
  contentFormat,
  previewImageUrls,
  onChange,
  onToggleImmersive,
  isImmersive = false,
  onUploadImage,
  internalReferenceCandidates = [],
  resolveWikiLinkTitle,
  onOpenWikiLink,
  resolveInternalReferenceTitle,
  onOpenInternalReference,
}: LiveMarkdownEditorProps) {
  const nextNodeIdRef = useRef(0)
  const activeEditorRef = useRef<LiveEditableHandle | null>(null)
  const fallbackUploadInputRef = useRef<HTMLInputElement | null>(null)
  const expectedValueRef = useRef<string | null>(null)
  const articleRef = useRef<HTMLElement | null>(null)
  const undoStackRef = useRef<LiveEditorHistoryEntry[]>([])
  const redoStackRef = useRef<LiveEditorHistoryEntry[]>([])

  const createNode = (partial?: Partial<Omit<LiveNode, 'id'>>) => ({
    id: `live-node-${nextNodeIdRef.current += 1}`,
    kind: partial?.kind ?? 'paragraph',
    text: partial?.text ?? '',
  })

  const normalizeNodes = (markdown: string) => {
    const parsedNodes = parseMarkdownNodes(markdown).map((node) => createNode(node))
    return parsedNodes.length > 0 ? parsedNodes : [createNode()]
  }

  const [nodes, setNodes] = useState<LiveNode[]>(() => normalizeNodes(value))
  const [activeNodeIndex, setActiveNodeIndex] = useState(() => Math.max(0, normalizeNodes(value).length - 1))
  const [focusPlacement, setFocusPlacement] = useState<FocusPlacement>('end')
  const [richEditingNodeId, setRichEditingNodeId] = useState<string | null>(null)
  const [plainSelectionNodeId, setPlainSelectionNodeId] = useState<string | null>(null)
  const [selectionRestoreRequest, setSelectionRestoreRequest] = useState<SelectionRestoreRequest | null>(null)
  const [selectAllRequestId, setSelectAllRequestId] = useState(0)
  const wikiLinkOptions = useMemo(
    () => ({ resolveWikiLinkTitle, onOpenWikiLink, resolveInternalReferenceTitle, onOpenInternalReference }),
    [onOpenInternalReference, onOpenWikiLink, resolveInternalReferenceTitle, resolveWikiLinkTitle],
  )

  const serializedValue = useMemo(() => serializeNodes(nodes), [nodes])

  const createHistoryEntry = (): LiveEditorHistoryEntry => ({
    value: serializedValue,
    nodes: cloneNodes(nodes),
    activeNodeIndex,
    focusPlacement,
    richEditingNodeId,
    plainSelectionNodeId,
  })

  const pushHistoryEntry = (
    stack: { current: LiveEditorHistoryEntry[] },
    entry: LiveEditorHistoryEntry,
  ) => {
    const lastEntry = stack.current[stack.current.length - 1]
    if (lastEntry && lastEntry.value === entry.value) {
      stack.current[stack.current.length - 1] = entry
      return
    }

    stack.current.push(entry)
    if (stack.current.length > MAX_LIVE_EDITOR_HISTORY_ENTRIES) {
      stack.current.shift()
    }
  }

  const recordHistoryEntry = () => {
    pushHistoryEntry(undoStackRef, createHistoryEntry())
    redoStackRef.current = []
  }

  const applyHistoryEntry = (entry: LiveEditorHistoryEntry) => {
    const nextNodes = entry.nodes.length > 0 ? cloneNodes(entry.nodes) : [createNode()]
    const nextActiveIndex = entry.activeNodeIndex === -1 ? -1 : getSafeActiveIndex(nextNodes, entry.activeNodeIndex)

    setNodes(nextNodes)
    setActiveNodeIndex(nextActiveIndex)
    setFocusPlacement(entry.focusPlacement)
    setRichEditingNodeId(entry.richEditingNodeId)
    setPlainSelectionNodeId(entry.plainSelectionNodeId)
    setSelectionRestoreRequest(null)
    expectedValueRef.current = entry.value
  }

  useEffect(() => {
    if (expectedValueRef.current === value) {
      expectedValueRef.current = null
      return
    }

    if (expectedValueRef.current !== null) {
      return
    }

    if (value === serializedValue) {
      return
    }

    const nextNodes = normalizeNodes(value)
    undoStackRef.current = []
    redoStackRef.current = []
    setNodes(nextNodes)
    setActiveNodeIndex(Math.max(0, nextNodes.length - 1))
    setFocusPlacement('end')
    setPlainSelectionNodeId(null)
    setSelectionRestoreRequest(null)
  }, [serializedValue, value])

  useEffect(() => {
    expectedValueRef.current = null
    undoStackRef.current = []
    redoStackRef.current = []
    const nextNodes = normalizeNodes(value)
    setNodes(nextNodes)
    setActiveNodeIndex(Math.max(0, nextNodes.length - 1))
    setFocusPlacement('end')
    setRichEditingNodeId(null)
    setPlainSelectionNodeId(null)
    setSelectionRestoreRequest(null)
  }, [documentKey])

  useLayoutEffect(() => {
    const restoreRequest = selectionRestoreRequest
    if (!restoreRequest || plainSelectionNodeId !== restoreRequest.nodeId) {
      return
    }

    const rawBlock = articleRef.current?.querySelector<HTMLElement>(`[data-live-selection-node-id="${restoreRequest.nodeId}"]`)
    const textNode = rawBlock ? getTextNodeForElement(rawBlock) : null
    if (!rawBlock || !textNode) {
      return
    }

    const ownerDocument = rawBlock.ownerDocument
    const selection = ownerDocument.defaultView?.getSelection()
    const boundaryRange = getCaretRangeFromPoint(ownerDocument, restoreRequest.clientX, restoreRequest.clientY)
    if (!selection || !boundaryRange) {
      return
    }

    const rawOffset = restoreRequest.direction === 'up'
      ? restoreRequest.selection.end
      : restoreRequest.selection.start
    const rawRange = ownerDocument.createRange()
    rawRange.setStart(textNode, clampTextOffset(textNode, rawOffset))
    rawRange.collapse(true)

    const nextRange = ownerDocument.createRange()
    if (restoreRequest.direction === 'up') {
      nextRange.setStart(boundaryRange.startContainer, boundaryRange.startOffset)
      nextRange.setEnd(rawRange.startContainer, rawRange.startOffset)
    } else {
      nextRange.setStart(rawRange.startContainer, rawRange.startOffset)
      nextRange.setEnd(boundaryRange.startContainer, boundaryRange.startOffset)
    }

    selection.removeAllRanges()
    selection.addRange(nextRange)
  }, [plainSelectionNodeId, selectionRestoreRequest])

  useLayoutEffect(() => {
    if (selectAllRequestId === 0) {
      return
    }

    const article = articleRef.current
    const selection = article?.ownerDocument.defaultView?.getSelection()
    if (!article || !selection) {
      return
    }

    const range = article.ownerDocument.createRange()
    range.selectNodeContents(article)
    selection.removeAllRanges()
    selection.addRange(range)
  }, [activeNodeIndex, plainSelectionNodeId, selectAllRequestId])

  useEffect(() => {
    const activeNode = nodes[activeNodeIndex]
    if (
      activeNode &&
      activeNode.kind === 'paragraph' &&
      (richEditingNodeId === activeNode.id || hasRenderableInlineMarkdown(activeNode.text))
    ) {
      if (richEditingNodeId !== activeNode.id) {
        setRichEditingNodeId(activeNode.id)
      }
      return
    }

    if (richEditingNodeId !== null) {
      setRichEditingNodeId(null)
    }
  }, [activeNodeIndex, nodes, richEditingNodeId])

  useEffect(() => {
    if (serializedValue === value) {
      return
    }

    onChange(serializedValue)
  }, [onChange, serializedValue, value])

  const commitNodes = (nextNodes: LiveNode[], nextActiveIndex: number, nextFocusPlacement: FocusPlacement) => {
    const safeNodes = nextNodes.length > 0 ? nextNodes : [createNode()]
    const safeActiveIndex = getSafeActiveIndex(safeNodes, nextActiveIndex)
    const nextSerializedValue = serializeNodes(safeNodes)

    if (nextSerializedValue !== serializedValue) {
      recordHistoryEntry()
    }
    setNodes(safeNodes)
    setActiveNodeIndex(safeActiveIndex)
    setFocusPlacement(nextFocusPlacement)
    expectedValueRef.current = nextSerializedValue
  }

  const updateNode = (nodeIndex: number, nextText: string) => {
    const nextNodes = nodes.slice()
    nextNodes[nodeIndex] = {
      ...nextNodes[nodeIndex],
      kind: inferNodeKind(nextText),
      text: nextText,
    }
    const nextSerializedValue = serializeNodes(nextNodes)

    if (nextSerializedValue !== serializedValue) {
      recordHistoryEntry()
    }
    setNodes(nextNodes)
    expectedValueRef.current = nextSerializedValue
  }

  const insertUploadedMarkdownIntoActiveNode = async (file: File) => {
    if (!onUploadImage) {
      return
    }

    const activeNode = nodes[activeNodeIndex]
    if (!activeNode) {
      return
    }

    try {
      const { markdown } = await onUploadImage(file)
      const separator =
        activeNode.text.trim().length > 0 && !activeNode.text.endsWith('\n')
          ? '\n'
          : ''
      updateNode(activeNodeIndex, `${activeNode.text}${separator}${markdown}`)
      setFocusPlacement('end')
      activeEditorRef.current?.focus('end')
    } catch {
      // App-level error handling remains at the caller boundary.
    }
  }

  const activateNode = (nodeIndex: number, placement: FocusPlacement = 'end') => {
    setPlainSelectionNodeId(null)
    setSelectionRestoreRequest(null)
    setActiveNodeIndex(getSafeActiveIndex(nodes, nodeIndex))
    setFocusPlacement(placement)
  }

  const restoreBoundarySelection = (node: LiveNode, selectionDrag: MarkdownEditorSelectionBoundaryDrag) => {
    setSelectionRestoreRequest({
      ...selectionDrag,
      nodeId: node.id,
    })
    setPlainSelectionNodeId(node.id)
    setActiveNodeIndex(-1)
  }

  const restoreHistoryEntry = (event: ReactKeyboardEvent<HTMLElement>, isRedoShortcut: boolean) => {
    const nextEntry = (isRedoShortcut ? redoStackRef : undoStackRef).current.pop()
    if (!nextEntry) {
      return false
    }

    event.preventDefault()
    event.stopPropagation()
    pushHistoryEntry(isRedoShortcut ? undoStackRef : redoStackRef, createHistoryEntry())
    applyHistoryEntry(nextEntry)
    return true
  }

  const handleSelectAllShortcut = (event: ReactKeyboardEvent<HTMLElement>) => {
    const normalizedKey = event.key.toLowerCase()
    const isRedoShortcut =
      (normalizedKey === 'z' && event.shiftKey) || (normalizedKey === 'y' && event.ctrlKey && !event.shiftKey)

    if ((event.metaKey || event.ctrlKey) && !event.altKey && isRedoShortcut && redoStackRef.current.length > 0) {
      restoreHistoryEntry(event, true)
      return
    }

    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'a') {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const activeNode = nodes[activeNodeIndex]
    if (activeNode) {
      setPlainSelectionNodeId(activeNode.id)
      setActiveNodeIndex(-1)
    }
    setSelectionRestoreRequest(null)
    setSelectAllRequestId((current) => current + 1)
  }

  const handleHistoryShortcut = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) {
      return
    }

    const normalizedKey = event.key.toLowerCase()
    const isRedoShortcut =
      (normalizedKey === 'z' && event.shiftKey) || (normalizedKey === 'y' && event.ctrlKey && !event.shiftKey)

    if (normalizedKey !== 'z' && !isRedoShortcut) {
      return
    }

    restoreHistoryEntry(event, isRedoShortcut)
  }

  const deleteSelectedDocumentRange = (range: Range) => {
    const article = articleRef.current
    if (!article || !rangeIntersectsElement(range, article) || isSelectionInsideSingleRichEditor(article, range)) {
      return false
    }

    const selectedRange = getSelectedNodeBoundaries(article, range, nodes)
    if (!selectedRange) {
      return false
    }

    const { start, end } = selectedRange
    if (start.nodeIndex === end.nodeIndex && start.offset === end.offset) {
      return false
    }

    const startNode = nodes[start.nodeIndex]
    const endNode = nodes[end.nodeIndex]
    if (!startNode || !endNode) {
      return false
    }

    const mergedText = `${startNode.text.slice(0, start.offset)}${endNode.text.slice(end.offset)}`
    const mergedNode = {
      ...startNode,
      kind: inferNodeKind(mergedText),
      text: mergedText,
    }
    const nextNodes = [
      ...nodes.slice(0, start.nodeIndex),
      mergedNode,
      ...nodes.slice(end.nodeIndex + 1),
    ]

    setPlainSelectionNodeId(null)
    setSelectionRestoreRequest(null)
    commitNodes(nextNodes, start.nodeIndex, getDeleteFocusPlacement(mergedText, start.offset))
    return true
  }

  useEffect(() => {
    const article = articleRef.current
    if (!article) {
      return
    }

    const ownerDocument = article.ownerDocument
    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || (event.key !== 'Delete' && event.key !== 'Backspace')) {
        return
      }

      const targetElement = event.target instanceof HTMLElement ? event.target : null
      const editingTarget = targetElement?.closest('input, textarea, [contenteditable="true"]')
      if (editingTarget && !article.contains(editingTarget)) {
        return
      }

      const selection = ownerDocument.defaultView?.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0 || selection.toString().length === 0) {
        return
      }

      if (deleteSelectedDocumentRange(selection.getRangeAt(0))) {
        event.preventDefault()
        event.stopPropagation()
        selection.removeAllRanges()
      }
    }

    ownerDocument.addEventListener('keydown', handleDocumentKeyDown, true)
    return () => {
      ownerDocument.removeEventListener('keydown', handleDocumentKeyDown, true)
    }
  }, [nodes])

  const appendTrailingNode = () => {
    const lastNode = nodes[nodes.length - 1]
    if (lastNode && lastNode.text.trim().length === 0) {
      activateNode(nodes.length - 1, 'end')
      activeEditorRef.current?.focus('end')
      return
    }

    const nextNodes = [...nodes, createNode()]
    commitNodes(nextNodes, nextNodes.length - 1, 'start')
  }

  const handleSplitNode = (nodeIndex: number, selection: { start: number; end: number }, nodeValue: string) => {
    const activeNode = nodes[nodeIndex]
    const nodeKind = activeNode?.kind ?? inferNodeKind(nodeValue)
    const isCursorAtNodeEnd = selection.start === selection.end && selection.end === nodeValue.length

    if (!isCursorAtNodeEnd) {
      return false
    }

    if (nodeKind === 'list' || nodeKind === 'blockquote' || nodeKind === 'code-fence') {
      return false
    }

    if (nodeValue.trim().length === 0) {
      return true
    }

    const nextNodes = nodes.slice()
    nextNodes[nodeIndex] = {
      ...nextNodes[nodeIndex],
      kind: inferNodeKind(nodeValue),
      text: nodeValue.replace(/\n+$/g, ''),
    }
    nextNodes.splice(nodeIndex + 1, 0, createNode())
    commitNodes(nextNodes, nodeIndex + 1, 'start')
    return true
  }

  const handleRemoveEmptyNodeBackward = (nodeIndex: number) => {
    if (nodes.length === 1) {
      return false
    }

    const nextNodes = nodes.slice()
    nextNodes.splice(nodeIndex, 1)
    commitNodes(nextNodes, Math.max(0, nodeIndex - 1), 'end')
    return true
  }

  const handleMoveBetweenNodes = (nodeIndex: number, direction: 'up' | 'down') => {
    if (direction === 'up' && nodeIndex > 0) {
      activateNode(nodeIndex - 1, 'end')
      return true
    }

    if (direction === 'down' && nodeIndex < nodes.length - 1) {
      activateNode(nodeIndex + 1, 'start')
      return true
    }

    return false
  }

  return (
    <section className="single-pane-live-editor" onKeyDownCapture={handleSelectAllShortcut} onKeyDown={handleHistoryShortcut}>
      {(onUploadImage || onToggleImmersive) ? (
        <div className="single-pane-live-editor__document-toolbar">
          <div className="single-pane-live-editor__document-toolbar-actions">
            {onUploadImage ? (
              <button
                type="button"
                className="markdown-editor__upload-button"
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                onClick={() => {
                  if (activeEditorRef.current && 'openImagePicker' in activeEditorRef.current) {
                    activeEditorRef.current.openImagePicker()
                  } else {
                    fallbackUploadInputRef.current?.click()
                  }
                  activeEditorRef.current?.focus()
                }}
              >
                上传图片
              </button>
            ) : null}
            {onToggleImmersive ? (
              <button type="button" className="markdown-editor__upload-button" onClick={onToggleImmersive}>
                {isImmersive ? '退出沉浸' : '沉浸模式'}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {onUploadImage ? (
        <input
          ref={fallbackUploadInputRef}
          aria-label="连续编辑器上传图片文件"
          className="sr-only"
          type="file"
          accept="image/*"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.currentTarget.value = ''
            if (!file) {
              return
            }

            void insertUploadedMarkdownIntoActiveNode(file)
          }}
        />
      ) : null}
      <article ref={articleRef} className="preview-content preview-content--live single-pane-live-editor__document">
        {nodes.map((node, nodeIndex) => {
          const isActiveNode = nodeIndex === activeNodeIndex
          const usesRichParagraphEditor =
            node.kind === 'paragraph' &&
            (contentFormat ?? 'markdown') === 'markdown' &&
            (richEditingNodeId === node.id || hasRenderableInlineMarkdown(node.text))
          const parsedHeadingNode = node.kind === 'heading' ? parseHeadingNode(node.text) : null
          const usesRichHeadingEditor = Boolean(parsedHeadingNode)
          const headingLevel = node.kind === 'heading' ? getHeadingLevel(node.text) : null
          const blockClassName = [
            'single-pane-live-editor__block',
            `single-pane-live-editor__block--${node.kind}`,
            usesRichParagraphEditor ? 'single-pane-live-editor__block--rich-paragraph' : null,
            isActiveNode ? 'single-pane-live-editor__block--active' : null,
          ]
            .filter(Boolean)
            .join(' ')
          const blockNodeAttributes = {
            'data-live-node-id': node.id,
            'data-live-node-index': nodeIndex,
          }
          const textareaClassName = [
            'single-pane-live-editor__textarea',
            `single-pane-live-editor__textarea--${node.kind}`,
            headingLevel ? `single-pane-live-editor__textarea--heading-${headingLevel}` : null,
          ]
            .filter(Boolean)
            .join(' ')

          if (isActiveNode) {
            if (usesRichParagraphEditor || usesRichHeadingEditor) {
              if (usesRichHeadingEditor && parsedHeadingNode) {
                const headingEditorClassName = [
                  'single-pane-live-editor__heading-editor',
                  'single-pane-live-editor__rich-editor--heading',
                  `single-pane-live-editor__rich-editor--heading-${parsedHeadingNode.level}`,
                ].join(' ')

                return (
                  <div key={node.id} className={blockClassName} {...blockNodeAttributes}>
                    <div className={headingEditorClassName}>
                      <span className="single-pane-live-editor__heading-prefix" aria-hidden="true">
                        {parsedHeadingNode.prefix}
                      </span>
                      <LiveRichParagraphEditor
                        ref={activeEditorRef as Ref<LiveRichParagraphEditorHandle>}
                        value={parsedHeadingNode.content}
                        className="single-pane-live-editor__rich-editor single-pane-live-editor__heading-content"
                        ariaLabel="Markdown 标题编辑器"
                        autoFocus
                        initialSelection={focusPlacement}
                        allowSoftBreaks={false}
                        normalizeValue={normalizeSingleLineText}
                        onChange={(nextValue) => {
                          updateNode(nodeIndex, `${parsedHeadingNode.prefix}${normalizeSingleLineText(nextValue)}`)
                        }}
                        onSplitBlock={(currentValue) => {
                          const nextValue = `${parsedHeadingNode.prefix}${normalizeSingleLineText(currentValue)}`
                          return handleSplitNode(
                            nodeIndex,
                            { start: nextValue.length, end: nextValue.length },
                            nextValue,
                          )
                        }}
                        onRemoveEmptyBlockBackward={() => handleRemoveEmptyNodeBackward(nodeIndex)}
                        onMoveBetweenBlocks={(direction) => handleMoveBetweenNodes(nodeIndex, direction)}
                      />
                    </div>
                  </div>
                )
              }

              const richEditorClassName = 'single-pane-live-editor__rich-editor'

              return (
                <div key={node.id} className={blockClassName} {...blockNodeAttributes}>
                  <LiveRichParagraphEditor
                    ref={activeEditorRef as Ref<LiveRichParagraphEditorHandle>}
                    value={node.text}
                    className={richEditorClassName}
                    ariaLabel="Markdown 段落编辑器"
                    autoFocus
                    initialSelection={focusPlacement}
                    onChange={(nextValue) => updateNode(nodeIndex, nextValue)}
                    onSplitBlock={(currentValue) =>
                      handleSplitNode(
                        nodeIndex,
                        { start: currentValue.length, end: currentValue.length },
                        currentValue,
                      )}
                    onRemoveEmptyBlockBackward={() => handleRemoveEmptyNodeBackward(nodeIndex)}
                    onMoveBetweenBlocks={(direction) => handleMoveBetweenNodes(nodeIndex, direction)}
                  />
                </div>
              )
            }

            return (
              <div key={node.id} className={blockClassName} {...blockNodeAttributes}>
                <MarkdownEditor
                  ref={activeEditorRef as Ref<MarkdownEditorHandle>}
                  value={node.text}
                  onChange={(nextValue) => updateNode(nodeIndex, nextValue)}
                  onUploadImage={onUploadImage}
                  internalReferenceCandidates={internalReferenceCandidates}
                  surfaceClassName="single-pane-live-editor__block-editor"
                  textareaClassName={textareaClassName}
                  showMeta={false}
                  hideToolbar
                  autoFocus
                  autoResize
                  initialSelection={focusPlacement}
                  onSplitBlock={(selection, currentValue) => handleSplitNode(nodeIndex, selection, currentValue)}
                  onRemoveEmptyBlockBackward={() => handleRemoveEmptyNodeBackward(nodeIndex)}
                  onMoveBetweenBlocks={(direction) => handleMoveBetweenNodes(nodeIndex, direction)}
                  onSelectionBoundaryDrag={(selectionDrag) => restoreBoundarySelection(node, selectionDrag)}
                />
              </div>
            )
          }

          if (node.text.trim().length === 0) {
            return null
          }

          if (plainSelectionNodeId === node.id) {
            return (
              <div
                key={node.id}
                className={blockClassName}
                {...blockNodeAttributes}
                onClick={(event) => {
                  if (hasNonCollapsedTextSelection(event.currentTarget.ownerDocument)) {
                    return
                  }

                  activateNode(nodeIndex, 'end')
                }}
              >
                <div
                  className={`${textareaClassName} single-pane-live-editor__selection-plain-text`}
                  data-live-selection-node-id={node.id}
                >
                  {node.text}
                </div>
              </div>
            )
          }

          return (
            <div
              key={node.id}
              className={blockClassName}
              {...blockNodeAttributes}
              onClick={(event) => {
                const target = event.target as HTMLElement
                if (target.closest('a, button, input, textarea')) {
                  return
                }

                if (hasNonCollapsedTextSelection(event.currentTarget.ownerDocument)) {
                  return
                }

                if (target.closest('summary')) {
                  event.preventDefault()
                }

                activateNode(
                  nodeIndex,
                  getRenderedClickFocusPlacement(node, event.currentTarget, event.clientX, event.clientY),
                )
              }}
            >
              {renderContentBlocks(node.text, contentFormat ?? 'markdown', previewImageUrls, undefined, wikiLinkOptions)}
            </div>
          )
        })}
        <button
          type="button"
          className="single-pane-live-editor__tail"
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onClick={() => {
            appendTrailingNode()
          }}
        >
          <span className="single-pane-live-editor__tail-line" aria-hidden="true" />
        </button>
      </article>
    </section>
  )
}
