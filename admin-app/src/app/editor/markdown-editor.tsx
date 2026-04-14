import { useLayoutEffect, useRef } from 'react'

const INDENT = '  '

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
}

function getLineStart(value: string, index: number) {
  return value.lastIndexOf('\n', Math.max(index - 1, 0)) + 1
}

function getLineEnd(value: string, index: number) {
  const nextBreak = value.indexOf('\n', index)
  return nextBreak === -1 ? value.length : nextBreak
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

  if (line.startsWith(INDENT)) {
    return line.slice(INDENT.length)
  }

  if (line.startsWith(' ')) {
    return line.slice(1)
  }

  return line
}

function getNextOrderedMarker(marker: string) {
  const numberedMatch = marker.match(/^(\d+)([.)])$/)
  if (numberedMatch) {
    return `${Number(numberedMatch[1]) + 1}${numberedMatch[2]}`
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

function getContinuedListPrefix(line: string) {
  const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.+)$/)
  if (unorderedMatch) {
    return `${unorderedMatch[1]}${unorderedMatch[2]} `
  }

  const orderedMatch = line.match(/^(\s*)((?:\d+|[a-zA-Z])[.)])\s+(.+)$/)
  if (orderedMatch) {
    return `${orderedMatch[1]}${getNextOrderedMarker(orderedMatch[2])} `
  }

  return null
}

function getListPrefixToRemove(line: string) {
  const unorderedMatch = line.match(/^(\s*)([-*+])\s*$/)
  if (unorderedMatch) {
    return unorderedMatch[0]
  }

  const orderedMatch = line.match(/^(\s*)((?:\d+|[a-zA-Z])[.)])\s*$/)
  if (orderedMatch) {
    return orderedMatch[0]
  }

  return null
}

export default function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    if (!textareaRef.current || !pendingSelectionRef.current) {
      return
    }

    textareaRef.current.setSelectionRange(
      pendingSelectionRef.current.start,
      pendingSelectionRef.current.end,
    )
    pendingSelectionRef.current = null
  }, [value])

  const applyValue = (nextValue: string, nextSelection: { start: number; end: number }) => {
    pendingSelectionRef.current = nextSelection
    onChange(nextValue)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const { selectionStart, selectionEnd } = event.currentTarget

    if (event.key === 'Backspace' && selectionStart === selectionEnd) {
      const lineStart = getLineStart(value, selectionStart)
      const currentLine = value.slice(lineStart, getLineEnd(value, selectionStart))
      const indentOnlyPrefix = currentLine.match(/^(\s+)/)?.[0] || ''
      const cursorOffset = selectionStart - lineStart

      if (cursorOffset > 0 && cursorOffset <= indentOnlyPrefix.length) {
        const removedWidth = indentOnlyPrefix.startsWith('\t', Math.max(0, cursorOffset - 1))
          ? 1
          : Math.min(INDENT.length, cursorOffset)
        const removeStart = selectionStart - removedWidth
        event.preventDefault()
        const nextValue = `${value.slice(0, removeStart)}${value.slice(selectionEnd)}`
        applyValue(nextValue, { start: removeStart, end: removeStart })
        return
      }
    }

    if (event.key === 'Enter' && selectionStart === selectionEnd) {
      const lineStart = getLineStart(value, selectionStart)
      const currentLine = value.slice(lineStart, selectionStart)
      const listPrefixToRemove = getListPrefixToRemove(currentLine)

      if (listPrefixToRemove) {
        event.preventDefault()
        const nextValue = `${value.slice(0, lineStart)}${value.slice(selectionEnd)}`
        applyValue(nextValue, { start: lineStart, end: lineStart })
        return
      }

      const continuedPrefix = getContinuedListPrefix(currentLine)

      if (!continuedPrefix) {
        return
      }

      event.preventDefault()
      const nextValue = `${value.slice(0, selectionStart)}\n${continuedPrefix}${value.slice(selectionEnd)}`
      const nextCaret = selectionStart + 1 + continuedPrefix.length
      applyValue(nextValue, { start: nextCaret, end: nextCaret })
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    event.preventDefault()

    if (!event.shiftKey && selectionStart === selectionEnd) {
      const nextValue = `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`
      const nextCaret = selectionStart + INDENT.length
      applyValue(nextValue, { start: nextCaret, end: nextCaret })
      return
    }

    if (event.shiftKey && selectionStart === selectionEnd) {
      const lineStart = getLineStart(value, selectionStart)
      const lineEnd = getLineEnd(value, selectionStart)
      const currentLine = value.slice(lineStart, lineEnd)
      const unindentedLine = removeIndent(currentLine)
      const removedCount = currentLine.length - unindentedLine.length

      if (removedCount === 0) {
        return
      }

      const nextValue = `${value.slice(0, lineStart)}${unindentedLine}${value.slice(lineEnd)}`
      const nextCaret = Math.max(lineStart, selectionStart - removedCount)
      applyValue(nextValue, { start: nextCaret, end: nextCaret })
      return
    }

    const { start, end } = getSelectedLineRange(value, selectionStart, selectionEnd)
    const selectedBlock = value.slice(start, end)
    const nextBlock = selectedBlock
      .split('\n')
      .map((line) => (event.shiftKey ? removeIndent(line) : `${INDENT}${line}`))
      .join('\n')
    const nextValue = `${value.slice(0, start)}${nextBlock}${value.slice(end)}`

    applyValue(nextValue, { start, end: start + nextBlock.length })
  }

  return (
    <label className="editor-surface editor-surface--editor-canvas">
      <span className="editor-surface__label">Markdown 编辑</span>
      <span className="editor-surface__hint">适合精确保留旧语法、嵌入与原始结构。</span>
      <textarea
        ref={textareaRef}
        aria-label="Markdown 编辑器"
        className="editor-textarea editor-textarea--editor-canvas"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />
    </label>
  )
}
