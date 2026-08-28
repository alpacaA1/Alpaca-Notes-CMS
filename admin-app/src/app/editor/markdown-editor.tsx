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
const LIST_DEBUG_STORAGE_KEY = 'alpaca-admin:list-debug:v1'

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
  editorFontFamily?: string
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

function ToolbarIcon({ name }: { name: 'link' | 'image' | 'code' | 'quote' | 'fullscreen' }) {
  if (name === 'link') {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m8 12 4-4M7.05 14.95l-1.1 1.1a3.1 3.1 0 0 1-4.4-4.4l3.2-3.2a3.1 3.1 0 0 1 4.4 0M12.95 5.05l1.1-1.1a3.1 3.1 0 1 1 4.4 4.4l-3.2 3.2a3.1 3.1 0 0 1-4.4 0" /></svg>
  }
  if (name === 'image') {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3" width="15" height="14" rx="1.7" /><circle cx="7" cy="7.5" r="1.25" /><path d="m3.5 14 4.2-4 2.75 2.55 2.05-1.85 4.1 3.3" /></svg>
  }
  if (name === 'code') {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.3 4-4 6 4 6M12.7 4l4 6-4 6M11.1 2.8 8.9 17.2" /></svg>
  }
  if (name === 'quote') {
    return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.4 6.2C5.9 7 4.5 8.8 4.5 11.4c0 1.55.9 2.65 2.3 2.65 1.25 0 2.2-.92 2.2-2.15 0-.96-.55-1.68-1.45-1.98.15-1.18.88-2.02 2.03-2.65L8.4 6.2Zm7.1 0c-2.5.8-3.9 2.6-3.9 5.2 0 1.55.9 2.65 2.3 2.65 1.25 0 2.2-.92 2.2-2.15 0-.96-.55-1.68-1.45-1.98.15-1.18.88-2.02 2.03-2.65L15.5 6.2Z" fill="currentColor" stroke="none" /></svg>
  }
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.3 3H3v4.3M12.7 3H17v4.3M17 12.7V17h-4.3M7.3 17H3v-4.3" /></svg>
}

function EditorCommandIcon({ name }: { name: 'divider' | 'table' | 'todo' | 'highlight' | 'more' }) {
  if (name === 'divider') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6.2h14M3 10h14M3 13.8h14" /></svg>
  if (name === 'table') return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="1.2" /><path d="M3 8h14M3 12h14M8 3v14" /></svg>
  if (name === 'todo') return <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3.2" y="3.2" width="13.6" height="13.6" rx="1.2" /><path d="m6.5 10 2.1 2.1 4.9-4.9" /></svg>
  if (name === 'highlight') return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.3 14.7 6.8-6.8 2.2 2.2-6.8 6.8-3 .8.8-3ZM12.6 5.2l1-1a1.55 1.55 0 0 1 2.2 2.2l-1 1" /><path d="M3.5 17.2h12.8" /></svg>
  return <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="5" cy="10" r="1.15" fill="currentColor" stroke="none" /><circle cx="10" cy="10" r="1.15" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="1.15" fill="currentColor" stroke="none" /></svg>
}

function isListDebugEnabled() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug-list') === '1'
}

function getListDebugExcerpt(value: string, selectionStart: number) {
  const lines = value.split('\n')
  const lineIndex = getLineIndex(value, Math.min(selectionStart, value.length))
  const start = Math.max(0, lineIndex - 3)
  const end = Math.min(lines.length, lineIndex + 4)
  return lines.slice(start, end).map((line, index) => `${start + index + 1}|${line}`).join('\n')
}

function recordListDebugEvent(
  type: string,
  value: string,
  selection: SelectionRange,
  details: Record<string, unknown> = {},
) {
  if (!isListDebugEnabled()) {
    return
  }

  try {
    const previous = JSON.parse(window.localStorage.getItem(LIST_DEBUG_STORAGE_KEY) || '[]') as unknown[]
    const entry = {
      sequence: previous.length + 1,
      type,
      selection,
      excerpt: getListDebugExcerpt(value, selection.start),
      ...details,
    }
    window.localStorage.setItem(LIST_DEBUG_STORAGE_KEY, JSON.stringify([...previous.slice(-39), entry]))
    console.info('[list-debug]', entry)
  } catch {
    // Diagnostics must never affect editing.
  }
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

function getExistingChildIndentWidth(lines: string[], lineIndex: number, parentIndentWidth: number) {
  let childIndentWidth: number | null = null

  for (let index = lineIndex - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line.trim()) {
      continue
    }

    const indentWidth = getIndentWidth(getLeadingWhitespace(line))
    if (indentWidth <= parentIndentWidth) {
      break
    }

    const orderedMatch = getOrderedLineMatch(line)
    if (orderedMatch) {
      childIndentWidth = childIndentWidth === null
        ? orderedMatch.indentWidth
        : Math.min(childIndentWidth, orderedMatch.indentWidth)
    }
  }

  return childIndentWidth
}

function indentLineInContext(lines: string[], lineIndex: number) {
  const line = lines[lineIndex]
  const orderedMatch = getOrderedLineMatch(line)
  if (orderedMatch) {
    const targetIndentWidth = getExistingChildIndentWidth(lines, lineIndex, orderedMatch.indentWidth)
      ?? orderedMatch.indentWidth + LIST_INDENT.length
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

function getPreviousOrderedOrdinal(
  lines: string[],
  beforeLineIndex: number,
  context: {
    blockquotePrefix: string
    indentWidth: number
    kind: OrderedMarkerKind
    separator: string
    uppercase: boolean
  },
): number | null {
  for (let index = beforeLineIndex; index >= 0; index -= 1) {
    const line = lines[index]
    if (!line.trim()) {
      let hasPreceding = false
      for (let lookback = index - 1; lookback >= 0; lookback -= 1) {
        const prevLine = lines[lookback]
        if (!prevLine.trim()) {
          continue
        }
        const { blockquotePrefix, content } = splitBlockquotePrefix(prevLine)
        if (blockquotePrefix === context.blockquotePrefix) {
          const indent = getIndentWidth(getLeadingWhitespace(content))
          if (indent >= context.indentWidth) {
            hasPreceding = true
          }
        }
        break
      }
      if (!hasPreceding) {
        break
      }
      continue
    }

    const { blockquotePrefix, content } = splitBlockquotePrefix(line)
    if (blockquotePrefix !== context.blockquotePrefix) {
      break
    }

    const indentWidth = getIndentWidth(getLeadingWhitespace(content))
    if (indentWidth > context.indentWidth) {
      continue
    }

    if (indentWidth < context.indentWidth) {
      break
    }

    const lineContext = getOrderedListLineContext(line)
    if (
      lineContext &&
      lineContext.kind === context.kind &&
      lineContext.separator === context.separator &&
      lineContext.uppercase === context.uppercase
    ) {
      return lineContext.ordinal
    }

    break
  }

  return null
}

function renumberFollowingOrderedListLinesInArray(
  lines: string[],
  afterLineIndex: number,
  context: {
    blockquotePrefix: string
    indentWidth: number
    kind: OrderedMarkerKind
    separator: string
    uppercase: boolean
  },
  explicitNextOrdinal?: number,
): boolean {
  let nextOrdinal = explicitNextOrdinal
  if (nextOrdinal === undefined) {
    const prevOrdinal = getPreviousOrderedOrdinal(lines, afterLineIndex, context)
    nextOrdinal = prevOrdinal !== null ? prevOrdinal + 1 : 1
  }

  let changed = false

  for (let index = afterLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim()) {
      let hasContinuation = false
      for (let lookahead = index + 1; lookahead < lines.length; lookahead += 1) {
        const aheadLine = lines[lookahead]
        if (!aheadLine.trim()) {
          continue
        }
        const { blockquotePrefix: aheadBq, content: aheadContent } = splitBlockquotePrefix(aheadLine)
        if (aheadBq === context.blockquotePrefix) {
          const aheadIndent = getIndentWidth(getLeadingWhitespace(aheadContent))
          if (aheadIndent >= context.indentWidth) {
            hasContinuation = true
          }
        }
        break
      }
      if (!hasContinuation) {
        break
      }
      continue
    }

    const { blockquotePrefix, content } = splitBlockquotePrefix(line)
    if (blockquotePrefix !== context.blockquotePrefix) {
      break
    }

    const indentWidth = getIndentWidth(getLeadingWhitespace(content))
    if (indentWidth > context.indentWidth) {
      continue
    }

    if (indentWidth < context.indentWidth) {
      break
    }

    const lineContext = getOrderedListLineContext(line)
    if (
      !lineContext ||
      lineContext.kind !== context.kind ||
      lineContext.separator !== context.separator ||
      lineContext.uppercase !== context.uppercase
    ) {
      break
    }

    const nextLine = `${lineContext.blockquotePrefix}${buildIndentWhitespace(lineContext.indentWidth)}${formatOrderedMarker(context.kind, nextOrdinal, context.separator, context.uppercase)}${lineContext.suffix}`
    if (nextLine !== line) {
      lines[index] = nextLine
      changed = true
    }
    nextOrdinal += 1
  }

  return changed
}

function renumberFollowingOrderedListLines(value: string, insertedLineIndex: number) {
  const lines = value.split('\n')
  const insertedLine = lines[insertedLineIndex]
  const insertedContext = insertedLine ? getOrderedListLineContext(insertedLine) : null
  if (!insertedContext) {
    return value
  }

  const changed = renumberFollowingOrderedListLinesInArray(
    lines,
    insertedLineIndex,
    insertedContext,
    insertedContext.ordinal + 1,
  )
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

  const minIndex = Math.min(currentLineIndex, targetLineIndex)
  const firstContext = getOrderedListLineContext(nextLines[minIndex])
  if (firstContext) {
    renumberFollowingOrderedListLinesInArray(nextLines, minIndex - 1, firstContext)
  }

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
  editorFontFamily,
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
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollTimerRef = useRef<number | null>(null)
  const [editorSelection, setEditorSelection] = useState<SelectionRange>({ start: 0, end: 0 })
  const [activeInternalReferenceIndex, setActiveInternalReferenceIndex] = useState(0)
  const [dismissedInternalReferenceKey, setDismissedInternalReferenceKey] = useState<string | null>(null)
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false)
  const textareaId = useId()

  const handleScroll = () => {
    setIsScrolling(true)
    if (scrollTimerRef.current !== null) {
      window.clearTimeout(scrollTimerRef.current)
    }
    scrollTimerRef.current = window.setTimeout(() => {
      setIsScrolling(false)
    }, 800)
  }

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

  useEffect(() => {
    if (isListDebugEnabled()) {
      window.localStorage.removeItem(LIST_DEBUG_STORAGE_KEY)
    }
  }, [])

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
    recordListDebugEvent('dispatch', nextValue, nextSelection, {
      previousExcerpt: getListDebugExcerpt(currentValueRef.current, previousSelection.start),
    })

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

  const getToolbarSelection = () => {
    const selection = getSelectionRange(textareaRef.current)
    trackedSelectionRef.current = selection
    setEditorSelection(selection)
    return selection
  }

  const focusEditor = () => {
    window.requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const applyInlineFormat = (prefix: string, suffix: string, placeholder: string) => {
    const selection = getToolbarSelection()
    const selectedText = currentValueRef.current.slice(selection.start, selection.end)
    const directPrefixStart = selection.start - prefix.length
    const directSuffixEnd = selection.end + suffix.length
    const hasDirectMarkers =
      currentValueRef.current.slice(Math.max(0, directPrefixStart), selection.start) === prefix
      && currentValueRef.current.slice(selection.end, directSuffixEnd) === suffix
    const hasSelectedMarkers = selectedText.startsWith(prefix) && selectedText.endsWith(suffix)
    const cursorPrefixStart = selection.start === selection.end
      ? currentValueRef.current.lastIndexOf(prefix, Math.max(0, selection.start - 1))
      : -1
    const cursorSuffixStart = selection.start === selection.end
      ? currentValueRef.current.indexOf(suffix, selection.end)
      : -1
    const hasCursorMarkers =
      cursorPrefixStart >= 0
      && cursorSuffixStart >= selection.end
      && !currentValueRef.current.slice(cursorPrefixStart + prefix.length, cursorSuffixStart).includes('\n')

    if (hasDirectMarkers || hasSelectedMarkers || hasCursorMarkers) {
      const markerStart = hasDirectMarkers
        ? directPrefixStart
        : hasSelectedMarkers
          ? selection.start
          : cursorPrefixStart
      const contentStart = markerStart + prefix.length
      const markerEnd = hasDirectMarkers
        ? directSuffixEnd
        : hasSelectedMarkers
          ? selection.end
          : cursorSuffixStart + suffix.length
      const contentEnd = markerEnd - suffix.length
      const content = currentValueRef.current.slice(contentStart, contentEnd)
      const nextValue = `${currentValueRef.current.slice(0, markerStart)}${content}${currentValueRef.current.slice(markerEnd)}`
      const cursorOffset = Math.max(0, selection.start - contentStart)
      const nextStart = markerStart + Math.min(cursorOffset, content.length)
      const nextEnd = selection.start === selection.end ? nextStart : markerStart + content.length
      dispatchValueChange(nextValue, { start: nextStart, end: nextEnd }, selection)
      focusEditor()
      return
    }

    const { nextValue, nextSelection } = wrapSelection(
      currentValueRef.current,
      selection.start,
      selection.end,
      prefix,
      suffix,
      placeholder,
    )
    dispatchValueChange(nextValue, nextSelection, selection)
    focusEditor()
  }

  const applyHeading = (level: 1 | 2 | 3) => {
    const selection = getToolbarSelection()
    const { start, end } = getSelectedLineRange(currentValueRef.current, selection.start, selection.end)
    const selectedText = currentValueRef.current.slice(start, end)
    const marker = '#'.repeat(level)
    const lines = selectedText.split('\n')
    const isAlreadyThisHeading = lines.length > 0 && lines.every((line) => new RegExp(`^\\s*${marker}\\s+`).test(line))
    const nextBlock = selectedText
      .split('\n')
      .map((line) => {
        const existingHeading = line.match(/^(\s*)#{1,6}\s*(.*)$/)
        if (existingHeading) {
          if (isAlreadyThisHeading) {
            return `${existingHeading[1]}${existingHeading[2]}`
          }
          return `${existingHeading[1]}${marker} ${existingHeading[2]}`
        }
        return line.trim() ? `${marker} ${line}` : line
      })
      .join('\n')
    const nextValue = `${currentValueRef.current.slice(0, start)}${nextBlock}${currentValueRef.current.slice(end)}`
    dispatchValueChange(nextValue, { start, end: start + nextBlock.length }, selection)
    focusEditor()
  }

  const toggleLinePrefix = (prefix: string) => {
    const selection = getToolbarSelection()
    const { start, end } = getSelectedLineRange(currentValueRef.current, selection.start, selection.end)
    const selectedText = currentValueRef.current.slice(start, end)
    const lines = selectedText.split('\n')
    const everyLineHasPrefix = lines.every((line) => line.startsWith(prefix))
    const nextBlock = lines
      .map((line) => everyLineHasPrefix ? line.slice(prefix.length) : `${prefix}${line}`)
      .join('\n')
    const nextValue = `${currentValueRef.current.slice(0, start)}${nextBlock}${currentValueRef.current.slice(end)}`
    dispatchValueChange(nextValue, { start, end: start + nextBlock.length }, selection)
    focusEditor()
  }

  const applyCodeFormat = () => {
    const selection = getToolbarSelection()
    const selectedText = currentValueRef.current.slice(selection.start, selection.end)
    const fencePrefix = '```\n'
    const fenceSuffix = '\n```'
    const hasCodeFence =
      currentValueRef.current.slice(Math.max(0, selection.start - fencePrefix.length), selection.start) === fencePrefix
      && currentValueRef.current.slice(selection.end, selection.end + fenceSuffix.length) === fenceSuffix

    if (hasCodeFence) {
      const nextStart = selection.start - fencePrefix.length
      const nextValue = `${currentValueRef.current.slice(0, nextStart)}${selectedText}${currentValueRef.current.slice(selection.end + fenceSuffix.length)}`
      dispatchValueChange(nextValue, { start: nextStart, end: nextStart + selectedText.length }, selection)
      focusEditor()
      return
    }

    if (selectedText.includes('\n')) {
      const nextValue = `${currentValueRef.current.slice(0, selection.start)}\`\`\`\n${selectedText || '代码'}\n\`\`\`${currentValueRef.current.slice(selection.end)}`
      const start = selection.start + 4
      dispatchValueChange(nextValue, { start, end: start + (selectedText || '代码').length }, selection)
      focusEditor()
      return
    }

    applyInlineFormat('`', '`', '代码')
  }

  const insertSnippet = (snippet: string, selection = getToolbarSelection()) => {
    const nextValue = `${currentValueRef.current.slice(0, selection.start)}${snippet}${currentValueRef.current.slice(selection.end)}`
    const caret = selection.start + snippet.length
    dispatchValueChange(nextValue, { start: caret, end: caret }, selection)
    focusEditor()
  }

  const insertDivider = () => {
    const selection = getToolbarSelection()
    const lineStart = getLineStart(currentValueRef.current, selection.start)
    const lineEnd = getLineEnd(currentValueRef.current, selection.end)
    if (currentValueRef.current.slice(lineStart, lineEnd).trim() === '---') {
      const nextValue = `${currentValueRef.current.slice(0, lineStart)}${currentValueRef.current.slice(lineEnd + (currentValueRef.current[lineEnd] === '\n' ? 1 : 0))}`
      dispatchValueChange(nextValue, { start: lineStart, end: lineStart }, selection)
      focusEditor()
      return
    }
    insertSnippet(`${currentValueRef.current ? '\n\n' : ''}---\n\n`, selection)
  }
  const insertTable = () => insertSnippet('| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |')
  const toggleTodo = () => toggleLinePrefix('- [ ] ')
  const applyHighlight = () => applyInlineFormat('==', '==', '高亮')

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

    if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Backspace') {
      recordListDebugEvent('keydown', event.currentTarget.value, selection, {
        key: event.key,
        isComposing: isComposingRef.current,
        nativeIsComposing: nativeKeyEvent.isComposing === true,
        keyCode: nativeKeyEvent.keyCode,
      })
    }

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
        const oldContext = getOrderedListLineContext(currentLine)
        const lines = value.split('\n')
        const nextLine = outdentLineInContext(lines, lineIndex)
        lines[lineIndex] = nextLine
        const newContext = getOrderedListLineContext(nextLine)
        if (oldContext) {
          renumberFollowingOrderedListLinesInArray(lines, lineIndex, oldContext)
        }
        if (newContext) {
          renumberFollowingOrderedListLinesInArray(lines, lineIndex, newContext, newContext.ordinal + 1)
        }
        const nextValue = lines.join('\n')
        const nextCaret = lineStart + nextLine.length
        dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
        return
      }

      if (!insideCodeFence && emptyListPrefix && selectionStart === lineEnd) {
        event.preventDefault()
        const oldContext = getOrderedListLineContext(currentLine)
        const lines = value.split('\n')
        lines[lineIndex] = ''
        if (oldContext) {
          renumberFollowingOrderedListLinesInArray(lines, lineIndex, oldContext)
        }
        const nextValue = lines.join('\n')
        dispatchValueChange(nextValue, { start: lineStart, end: lineStart }, selection)
        return
      }

      if (cursorOffset > 0 && cursorOffset <= indentOnlyPrefix.length) {
        if (!insideCodeFence && isListLine) {
          const lines = value.split('\n')
          const oldContext = getOrderedListLineContext(lines[lineIndex])
          const nextLine = outdentLineInContext(lines, lineIndex)
          if (nextLine !== currentLine) {
            event.preventDefault()
            lines[lineIndex] = nextLine
            const newContext = getOrderedListLineContext(nextLine)
            if (oldContext) {
              renumberFollowingOrderedListLinesInArray(lines, lineIndex, oldContext)
            }
            if (newContext) {
              renumberFollowingOrderedListLinesInArray(lines, lineIndex, newContext, newContext.ordinal + 1)
            }
            const nextValue = lines.join('\n')
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
        const oldContext = getOrderedListLineContext(currentLine)
        const lineIndex = getLineIndex(value, lineStart)
        const lines = value.split('\n')
        lines[lineIndex] = ''
        if (oldContext) {
          renumberFollowingOrderedListLinesInArray(lines, lineIndex, oldContext)
        }
        const nextValue = lines.join('\n')
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

      if (
        selectionStart === lineStart
        || (emptyListPrefix && selectionStart === lineEnd)
        || getOrderedLineMatch(currentLine)
        || isBulletListLine(currentLine)
      ) {
        const oldContext = getOrderedListLineContext(currentLine)
        const lines = value.split('\n')
        const indentedLine = indentLineInContext(lines, lineIndex)
        lines[lineIndex] = indentedLine
        const newContext = getOrderedListLineContext(indentedLine)
        if (oldContext) {
          renumberFollowingOrderedListLinesInArray(lines, lineIndex, oldContext)
        }
        if (newContext) {
          renumberFollowingOrderedListLinesInArray(lines, lineIndex, newContext, newContext.ordinal + 1)
        }
        const nextValue = lines.join('\n')
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
      const oldContext = getOrderedListLineContext(lines[lineIndex])
      const outdentedLine = outdentLineInContext(lines, lineIndex)
      const removedCount = currentLine.length - outdentedLine.length

      if (removedCount === 0) {
        return
      }

      lines[lineIndex] = outdentedLine
      const newContext = getOrderedListLineContext(outdentedLine)
      if (oldContext) {
        renumberFollowingOrderedListLinesInArray(lines, lineIndex, oldContext)
      }
      if (newContext) {
        renumberFollowingOrderedListLinesInArray(lines, lineIndex, newContext, newContext.ordinal + 1)
      }
      const nextValue = lines.join('\n')
      const nextCaret = Math.max(lineStart, selectionStart - removedCount)
      dispatchValueChange(nextValue, { start: nextCaret, end: nextCaret }, selection)
      return
    }

    const { start, end } = getSelectedLineRange(value, selectionStart, selectionEnd)
    const startLineIndex = getLineIndex(value, start)
    const endLineIndex = getLineIndex(value, end)
    const lines = value.split('\n')
    const oldContexts = lines
      .slice(startLineIndex, endLineIndex + 1)
      .map((line) => getOrderedListLineContext(line))
      .filter((context): context is NonNullable<typeof context> => Boolean(context))

    for (let index = startLineIndex; index <= endLineIndex; index += 1) {
      lines[index] = event.shiftKey ? outdentLineInContext(lines, index) : indentLineInContext(lines, index)
    }

    const newContexts = lines
      .slice(startLineIndex, endLineIndex + 1)
      .map((line) => getOrderedListLineContext(line))
      .filter((context): context is NonNullable<typeof context> => Boolean(context))

    const allContexts = [...oldContexts, ...newContexts]
    const seenContexts = new Set<string>()
    for (const ctx of allContexts) {
      const key = `${ctx.blockquotePrefix}|${ctx.indentWidth}|${ctx.kind}|${ctx.separator}|${ctx.uppercase}`
      if (!seenContexts.has(key)) {
        seenContexts.add(key)
        renumberFollowingOrderedListLinesInArray(lines, endLineIndex, ctx)
      }
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
    if (editorFontFamily !== undefined) {
      customProperties['--md-editor-font-family'] = editorFontFamily
    }

    if (Object.keys(customProperties).length === 0) {
      return undefined
    }

    return customProperties as CSSProperties
  }, [editorFontSize, editorFontWeight, editorFontFamily])

  return (
    <section className="editor-surface editor-surface--editor-canvas" style={editorFontStyle}>
      <div className="markdown-editor__toolbar" role="toolbar" aria-label="文章格式工具栏">
        <div className="markdown-editor__format-actions">
          <button type="button" className="markdown-editor__format-button markdown-editor__format-button--heading" onMouseDown={(event) => event.preventDefault()} onClick={() => applyHeading(1)} aria-label="一级标题">H1</button>
          <button type="button" className="markdown-editor__format-button markdown-editor__format-button--heading" onMouseDown={(event) => event.preventDefault()} onClick={() => applyHeading(2)} aria-label="二级标题">H2</button>
          <button type="button" className="markdown-editor__format-button markdown-editor__format-button--heading" onMouseDown={(event) => event.preventDefault()} onClick={() => applyHeading(3)} aria-label="三级标题">H3</button>
          <span className="markdown-editor__toolbar-divider" aria-hidden="true" />
          <button type="button" className="markdown-editor__format-button markdown-editor__format-button--bold" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormat('**', '**', '粗体')} aria-label="粗体">B</button>
          <button type="button" className="markdown-editor__format-button markdown-editor__format-button--italic" onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormat('*', '*', '斜体')} aria-label="斜体">I</button>
          <span className="markdown-editor__toolbar-divider" aria-hidden="true" />
          <button type="button" className="markdown-editor__format-button" onMouseDown={(event) => event.preventDefault()} onClick={insertDivider} aria-label="插入分割线"><EditorCommandIcon name="divider" /><span>分割线</span></button>
          <button type="button" className="markdown-editor__format-button" onMouseDown={(event) => event.preventDefault()} onClick={insertTable} aria-label="插入表格"><EditorCommandIcon name="table" /><span>表格</span></button>
          <button type="button" className="markdown-editor__format-button" onMouseDown={(event) => event.preventDefault()} onClick={toggleTodo} aria-label="待办"><EditorCommandIcon name="todo" /><span>待办</span></button>
          <button type="button" className="markdown-editor__format-button" onMouseDown={(event) => event.preventDefault()} onClick={applyHighlight} aria-label="高亮"><EditorCommandIcon name="highlight" /><span>高亮</span></button>
          <div className="markdown-editor__more-menu">
            <button type="button" className={`markdown-editor__format-button markdown-editor__format-button--more${isMoreMenuOpen ? ' is-active' : ''}`} onMouseDown={(event) => event.preventDefault()} onClick={() => setIsMoreMenuOpen((current) => !current)} aria-label="更多格式" aria-haspopup="menu" aria-expanded={isMoreMenuOpen}><EditorCommandIcon name="more" /></button>
            {isMoreMenuOpen ? <div className="markdown-editor__more-popover" role="menu">
              <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => { insertLinkMarkdown(getToolbarSelection()); setIsMoreMenuOpen(false) }}><ToolbarIcon name="link" /><span>链接</span></button>
              {onUploadImage ? <button type="button" role="menuitem" onMouseDown={(event) => { event.preventDefault(); handleUploadButtonMouseDown() }} onClick={() => { handleUploadButtonClick(); setIsMoreMenuOpen(false) }}><ToolbarIcon name="image" /><span>{isUploadingImage ? '上传中' : '图片'}</span></button> : null}
              <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => { applyCodeFormat(); setIsMoreMenuOpen(false) }}><ToolbarIcon name="code" /><span>代码</span></button>
              <button type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => { toggleLinePrefix('> '); setIsMoreMenuOpen(false) }}><ToolbarIcon name="quote" /><span>引用</span></button>
            </div> : null}
          </div>
        </div>
        <div className="markdown-editor__actions">
          {isListDebugEnabled() ? (
            <button
              type="button"
              className="markdown-editor__upload-button"
              onClick={() => {
                const diagnostics = window.localStorage.getItem(LIST_DEBUG_STORAGE_KEY) || '[]'
                void navigator.clipboard?.writeText(diagnostics)
              }}
            >
              复制列表诊断
            </button>
          ) : null}
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
            <button type="button" className="markdown-editor__immersive-button" onClick={onToggleImmersive}>
              <ToolbarIcon name="fullscreen" />
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
                        <span className="markdown-editor__reference-option-meta">{candidate.displayMeta || candidate.identifier}</span>
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
        className={`editor-textarea editor-textarea--editor-canvas${isScrolling ? ' is-scrolling' : ''}`}
        value={value}
        disabled={isUploadingImage}
        onScroll={handleScroll}
        onChange={(event) => {
          const nextSelection = getSelectionRange(event.currentTarget)
          recordListDebugEvent('change', event.target.value, nextSelection, {
            isComposing: isComposingRef.current,
          })
          setDismissedInternalReferenceKey(null)
          dispatchValueChange(event.target.value, nextSelection)
        }}
        onCompositionStart={() => {
          isComposingRef.current = true
          recordListDebugEvent('compositionstart', currentValueRef.current, trackedSelectionRef.current)
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false
          recordListDebugEvent('compositionend', currentValueRef.current, trackedSelectionRef.current)
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
