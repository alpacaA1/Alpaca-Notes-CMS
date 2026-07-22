import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  buildInternalReferenceMarkdown,
  getInternalReferenceTypeLabel,
  searchInternalReferenceCandidates,
  type InternalReferenceCandidate,
} from '../internal-links'

const INDENT = '  '
const LIST_INDENT = '    '
const DEFAULT_LINK_URL = 'https://'
const DEFAULT_LINK_TEXT = '链接文本'
const ROMAN_MARKERS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']

type OrderedMarkerKind = 'numeric' | 'alpha' | 'roman'

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  onToggleImmersive?: () => void
  isImmersive?: boolean
  onUploadImage?: (file: File) => Promise<{ markdown: string }>
  internalReferenceCandidates?: InternalReferenceCandidate[]
  editorFontSize?: number
  editorFontWeight?: number
}

type SelectionRange = {
  start: number
  end: number
}

type HistoryEntry = {
  value: string
  selection: SelectionRange
}

type ActiveInternalReferenceQuery = {
  start: number
  end: number
  query: string
}

function getLineStart(value: string, index: number) {
  return value.lastIndexOf('\n', Math.max(index - 1, 0)) + 1
}

function getLineEnd(value: string, index: number) {
  const nextBreak = value.indexOf('\n', index)
  return nextBreak === -1 ? value.length : nextBreak
}

function getLineIndex(value: string, index: number) {
  return value.slice(0, index).split('\n').length - 1
}

function getSelectedLineRange(value: string, selectionStart: number, selectionEnd: number) {
  const start = getLineStart(value, selectionStart)
  const effectiveEnd = selectionEnd > selectionStart && value[selectionEnd - 1] === '\n'
    ? selectionEnd - 1
    : selectionEnd
  const end = getLineEnd(value, effectiveEnd)
  return { start, end }
}

function removeIndent(line: string) {
  if (line.startsWith('\t')) {
    return line.slice(1)
  }

  if (line.startsWith(LIST_INDENT)) {
    return line.slice(LIST_INDENT.length)
  }

  if (line.startsWith(INDENT)) {
    return line.slice(INDENT.length)
  }

  if (line.startsWith(' ')) {
    return line.slice(1)
  }

  return line
}

function getNextRomanMarker(marker: string) {
  const lowerMarker = marker.toLowerCase()
  const markerIndex = ROMAN_MARKERS.indexOf(lowerMarker)
  if (markerIndex === -1 || markerIndex === ROMAN_MARKERS.length - 1) {
    return null
  }

  const nextMarker = ROMAN_MARKERS[markerIndex + 1]
  return marker === lowerMarker ? nextMarker : nextMarker.toUpperCase()
}

function getNextOrderedMarker(marker: string) {
  const numberedMatch = marker.match(/^(\d+)([.)])$/)
  if (numberedMatch) {
    return `${Number(numberedMatch[1]) + 1}${numberedMatch[2]}`
  }

  const romanMatch = marker.match(/^([ivxlcdm]+)([.)])$/i)
  if (romanMatch) {
    const nextRomanMarker = getNextRomanMarker(romanMatch[1])
    if (nextRomanMarker) {
      return `${nextRomanMarker}${romanMatch[2]}`
    }
  }

  const alphaMatch = marker.match(/^([a-zA-Z])([.)])$/)
  if (alphaMatch) {
    const code = alphaMatch[1].charCodeAt(0)
    const nextCode = code + 1
    const upperBound = alphaMatch[1] >= 'a' ? 122 : 90
    if (nextCode <= upperBound) {
      return `${String.fromCharCode(nextCode)}${alphaMatch[2]}`
    }
  }

  return marker
}

function parseOrderedMarker(marker: string) {
  const numberedMatch = marker.match(/^(\d+)([.)])$/)
  if (numberedMatch) {
    return {
      kind: 'numeric' as OrderedMarkerKind,
      ordinal: Number(numberedMatch[1]),
      separator: numberedMatch[2],
      uppercase: false,
    }
  }

  const romanMatch = marker.match(/^([ivxlcdm]+)([.)])$/i)
  if (romanMatch) {
    const normalizedMarker = romanMatch[1].toLowerCase()
    const ordinal = ROMAN_MARKERS.indexOf(normalizedMarker) + 1
    if (ordinal > 0) {
      return {
        kind: 'roman' as OrderedMarkerKind,
        ordinal,
        separator: romanMatch[2],
        uppercase: romanMatch[1] !== normalizedMarker,
      }
    }
  }

  const alphaMatch = marker.match(/^([a-zA-Z])([.)])$/)
  if (alphaMatch) {
    const normalizedMarker = alphaMatch[1].toLowerCase()
    return {
      kind: 'alpha' as OrderedMarkerKind,
      ordinal: normalizedMarker.charCodeAt(0) - 96,
      separator: alphaMatch[2],
      uppercase: alphaMatch[1] !== normalizedMarker,
    }
  }

  return null
}

function formatOrderedMarker(kind: OrderedMarkerKind, ordinal: number, separator: string, uppercase: boolean) {
  if (kind === 'numeric') {
    return `${Math.max(1, ordinal)}${separator}`
  }

  if (kind === 'roman') {
    const romanMarker = ROMAN_MARKERS[Math.max(1, ordinal) - 1] ?? ROMAN_MARKERS[0]
    return `${uppercase ? romanMarker.toUpperCase() : romanMarker}${separator}`
  }

  const clampedOrdinal = Math.min(Math.max(1, ordinal), 26)
  const baseCode = uppercase ? 64 : 96
  return `${String.fromCharCode(baseCode + clampedOrdinal)}${separator}`
}

function normalizeIndentWhitespace(whitespace: string) {
  return whitespace.replace(/\t/g, INDENT)
}

function getIndentWidth(whitespace: string) {
  return normalizeIndentWhitespace(whitespace).length
}

function buildIndentWhitespace(width: number) {
  return ' '.repeat(Math.max(0, width))
}

function getLeadingWhitespace(line: string) {
  return line.match(/^\s*/)?.[0] ?? ''
}

function getOrderedLineMatch(line: string) {
  const orderedMatch = line.match(/^(\s*)((?:\d+|[a-zA-Z]+)[.)])(\s.*)$/)
  if (!orderedMatch) {
    return null
  }

  const marker = parseOrderedMarker(orderedMatch[2])
  if (!marker) {
    return null
  }

  return {
    indentWidth: getIndentWidth(orderedMatch[1]),
    kind: marker.kind,
    ordinal: marker.ordinal,
    separator: marker.separator,
    uppercase: marker.uppercase,
    suffix: orderedMatch[3],
  }
}

function splitBlockquotePrefix(line: string) {
  const blockquoteMatch = line.match(/^(\s*(?:>\s?)+)(.*)$/)
  if (!blockquoteMatch) {
    return {
      blockquotePrefix: '',
      content: line,
    }
  }

  return {
    blockquotePrefix: blockquoteMatch[1],
    content: blockquoteMatch[2],
  }
}

function isBulletListLine(line: string) {
  return /^\s*[-*+](?:\s+\[(?: |x|X)\])?\s.*$/.test(line)
}

function findOrderedListBoundary(lines: string[], lineIndex: number, targetIndentWidth: number) {
  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line.trim()) {
      continue
    }

    if (getIndentWidth(getLeadingWhitespace(line)) < targetIndentWidth) {
      return index
    }
  }

  return -1
}

function getNextOrderedLineOrdinal(lines: string[], lineIndex: number, targetIndentWidth: number) {
  const boundaryIndex = findOrderedListBoundary(lines, lineIndex, targetIndentWidth)
  let nextOrdinal = 1

  for (let index = boundaryIndex + 1; index < lineIndex; index += 1) {
    const orderedMatch = getOrderedLineMatch(lines[index])
    if (!orderedMatch || orderedMatch.indentWidth !== targetIndentWidth) {
      continue
    }

    nextOrdinal = orderedMatch.ordinal + 1
  }

  return nextOrdinal
}

function indentLineInContext(lines: string[], lineIndex: number) {
  const line = lines[lineIndex]
  const orderedMatch = getOrderedLineMatch(line)
  if (orderedMatch) {
    const targetIndentWidth = orderedMatch.indentWidth + LIST_INDENT.length
    const nextOrdinal = getNextOrderedLineOrdinal(lines, lineIndex, targetIndentWidth)
    return `${buildIndentWhitespace(targetIndentWidth)}${formatOrderedMarker('numeric', nextOrdinal, orderedMatch.separator, false)}${orderedMatch.suffix}`
  }

  if (isBulletListLine(line)) {
    const targetIndentWidth = getIndentWidth(getLeadingWhitespace(line)) + LIST_INDENT.length
    return `${buildIndentWhitespace(targetIndentWidth)}${line.trimStart()}`
  }

  return `${INDENT}${line}`
}

function outdentLineInContext(lines: string[], lineIndex: number) {
  const line = lines[lineIndex]
  const orderedMatch = getOrderedLineMatch(line)
  if (orderedMatch) {
    if (orderedMatch.indentWidth === 0) {
      return line
    }

    const targetIndentWidth = Math.max(0, orderedMatch.indentWidth - LIST_INDENT.length)
    const nextOrdinal = getNextOrderedLineOrdinal(lines, lineIndex, targetIndentWidth)
    return `${buildIndentWhitespace(targetIndentWidth)}${formatOrderedMarker('numeric', nextOrdinal, orderedMatch.separator, false)}${orderedMatch.suffix}`
  }

  if (isBulletListLine(line)) {
    const currentIndentWidth = getIndentWidth(getLeadingWhitespace(line))
    if (currentIndentWidth === 0) {
      return line
    }

    const targetIndentWidth = Math.max(0, currentIndentWidth - LIST_INDENT.length)
    return `${buildIndentWhitespace(targetIndentWidth)}${line.trimStart()}`
  }

  return removeIndent(line)
}

function getContinuedListPrefix(line: string) {
  const taskListMatch = line.match(/^(\s*)([-*+])\s+\[(?: |x|X)\]\s+(.+)$/)
  if (taskListMatch) {
    return `${taskListMatch[1]}${taskListMatch[2]} [ ] `
  }

  const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.+)$/)
  if (unorderedMatch) {
    return `${unorderedMatch[1]}${unorderedMatch[2]} `
  }

  const orderedMatch = line.match(/^(\s*)((?:\d+|[a-zA-Z]+)[.)])\s+(.+)$/)
  if (orderedMatch) {
    return `${orderedMatch[1]}${getNextOrderedMarker(orderedMatch[2])} `
  }

  return null
}

function getListPrefixToRemove(line: string) {
  const taskListMatch = line.match(/^(\s*)([-*+])\s+\[(?: |x|X)\]\s*$/)
  if (taskListMatch) {
    return taskListMatch[0]
  }

  const unorderedMatch = line.match(/^(\s*)([-*+])\s*$/)
  if (unorderedMatch) {
    return unorderedMatch[0]
  }

  const orderedMatch = line.match(/^(\s*)((?:\d+|[a-zA-Z]+)[.)])\s*$/)
  if (orderedMatch) {
    return orderedMatch[0]
  }

  return null
}

function getBlockquoteContinuationPrefix(line: string) {
  const { blockquotePrefix, content } = splitBlockquotePrefix(line)
  if (!blockquotePrefix) {
    return null
  }

  const continuedListPrefix = getContinuedListPrefix(content)
  if (continuedListPrefix) {
    return `${blockquotePrefix}${continuedListPrefix}`
  }

  if (getListPrefixToRemove(content) || content.trim()) {
    return blockquotePrefix.endsWith(' ') ? blockquotePrefix : `${blockquotePrefix} `
  }

  return null
}

function getOrderedListLineContext(line: string) {
  const { blockquotePrefix, content } = splitBlockquotePrefix(line)
  const orderedMatch = getOrderedLineMatch(content)
  if (!orderedMatch) {
    return null
  }

  return {
    blockquotePrefix,
    indentWidth: orderedMatch.indentWidth,
    kind: orderedMatch.kind,
    ordinal: orderedMatch.ordinal,
    separator: orderedMatch.separator,
    uppercase: orderedMatch.uppercase,
    suffix: orderedMatch.suffix,
  }
}

function renumberFollowingOrderedListLines(value: string, insertedLineIndex: number) {
  const lines = value.split('\n')
  const insertedLine = lines[insertedLineIndex]
  const insertedContext = insertedLine ? getOrderedListLineContext(insertedLine) : null
  if (!insertedContext) {
    return value
  }

  let nextOrdinal = insertedContext.ordinal + 1
  let changed = false

  for (let index = insertedLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim()) {
      continue
    }

    const { blockquotePrefix, content } = splitBlockquotePrefix(line)
    if (blockquotePrefix !== insertedContext.blockquotePrefix) {
      break
    }

    const indentWidth = getIndentWidth(getLeadingWhitespace(content))
    if (indentWidth > insertedContext.indentWidth) {
      continue
    }

    if (indentWidth < insertedContext.indentWidth) {
      break
    }

    const lineContext = getOrderedListLineContext(line)
    if (
      !lineContext ||
      lineContext.kind !== insertedContext.kind ||
      lineContext.separator !== insertedContext.separator ||
      lineContext.uppercase !== insertedContext.uppercase
    ) {
      break
    }

    const nextLine = `${lineContext.blockquotePrefix}${buildIndentWhitespace(lineContext.indentWidth)}${formatOrderedMarker(insertedContext.kind, nextOrdinal, insertedContext.separator, insertedContext.uppercase)}${lineContext.suffix}`
    if (nextLine !== line) {
      lines[index] = nextLine
      changed = true
    }
    nextOrdinal += 1
  }

  return changed ? lines.join('\n') : value
}

function wrapSelection(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  prefix: string,
  suffix: string,
  placeholder = '',
) {
  const selectedText = value.slice(selectionStart, selectionEnd)
  const content = selectedText || placeholder
  const nextValue = `${value.slice(0, selectionStart)}${prefix}${content}${suffix}${value.slice(selectionEnd)}`
  const contentStart = selectionStart + prefix.length
  return {
    nextValue,
    nextSelection: {
      start: contentStart,
      end: contentStart + content.length,
    },
  }
}

function isInsideCodeFence(value: string, selectionStart: number) {
  const contentBeforeSelection = value.slice(0, selectionStart)
  const fenceMatches = contentBeforeSelection.match(/^\s*```.*$/gm)
  return Boolean(fenceMatches && fenceMatches.length % 2 === 1)
}

function getCurrentLineIndent(line: string) {
  return line.match(/^(\s*)/)?.[1] || ''
}

function normalizePastedMarkdown(text: string) {
  return text
    .replace(/\t/g, INDENT)
    .replace(/　/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/^\s*[•·◦▪▫]\s*/gm, '- ')
}

function moveCurrentLine(value: string, selectionStart: number, direction: 'up' | 'down') {
  const lines = value.split('\n')
  const currentLineIndex = value.slice(0, selectionStart).split('\n').length - 1
  const targetLineIndex = direction === 'down' ? currentLineIndex + 1 : currentLineIndex - 1

  if (targetLineIndex < 0 || targetLineIndex >= lines.length) {
    return null
  }

  const cursorOffset = selectionStart - getLineStart(value, selectionStart)
  const nextLines = [...lines]
  ;[nextLines[currentLineIndex], nextLines[targetLineIndex]] = [
    nextLines[targetLineIndex],
    nextLines[currentLineIndex],
  ]

  const nextLineStart = nextLines
    .slice(0, targetLineIndex)
    .reduce((totalLength, line) => totalLength + line.length + 1, 0)
  const nextSelectionStart = nextLineStart + Math.min(cursorOffset, nextLines[targetLineIndex].length)

  return {
    nextValue: nextLines.join('\n'),
    nextSelection: { start: nextSelectionStart, end: nextSelectionStart },
  }
}

function getImageFileFromClipboardData(clipboardData: DataTransfer) {
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        return file
      }
    }
  }

  for (const file of Array.from(clipboardData.files)) {
    if (file.type.startsWith('image/')) {
      return file
    }
  }

  return null
}

function getSelectionRange(textarea: HTMLTextAreaElement | null): SelectionRange {
  return {
    start: textarea?.selectionStart ?? 0,
    end: textarea?.selectionEnd ?? 0,
  }
}

function getActiveInternalReferenceQuery(value: string, selection: SelectionRange): ActiveInternalReferenceQuery | null {
  if (selection.start !== selection.end) {
    return null
  }

  const cursor = selection.start
  const triggerStart = value.lastIndexOf('[[', Math.max(0, cursor - 1))
  if (triggerStart < 0) {
    return null
  }

  const contentSinceTrigger = value.slice(triggerStart + 2, cursor)
  if (!contentSinceTrigger.trim() || contentSinceTrigger.includes('\n') || contentSinceTrigger.includes(']]')) {
    return null
  }

  const lastClosedTrigger = value.lastIndexOf(']]', Math.max(0, cursor - 1))
  if (lastClosedTrigger > triggerStart) {
    return null
  }

  return {
    start: triggerStart,
    end: cursor,
    query: contentSinceTrigger,
  }
}

export default function MarkdownEditor({
  value,
  onChange,
  onToggleImmersive,
  isImmersive = false,
  onUploadImage,
  internalReferenceCandidates = [],
  editorFontSize,
  editorFontWeight,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const currentValueRef = useRef(value)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const uploadSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const trackedSelectionRef = useRef<SelectionRange>({ start: 0, end: 0 })
  const expectedValueRef = useRef<string | null>(null)
  const undoStackRef = useRef<HistoryEntry[]>([])
  const redoStackRef = useRef<HistoryEntry[]>([])
  const isComposingRef = useRef(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [editorSelection, setEditorSelection] = useState<SelectionRange>({ start: 0, end: 0 })
  const [activeInternalReferenceIndex, setActiveInternalReferenceIndex] = useState(0)
  const [dismissedInternalReferenceKey, setDismissedInternalReferenceKey] = useState<string | null>(null)
  const textareaId = useId()

  currentValueRef.current = value

  useLayoutEffect(() => {
    if (!textareaRef.current || !pendingSelectionRef.current) {
      return
    }

    textareaRef.current.setSelectionRange(
      pendingSelectionRef.current.start,
      pendingSelectionRef.current.end,
    )
    trackedSelectionRef.current = pendingSelectionRef.current
    setEditorSelection(pendingSelectionRef.current)
    pendingSelectionRef.current = null
  }, [value])

  useLayoutEffect(() => {
    if (expectedValueRef.current === value) {
      expectedValueRef.current = null
      return
    }

    expectedValueRef.current = null
    undoStackRef.current = []
    redoStackRef.current = []
    trackedSelectionRef.current = getSelectionRange(textareaRef.current)
    setEditorSelection(trackedSelectionRef.current)
  }, [value])

  const activeInternalReferenceQuery = useMemo(
    () => getActiveInternalReferenceQuery(value, editorSelection),
    [editorSelection, value],
  )
  const visibleInternalReferenceKey = activeInternalReferenceQuery
    ? `${activeInternalReferenceQuery.start}:${activeInternalReferenceQuery.query}`
    : null
  const visibleInternalReferenceCandidates = useMemo(
    () =>
      activeInternalReferenceQuery
        ? searchInternalReferenceCandidates(internalReferenceCandidates, activeInternalReferenceQuery.query)
        : [],
    [activeInternalReferenceQuery, internalReferenceCandidates],
  )
  const isInternalReferencePanelVisible =
    Boolean(activeInternalReferenceQuery) && visibleInternalReferenceKey !== dismissedInternalReferenceKey

  useEffect(() => {
    setActiveInternalReferenceIndex(0)
  }, [visibleInternalReferenceKey])

  const dismissInternalReferencePanel = () => {
    if (!visibleInternalReferenceKey) {
      return
    }

    setDismissedInternalReferenceKey(visibleInternalReferenceKey)
  }

  const pushHistoryEntry = (stack: React.MutableRefObject<HistoryEntry[]>, entry: HistoryEntry) => {
    const lastEntry = stack.current[stack.current.length - 1]
    if (lastEntry && lastEntry.value === entry.value) {
      stack.current[stack.current.length - 1] = entry
      return
    }

    stack.current.push(entry)
    if (stack.current.length > 200) {
      stack.current.shift()
    }
  }

  const dispatchValueChange = (
    nextValue: string,
    nextSelection: SelectionRange,
    previousSelection: SelectionRange = trackedSelectionRef.current,
  ) => {
    if (nextValue === currentValueRef.current) {
      pendingSelectionRef.current = nextSelection
      trackedSelectionRef.current = nextSelection
      setEditorSelection(nextSelection)
      return
    }

    pushHistoryEntry(undoStackRef, {
      value: currentValueRef.current,
      selection: previousSelection,
    })
    redoStackRef.current = []
    pendingSelectionRef.current = nextSelection
    trackedSelectionRef.current = nextSelection
    setEditorSelection(nextSelection)
    expectedValueRef.current = nextValue
    onChange(nextValue)
  }

  const insertLinkMarkdown = (selection: { start: number; end: number }) => {
    const { nextValue } = wrapSelection(
      currentValueRef.current,
      selection.start,
      selection.end,
      '[',
      `](${DEFAULT_LINK_URL})`,
      DEFAULT_LINK_TEXT,
    )
    const urlStart = nextValue.lastIndexOf(DEFAULT_LINK_URL)
    dispatchValueChange(nextValue, { start: urlStart, end: urlStart + DEFAULT_LINK_URL.length }, selection)
  }

  const insertInternalReference = (
    candidate: InternalReferenceCandidate,
    selection: SelectionRange = trackedSelectionRef.current,
  ) => {
    if (!activeInternalReferenceQuery) {
      return
    }

    const markdown = buildInternalReferenceMarkdown(candidate)
    const nextValue = `${currentValueRef.current.slice(0, activeInternalReferenceQuery.start)}${markdown}${currentValueRef.current.slice(activeInternalReferenceQuery.end)}`
    const nextCaret = activeInternalReferenceQuery.start + markdown.length
    dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
    setDismissedInternalReferenceKey(null)
  }

  const insertUploadedMarkdown = async (
    file: File,
    selection: { start: number; end: number },
  ) => {
    if (!onUploadImage) {
      return
    }

    setIsUploadingImage(true)

    try {
      const { markdown } = await onUploadImage(file)
      const latestValue = currentValueRef.current
      const nextValue = `${latestValue.slice(0, selection.start)}${markdown}${latestValue.slice(selection.end)}`
      const nextCaret = selection.start + markdown.length
      dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
    } catch {
      // App-level error handling is intentionally deferred.
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleUploadButtonMouseDown = () => {
    if (!textareaRef.current || !onUploadImage) {
      return
    }

    uploadSelectionRef.current = getSelectionRange(textareaRef.current)
    trackedSelectionRef.current = uploadSelectionRef.current
  }

  const handleUploadButtonClick = () => {
    if (!fileInputRef.current || !onUploadImage) {
      return
    }

    fileInputRef.current.value = ''
    fileInputRef.current.click()
  }

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !onUploadImage) {
      return
    }

    const selection = uploadSelectionRef.current ?? {
      start: textareaRef.current?.selectionStart ?? 0,
      end: textareaRef.current?.selectionEnd ?? 0,
    }
    await insertUploadedMarkdown(file, selection)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart, selectionEnd } = event.currentTarget
    const normalizedKey = event.key.toLowerCase()
    const selection = { start: selectionStart, end: selectionEnd }
    trackedSelectionRef.current = selection
    setEditorSelection(selection)
    const nativeKeyEvent = event.nativeEvent as KeyboardEvent & {
      isComposing?: boolean
      keyCode?: number
      which?: number
    }
    const isImeConfirming =
      normalizedKey === 'enter' &&
      (isComposingRef.current ||
        nativeKeyEvent.isComposing === true ||
        nativeKeyEvent.keyCode === 229 ||
        nativeKeyEvent.which === 229)

    if (isImeConfirming) {
      return
    }

    if (isInternalReferencePanelVisible) {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismissInternalReferencePanel()
        return
      }

      if (visibleInternalReferenceCandidates.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault()
        event.stopPropagation()
        setDismissedInternalReferenceKey(null)
        setActiveInternalReferenceIndex((currentIndex) => {
          if (event.key === 'ArrowDown') {
            return (currentIndex + 1) % visibleInternalReferenceCandidates.length
          }

          return (currentIndex + visibleInternalReferenceCandidates.length - 1) % visibleInternalReferenceCandidates.length
        })
        return
      }

      if (
        visibleInternalReferenceCandidates.length > 0 &&
        selectionStart === selectionEnd &&
        (event.key === 'Enter' || event.key === 'Tab')
      ) {
        event.preventDefault()
        event.stopPropagation()
        insertInternalReference(
          visibleInternalReferenceCandidates[Math.min(activeInternalReferenceIndex, visibleInternalReferenceCandidates.length - 1)],
          selection,
        )
        return
      }
    }

    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const isRedoShortcut =
        (normalizedKey === 'z' && event.shiftKey) || (normalizedKey === 'y' && event.ctrlKey && !event.shiftKey)

      if (normalizedKey === 'z' || isRedoShortcut) {
        event.preventDefault()
        event.stopPropagation()

        if (isRedoShortcut) {
          const nextEntry = redoStackRef.current.pop()
          if (!nextEntry) {
            return
          }

          pushHistoryEntry(undoStackRef, {
            value: currentValueRef.current,
            selection,
          })
          pendingSelectionRef.current = nextEntry.selection
          trackedSelectionRef.current = nextEntry.selection
          expectedValueRef.current = nextEntry.value
          onChange(nextEntry.value)
          return
        }

        const previousEntry = undoStackRef.current.pop()
        if (!previousEntry) {
          return
        }

        pushHistoryEntry(redoStackRef, {
          value: currentValueRef.current,
          selection,
        })
        pendingSelectionRef.current = previousEntry.selection
        trackedSelectionRef.current = previousEntry.selection
        expectedValueRef.current = previousEntry.value
        onChange(previousEntry.value)
        return
      }

      const wrap =
        normalizedKey === 'b'
          ? { prefix: '**', suffix: '**', placeholder: '粗体' }
          : normalizedKey === 'i'
            ? { prefix: '*', suffix: '*', placeholder: '斜体' }
            : null

      if (normalizedKey === 'k') {
        event.preventDefault()
        event.stopPropagation()
        insertLinkMarkdown({ start: selectionStart, end: selectionEnd })
        return
      }

      if (wrap) {
        event.preventDefault()
        event.stopPropagation()
        const { nextValue, nextSelection } = wrapSelection(
          value,
          selectionStart,
          selectionEnd,
          wrap.prefix,
          wrap.suffix,
          wrap.placeholder,
        )
        dispatchValueChange(nextValue, nextSelection, selection)
        return
      }
    }

    if (event.altKey && selectionStart === selectionEnd) {
      const direction = event.key === 'ArrowDown' ? 'down' : event.key === 'ArrowUp' ? 'up' : null
      if (direction) {
        event.preventDefault()
        event.stopPropagation()
        const nextState = moveCurrentLine(value, selectionStart, direction)
        if (nextState) {
          dispatchValueChange(nextState.nextValue, nextState.nextSelection, selection)
        }
        return
      }
    }

    if (event.key === 'Backspace' && selectionStart === selectionEnd) {
      const lineStart = getLineStart(value, selectionStart)
      const lineEnd = getLineEnd(value, selectionStart)
      const lineIndex = getLineIndex(value, lineStart)
      const currentLine = value.slice(lineStart, lineEnd)
      const isListLine = Boolean(getOrderedLineMatch(currentLine) || isBulletListLine(currentLine))
      const insideCodeFence = isInsideCodeFence(value, selectionStart)
      const emptyListPrefix = getListPrefixToRemove(currentLine)
      const indentOnlyPrefix = currentLine.match(/^(\s+)/)?.[0] || ''
      const cursorOffset = selectionStart - lineStart

      if (
        !insideCodeFence &&
        emptyListPrefix &&
        selectionStart === lineEnd &&
        (currentLine.startsWith(INDENT) || currentLine.startsWith('\t'))
      ) {
        event.preventDefault()
        const lines = value.split('\n')
        const nextLine = outdentLineInContext(lines, lineIndex)
        const nextValue = `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`
        const nextCaret = lineStart + nextLine.length
        dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
        return
      }

      if (cursorOffset > 0 && cursorOffset <= indentOnlyPrefix.length) {
        if (!insideCodeFence && isListLine) {
          const lines = value.split('\n')
          const nextLine = outdentLineInContext(lines, lineIndex)
          if (nextLine !== currentLine) {
            event.preventDefault()
            const nextValue = `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`
            const nextCaret = lineStart + getLeadingWhitespace(nextLine).length
            dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
            return
          }
        }

        const removedWidth = indentOnlyPrefix.startsWith('\t', Math.max(0, cursorOffset - 1))
          ? 1
          : Math.min(INDENT.length, cursorOffset)
        const removeStart = selectionStart - removedWidth
        event.preventDefault()
        const nextValue = `${value.slice(0, removeStart)}${value.slice(selectionEnd)}`
        dispatchValueChange(nextValue, { start: removeStart, end: removeStart }, selection)
        return
      }
    }

    if (event.key === 'Enter' && selectionStart === selectionEnd) {
      const insertContinuedPrefix = (continuedPrefix: string) => {
        event.preventDefault()
        const baseNextValue = `${value.slice(0, selectionStart)}\n${continuedPrefix}${value.slice(selectionEnd)}`
        const insertedLineIndex = getLineIndex(value, selectionStart) + 1
        const nextValue = renumberFollowingOrderedListLines(baseNextValue, insertedLineIndex)
        const nextCaret = selectionStart + 1 + continuedPrefix.length
        dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
      }

      const lineStart = getLineStart(value, selectionStart)
      const currentLine = value.slice(lineStart, selectionStart)
      const codeFenceMatch = currentLine.match(/^(\s*)```(?:[^`]*)$/)

      if (codeFenceMatch) {
        event.preventDefault()
        const indent = codeFenceMatch[1]
        const nextValue = `${value.slice(0, selectionStart)}\n${indent}\n${indent}\`\`\`${value.slice(selectionEnd)}`
        const nextCaret = selectionStart + 1 + indent.length
        dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
        return
      }

      if (isInsideCodeFence(value, selectionStart)) {
        event.preventDefault()
        const indent = getCurrentLineIndent(currentLine)
        const nextValue = `${value.slice(0, selectionStart)}\n${indent}${value.slice(selectionEnd)}`
        const nextCaret = selectionStart + 1 + indent.length
        dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
        return
      }

      const blockquoteContinuationPrefix = getBlockquoteContinuationPrefix(currentLine)
      if (blockquoteContinuationPrefix) {
        insertContinuedPrefix(blockquoteContinuationPrefix)
        return
      }

      const listPrefixToRemove = getListPrefixToRemove(currentLine)

      if (listPrefixToRemove) {
        event.preventDefault()
        const nextValue = `${value.slice(0, lineStart)}${value.slice(selectionEnd)}`
        dispatchValueChange(nextValue, { start: lineStart, end: lineStart }, selection)
        return
      }

      const continuedPrefix = getContinuedListPrefix(currentLine)

      if (!continuedPrefix) {
        return
      }

      insertContinuedPrefix(continuedPrefix)
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    if (!event.shiftKey && selectionStart === selectionEnd) {
      const lineStart = getLineStart(value, selectionStart)
      const lineEnd = getLineEnd(value, selectionStart)
      const lineIndex = getLineIndex(value, lineStart)
      const currentLine = value.slice(lineStart, lineEnd)
      const emptyListPrefix = getListPrefixToRemove(currentLine)

      if (isInsideCodeFence(value, selectionStart)) {
        const nextValue = `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`
        const nextCaret = selectionStart + INDENT.length
        dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
        return
      }

      if (selectionStart === lineStart || (emptyListPrefix && selectionStart === lineEnd)) {
        const lines = value.split('\n')
        const indentedLine = indentLineInContext(lines, lineIndex)
        const nextValue = `${value.slice(0, lineStart)}${indentedLine}${value.slice(lineEnd)}`
        const nextCaret = selectionStart + (indentedLine.length - currentLine.length)
        dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
        return
      }

      const nextValue = `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`
      const nextCaret = selectionStart + INDENT.length
      dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
      return
    }

    if (event.shiftKey && selectionStart === selectionEnd) {
      const lineStart = getLineStart(value, selectionStart)
      const lineEnd = getLineEnd(value, selectionStart)
      const lineIndex = getLineIndex(value, lineStart)
      const currentLine = value.slice(lineStart, lineEnd)
      const lines = value.split('\n')
      const outdentedLine = outdentLineInContext(lines, lineIndex)
      const removedCount = currentLine.length - outdentedLine.length

      if (removedCount === 0) {
        return
      }

      const nextValue = `${value.slice(0, lineStart)}${outdentedLine}${value.slice(lineEnd)}`
      const nextCaret = Math.max(lineStart, selectionStart - removedCount)
      dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
      return
    }

    const { start, end } = getSelectedLineRange(value, selectionStart, selectionEnd)
    const startLineIndex = getLineIndex(value, start)
    const endLineIndex = getLineIndex(value, end)
    const lines = value.split('\n')

    for (let index = startLineIndex; index <= endLineIndex; index += 1) {
      lines[index] = event.shiftKey ? outdentLineInContext(lines, index) : indentLineInContext(lines, index)
    }

    const nextBlock = lines.slice(startLineIndex, endLineIndex + 1).join('\n')
    const nextValue = `${value.slice(0, start)}${nextBlock}${value.slice(end)}`

    dispatchValueChange(nextValue, { start, end: start + nextBlock.length }, selection)
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const selection = {
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
    }
    trackedSelectionRef.current = selection
    setEditorSelection(selection)
    const imageFile = onUploadImage ? getImageFileFromClipboardData(event.clipboardData) : null
    if (imageFile) {
      event.preventDefault()
      event.stopPropagation()

      void insertUploadedMarkdown(imageFile, {
        start: selection.start,
        end: selection.end,
      })
      return
    }

    const pastedText = event.clipboardData.getData('text/plain')
    if (!pastedText) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const { selectionStart, selectionEnd } = event.currentTarget
    const normalizedText = normalizePastedMarkdown(pastedText)
    const nextValue = `${value.slice(0, selectionStart)}${normalizedText}${value.slice(selectionEnd)}`
    const nextCaret = selectionStart + normalizedText.length
    dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
  }

  const editorFontStyle = useMemo<CSSProperties | undefined>(() => {
    const customProperties: Record<string, string> = {}
    if (editorFontSize !== undefined) {
      customProperties['--md-editor-font-size'] = `${editorFontSize}px`
    }
    if (editorFontWeight !== undefined) {
      customProperties['--md-editor-font-weight'] = String(editorFontWeight)
    }

    if (Object.keys(customProperties).length === 0) {
      return undefined
    }

    return customProperties as CSSProperties
  }, [editorFontSize, editorFontWeight])

  return (
    <section className="editor-surface editor-surface--editor-canvas" style={editorFontStyle}>
      <div className="markdown-editor__toolbar">
        <div className="markdown-editor__meta">
          <label className="editor-surface__label" htmlFor={textareaId}>
            Markdown 编辑
          </label>
        </div>
        <div className="markdown-editor__actions">
          {onUploadImage ? (
            <input
              ref={fileInputRef}
              aria-label="上传图片文件"
              className="sr-only"
              type="file"
              accept="image/*"
              tabIndex={-1}
              onChange={(event) => {
                void handleFileInputChange(event)
              }}
            />
          ) : null}
          {onToggleImmersive ? (
            <button type="button" className="markdown-editor__upload-button" onClick={onToggleImmersive}>
              {isImmersive ? '退出沉浸' : '沉浸模式'}
            </button>
          ) : null}
          {isInternalReferencePanelVisible ? (
            <div className="markdown-editor__reference-panel" role="listbox" aria-label="内部引用候选">
              <div className="markdown-editor__reference-panel-header">
                <div className="markdown-editor__reference-panel-heading">
                  <strong>内部引用</strong>
                  <span>回车即可插入</span>
                </div>
                <button
                  type="button"
                  className="markdown-editor__reference-dismiss"
                  aria-label="关闭内部引用候选"
                  onMouseDown={(event) => {
                    event.preventDefault()
                  }}
                  onClick={dismissInternalReferencePanel}
                >
                  收起
                </button>
              </div>
              {visibleInternalReferenceCandidates.length > 0 ? (
                <div className="markdown-editor__reference-options">
                  {visibleInternalReferenceCandidates.map((candidate, index) => {
                    const isActive = index === activeInternalReferenceIndex

                    return (
                      <button
                        key={candidate.targetKey}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className={`markdown-editor__reference-option${isActive ? ' is-active' : ''}`}
                        onMouseDown={(event) => {
                          event.preventDefault()
                        }}
                        onClick={() => insertInternalReference(candidate)}
                        onMouseEnter={() => setActiveInternalReferenceIndex(index)}
                      >
                        <span className="markdown-editor__reference-option-main">
                          <strong>{candidate.title}</strong>
                          <span className="markdown-editor__reference-option-type">
                            {getInternalReferenceTypeLabel(candidate.contentType, candidate.isTopicNode)}
                          </span>
                        </span>
                        <span className="markdown-editor__reference-option-meta">{candidate.identifier}</span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="markdown-editor__reference-empty">没有找到匹配内容，继续输入或换个关键词。</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <textarea
        id={textareaId}
        ref={textareaRef}
        aria-label="Markdown 编辑器"
        className="editor-textarea editor-textarea--editor-canvas"
        value={value}
        disabled={isUploadingImage}
        onChange={(event) => {
          const nextSelection = getSelectionRange(event.currentTarget)
          setDismissedInternalReferenceKey(null)
          dispatchValueChange(event.target.value, nextSelection)
        }}
        onCompositionStart={() => {
          isComposingRef.current = true
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false
        }}
        onClick={(event) => {
          const nextSelection = getSelectionRange(event.currentTarget)
          trackedSelectionRef.current = nextSelection
          setEditorSelection(nextSelection)
        }}
        onSelect={(event) => {
          const nextSelection = getSelectionRange(event.currentTarget)
          trackedSelectionRef.current = nextSelection
          setEditorSelection(nextSelection)
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
    </section>
  )
}
