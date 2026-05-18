import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'

export type LiveRichParagraphEditorHandle = {
  focus: (placement?: 'start' | 'end') => void
}

type LiveRichParagraphEditorProps = {
  value: string
  className?: string
  ariaLabel?: string
  autoFocus?: boolean
  initialSelection?: 'start' | 'end'
  allowSoftBreaks?: boolean
  normalizeValue?: (value: string) => string
  onChange: (value: string) => void
  onSplitBlock?: (value: string) => boolean | void
  onRemoveEmptyBlockBackward?: () => boolean | void
  onMoveBetweenBlocks?: (direction: 'up' | 'down') => boolean | void
}

type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string; marker: '**' | '__' }
  | { type: 'em'; text: string; marker: '*' | '_' }
  | { type: 'code'; text: string }
  | { type: 'link'; label: string; href: string }

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll("'", '&#39;')
}

function pushTextToken(tokens: InlineToken[], text: string) {
  if (!text) {
    return
  }

  const lastToken = tokens[tokens.length - 1]
  if (lastToken?.type === 'text') {
    lastToken.text += text
    return
  }

  tokens.push({ type: 'text', text })
}

function parseInlineMarkdownTokens(markdown: string): InlineToken[] {
  const tokens: InlineToken[] = []
  let index = 0

  while (index < markdown.length) {
    const codeMatch = markdown.slice(index).match(/^`([^`\n]+)`/)
    if (codeMatch) {
      tokens.push({ type: 'code', text: codeMatch[1] })
      index += codeMatch[0].length
      continue
    }

    const linkMatch = markdown.slice(index).match(/^\[([^\]\n]+)\]\(([^)\n]+)\)/)
    if (linkMatch) {
      tokens.push({ type: 'link', label: linkMatch[1], href: linkMatch[2] })
      index += linkMatch[0].length
      continue
    }

    const strongMatch = markdown.slice(index).match(/^(\*\*|__)([^\n]+?)\1/)
    if (strongMatch) {
      tokens.push({
        type: 'strong',
        marker: strongMatch[1] as '**' | '__',
        text: strongMatch[2],
      })
      index += strongMatch[0].length
      continue
    }

    const emMatch = markdown.slice(index).match(/^(\*|_)([^\n]+?)\1/)
    if (emMatch) {
      tokens.push({
        type: 'em',
        marker: emMatch[1] as '*' | '_',
        text: emMatch[2],
      })
      index += emMatch[0].length
      continue
    }

    pushTextToken(tokens, markdown[index])
    index += 1
  }

  return tokens
}

export function hasRenderableInlineMarkdown(markdown: string) {
  if (!markdown.trim()) {
    return false
  }

  if (markdown.includes('[[') || markdown.includes('![')) {
    return false
  }

  return parseInlineMarkdownTokens(markdown).some((token) => token.type !== 'text')
}

function renderTextToken(text: string) {
  return escapeHtml(text).replaceAll('\n', '<br data-md-br="1" />')
}

function renderEditableHtml(markdown: string) {
  return parseInlineMarkdownTokens(markdown)
    .map((token) => {
      if (token.type === 'text') {
        return renderTextToken(token.text)
      }

      if (token.type === 'strong') {
        return `<strong data-md-token="strong" data-md-marker="${escapeAttr(token.marker)}">${renderTextToken(token.text)}</strong>`
      }

      if (token.type === 'em') {
        return `<em data-md-token="em" data-md-marker="${escapeAttr(token.marker)}">${renderTextToken(token.text)}</em>`
      }

      if (token.type === 'code') {
        return `<code data-md-token="code">${renderTextToken(token.text)}</code>`
      }

      return `<a data-md-token="link" data-md-href="${escapeAttr(token.href)}" href="${escapeAttr(token.href)}">${renderTextToken(token.label)}</a>`
    })
    .join('')
}

function serializeEditableNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return ''
  }

  const element = node as HTMLElement

  if (element.tagName === 'BR') {
    return '\n'
  }

  const childContent = Array.from(element.childNodes).map(serializeEditableNode).join('')
  const tokenType = element.dataset.mdToken

  if (tokenType === 'strong') {
    const marker = element.dataset.mdMarker === '__' ? '__' : '**'
    return `${marker}${childContent}${marker}`
  }

  if (tokenType === 'em') {
    const marker = element.dataset.mdMarker === '_' ? '_' : '*'
    return `${marker}${childContent}${marker}`
  }

  if (tokenType === 'code') {
    return `\`${childContent}\``
  }

  if (tokenType === 'link') {
    const href = element.dataset.mdHref ?? element.getAttribute('href') ?? ''
    return `[${childContent}](${href})`
  }

  if (element.tagName === 'STRONG' || element.tagName === 'B') {
    return `**${childContent}**`
  }

  if (element.tagName === 'EM' || element.tagName === 'I') {
    return `*${childContent}*`
  }

  if (element.tagName === 'CODE') {
    return `\`${childContent}\``
  }

  if (element.tagName === 'A') {
    const href = element.getAttribute('href') ?? ''
    return `[${childContent}](${href})`
  }

  return childContent
}

function serializeEditableRoot(root: HTMLElement) {
  return Array.from(root.childNodes).map(serializeEditableNode).join('')
}

function getSelectionRange(root: HTMLElement) {
  const selection = root.ownerDocument.defaultView?.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null
  }

  return range
}

function isSelectionAtBoundary(root: HTMLElement, boundary: 'start' | 'end') {
  const range = getSelectionRange(root)
  if (!range || !range.collapsed) {
    return false
  }

  const markerRange = root.ownerDocument.createRange()
  markerRange.selectNodeContents(root)
  markerRange.collapse(boundary === 'start')

  return boundary === 'start'
    ? range.compareBoundaryPoints(Range.START_TO_START, markerRange) === 0
    : range.compareBoundaryPoints(Range.END_TO_END, markerRange) === 0
}

function setSelectionToBoundary(root: HTMLElement, placement: 'start' | 'end') {
  const selection = root.ownerDocument.defaultView?.getSelection()
  if (!selection) {
    return
  }

  const range = root.ownerDocument.createRange()
  range.selectNodeContents(root)
  range.collapse(placement === 'start')
  selection.removeAllRanges()
  selection.addRange(range)
}

function insertPlainTextAtSelection(root: HTMLElement, text: string) {
  const selection = root.ownerDocument.defaultView?.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return
  }

  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return
  }

  range.deleteContents()

  const fragment = root.ownerDocument.createDocumentFragment()
  const lines = text.split('\n')

  lines.forEach((line, index) => {
    if (line.length > 0) {
      fragment.appendChild(root.ownerDocument.createTextNode(line))
    }

    if (index < lines.length - 1) {
      fragment.appendChild(root.ownerDocument.createElement('br'))
    }
  })

  const lastNode = fragment.lastChild
  range.insertNode(fragment)

  if (!selection) {
    return
  }

  const nextRange = root.ownerDocument.createRange()
  if (lastNode) {
    nextRange.setStartAfter(lastNode)
  } else {
    nextRange.selectNodeContents(root)
    nextRange.collapse(false)
  }
  nextRange.collapse(true)
  selection.removeAllRanges()
  selection.addRange(nextRange)
}

const LiveRichParagraphEditor = forwardRef<LiveRichParagraphEditorHandle, LiveRichParagraphEditorProps>(function LiveRichParagraphEditor({
  value,
  className,
  ariaLabel = 'Markdown 段落编辑器',
  autoFocus = false,
  initialSelection = 'end',
  allowSoftBreaks = true,
  normalizeValue = (nextValue) => nextValue,
  onChange,
  onSplitBlock,
  onRemoveEmptyBlockBackward,
  onMoveBetweenBlocks,
}, ref) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const expectedValueRef = useRef<string | null>(null)

  const syncDomFromValue = (nextValue: string) => {
    if (!editorRef.current) {
      return
    }

    const nextHtml = renderEditableHtml(nextValue)
    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml
    }
  }

  const emitChangeFromDom = () => {
    if (!editorRef.current) {
      return
    }

    const nextValue = normalizeValue(serializeEditableRoot(editorRef.current))
    if (nextValue === value) {
      return
    }

    expectedValueRef.current = nextValue
    onChange(nextValue)
  }

  useImperativeHandle(ref, () => ({
    focus: (placement = 'end') => {
      if (!editorRef.current) {
        return
      }

      editorRef.current.focus()
      setSelectionToBoundary(editorRef.current, placement)
    },
  }), [])

  useLayoutEffect(() => {
    if (expectedValueRef.current === value) {
      expectedValueRef.current = null
      return
    }

    syncDomFromValue(value)
  }, [value])

  useEffect(() => {
    syncDomFromValue(value)
  }, [])

  useEffect(() => {
    if (!autoFocus || !editorRef.current) {
      return
    }

    editorRef.current.focus()
    setSelectionToBoundary(editorRef.current, initialSelection)
  }, [autoFocus, initialSelection])

  return (
    <div
      ref={editorRef}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="true"
      className={className}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onInput={() => {
        emitChangeFromDom()
      }}
      onPaste={(event) => {
        const pastedText = normalizeValue(event.clipboardData.getData('text/plain'))
        if (!pastedText) {
          return
        }

        event.preventDefault()
        insertPlainTextAtSelection(event.currentTarget, pastedText)
        emitChangeFromDom()
      }}
      onKeyDown={(event) => {
        const root = event.currentTarget
        const currentValue = serializeEditableRoot(root)

        if (event.key === 'Enter') {
          const isAtEnd = isSelectionAtBoundary(root, 'end')
          if (isAtEnd && onSplitBlock?.(currentValue)) {
            event.preventDefault()
            return
          }

          if (!allowSoftBreaks) {
            event.preventDefault()
            return
          }

          event.preventDefault()
          insertPlainTextAtSelection(root, '\n')
          emitChangeFromDom()
          return
        }

        if (event.key === 'Backspace' && currentValue.length === 0 && onRemoveEmptyBlockBackward?.()) {
          event.preventDefault()
          return
        }

        if (event.key === 'ArrowUp' && isSelectionAtBoundary(root, 'start') && onMoveBetweenBlocks?.('up')) {
          event.preventDefault()
          return
        }

        if (event.key === 'ArrowDown' && isSelectionAtBoundary(root, 'end') && onMoveBetweenBlocks?.('down')) {
          event.preventDefault()
        }
      }}
    />
  )
})

export default LiveRichParagraphEditor
