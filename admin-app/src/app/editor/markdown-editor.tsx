import { useId, useLayoutEffect, useRef, useState } from 'react'

const INDENT = '  '
const ROMAN_MARKERS = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']

type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  onUploadImage?: (file: File) => Promise<{ markdown: string }>
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

function indentLine(line: string) {
  const topLevelOrderedMatch = line.match(/^(\d+)([.)])(\s.*)$/)
  if (topLevelOrderedMatch) {
    return `${INDENT}a${topLevelOrderedMatch[2]}${topLevelOrderedMatch[3]}`
  }

  const nestedAlphaMatch = line.match(/^(\s{2})([a-zA-Z])([.)])(\s.*)$/)
  if (nestedAlphaMatch) {
    return `${nestedAlphaMatch[1]}${INDENT}i${nestedAlphaMatch[3]}${nestedAlphaMatch[4]}`
  }

  return `${INDENT}${line}`
}

function outdentLine(line: string) {
  const nestedRomanMatch = line.match(/^(\s{4})i([.)])(\s.*)$/i)
  if (nestedRomanMatch) {
    return `${INDENT}a${nestedRomanMatch[2]}${nestedRomanMatch[3]}`
  }

  return removeIndent(line)
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
  const blockquoteMatch = line.match(/^(\s*(?:>\s?)+)(.*)$/)
  if (!blockquoteMatch) {
    return null
  }

  const [, prefix, content] = blockquoteMatch
  const continuedListPrefix = getContinuedListPrefix(content)
  if (continuedListPrefix) {
    return `${prefix}${continuedListPrefix}`
  }

  if (getListPrefixToRemove(content) || content.trim()) {
    return prefix.endsWith(' ') ? prefix : `${prefix} `
  }

  return null
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

export default function MarkdownEditor({
  value,
  onChange,
  onUploadImage,
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const currentValueRef = useRef(value)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const uploadSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
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
    pendingSelectionRef.current = null
  }, [value])

  const applyValue = (nextValue: string, nextSelection: { start: number; end: number }) => {
    pendingSelectionRef.current = nextSelection
    onChange(nextValue)
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
      applyValue(nextValue, { start: nextCaret, end: nextCaret })
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

    uploadSelectionRef.current = {
      start: textareaRef.current.selectionStart,
      end: textareaRef.current.selectionEnd,
    }
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

    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const wrap =
        normalizedKey === 'b'
          ? { prefix: '**', suffix: '**', placeholder: '粗体' }
          : normalizedKey === 'i'
            ? { prefix: '*', suffix: '*', placeholder: '斜体' }
            : normalizedKey === 'k'
              ? { prefix: '[', suffix: ']()', placeholder: '链接文本' }
              : null

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
        applyValue(nextValue, nextSelection)
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
          applyValue(nextState.nextValue, nextState.nextSelection)
        }
        return
      }
    }

    if (event.key === 'Backspace' && selectionStart === selectionEnd) {
      const lineStart = getLineStart(value, selectionStart)
      const lineEnd = getLineEnd(value, selectionStart)
      const currentLine = value.slice(lineStart, lineEnd)
      const emptyListPrefix = getListPrefixToRemove(currentLine)
      const indentOnlyPrefix = currentLine.match(/^(\s+)/)?.[0] || ''
      const cursorOffset = selectionStart - lineStart

      if (
        emptyListPrefix &&
        selectionStart === lineEnd &&
        (currentLine.startsWith(INDENT) || currentLine.startsWith('\t'))
      ) {
        event.preventDefault()
        const nextLine = outdentLine(currentLine)
        const nextValue = `${value.slice(0, lineStart)}${nextLine}${value.slice(lineEnd)}`
        const nextCaret = lineStart + nextLine.length
        applyValue(nextValue, { start: nextCaret, end: nextCaret })
        return
      }

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
      const codeFenceMatch = currentLine.match(/^(\s*)```(?:[^`]*)$/)

      if (codeFenceMatch) {
        event.preventDefault()
        const indent = codeFenceMatch[1]
        const nextValue = `${value.slice(0, selectionStart)}\n${indent}\n${indent}\`\`\`${value.slice(selectionEnd)}`
        const nextCaret = selectionStart + 1 + indent.length
        applyValue(nextValue, { start: nextCaret, end: nextCaret })
        return
      }

      if (isInsideCodeFence(value, selectionStart)) {
        event.preventDefault()
        const indent = getCurrentLineIndent(currentLine)
        const nextValue = `${value.slice(0, selectionStart)}\n${indent}${value.slice(selectionEnd)}`
        const nextCaret = selectionStart + 1 + indent.length
        applyValue(nextValue, { start: nextCaret, end: nextCaret })
        return
      }

      const blockquoteContinuationPrefix = getBlockquoteContinuationPrefix(currentLine)
      if (blockquoteContinuationPrefix) {
        event.preventDefault()
        const nextValue = `${value.slice(0, selectionStart)}\n${blockquoteContinuationPrefix}${value.slice(selectionEnd)}`
        const nextCaret = selectionStart + 1 + blockquoteContinuationPrefix.length
        applyValue(nextValue, { start: nextCaret, end: nextCaret })
        return
      }

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
    event.stopPropagation()

    if (!event.shiftKey && selectionStart === selectionEnd) {
      const lineStart = getLineStart(value, selectionStart)
      const lineEnd = getLineEnd(value, selectionStart)
      const currentLine = value.slice(lineStart, lineEnd)
      const emptyListPrefix = getListPrefixToRemove(currentLine)

      if (isInsideCodeFence(value, selectionStart)) {
        const nextValue = `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`
        const nextCaret = selectionStart + INDENT.length
        applyValue(nextValue, { start: nextCaret, end: nextCaret })
        return
      }

      if (selectionStart === lineStart || (emptyListPrefix && selectionStart === lineEnd)) {
        const indentedLine = indentLine(currentLine)
        const nextValue = `${value.slice(0, lineStart)}${indentedLine}${value.slice(lineEnd)}`
        const nextCaret = selectionStart + (indentedLine.length - currentLine.length)
        applyValue(nextValue, { start: nextCaret, end: nextCaret })
        return
      }

      const nextValue = `${value.slice(0, selectionStart)}${INDENT}${value.slice(selectionEnd)}`
      const nextCaret = selectionStart + INDENT.length
      applyValue(nextValue, { start: nextCaret, end: nextCaret })
      return
    }

    if (event.shiftKey && selectionStart === selectionEnd) {
      const lineStart = getLineStart(value, selectionStart)
      const lineEnd = getLineEnd(value, selectionStart)
      const currentLine = value.slice(lineStart, lineEnd)
      const outdentedLine = outdentLine(currentLine)
      const removedCount = currentLine.length - outdentedLine.length

      if (removedCount === 0) {
        return
      }

      const nextValue = `${value.slice(0, lineStart)}${outdentedLine}${value.slice(lineEnd)}`
      const nextCaret = Math.max(lineStart, selectionStart - removedCount)
      applyValue(nextValue, { start: nextCaret, end: nextCaret })
      return
    }

    const { start, end } = getSelectedLineRange(value, selectionStart, selectionEnd)
    const selectedBlock = value.slice(start, end)
    const nextBlock = selectedBlock
      .split('\n')
      .map((line) => (event.shiftKey ? outdentLine(line) : indentLine(line)))
      .join('\n')
    const nextValue = `${value.slice(0, start)}${nextBlock}${value.slice(end)}`

    applyValue(nextValue, { start, end: start + nextBlock.length })
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFile = onUploadImage ? getImageFileFromClipboardData(event.clipboardData) : null
    if (imageFile) {
      event.preventDefault()
      event.stopPropagation()

      void insertUploadedMarkdown(imageFile, {
        start: event.currentTarget.selectionStart,
        end: event.currentTarget.selectionEnd,
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
    applyValue(nextValue, { start: nextCaret, end: nextCaret })
  }

  return (
    <section className="editor-surface editor-surface--editor-canvas">
      <div className="markdown-editor__toolbar">
        <div className="markdown-editor__meta">
          <label className="editor-surface__label" htmlFor={textareaId}>
            Markdown 编辑
          </label>
          <span className="editor-surface__hint">适合精确保留旧语法、嵌入与原始结构。</span>
        </div>
        {onUploadImage ? (
          <>
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
            <button
              type="button"
              className="markdown-editor__upload-button"
              disabled={isUploadingImage}
              onMouseDown={handleUploadButtonMouseDown}
              onClick={handleUploadButtonClick}
            >
              上传图片
            </button>
          </>
        ) : null}
      </div>
      <textarea
        id={textareaId}
        ref={textareaRef}
        aria-label="Markdown 编辑器"
        className="editor-textarea editor-textarea--editor-canvas"
        value={value}
        disabled={isUploadingImage}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
      />
    </section>
  )
}
