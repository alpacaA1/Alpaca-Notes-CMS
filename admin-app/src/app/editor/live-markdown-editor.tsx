import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import type { ResolvedContentFormat } from '../content-format'
import type { InternalReferenceCandidate } from '../internal-links'
import type { ContentType, KnowledgeSourceType } from '../posts/post-types'
import MarkdownEditor, { type MarkdownEditorHandle } from './markdown-editor'
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

type FocusPlacement = 'start' | 'end'

type LiveNodeKind = 'paragraph' | 'heading' | 'list' | 'blockquote' | 'code-fence' | 'thematic-break'

type LiveNode = {
  id: string
  kind: LiveNodeKind
  text: string
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

function getSafeActiveIndex(nodes: LiveNode[], requestedIndex: number) {
  if (nodes.length === 0) {
    return 0
  }

  return Math.min(Math.max(requestedIndex, 0), nodes.length - 1)
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
  const wikiLinkOptions = useMemo(
    () => ({ resolveWikiLinkTitle, onOpenWikiLink, resolveInternalReferenceTitle, onOpenInternalReference }),
    [onOpenInternalReference, onOpenWikiLink, resolveInternalReferenceTitle, resolveWikiLinkTitle],
  )

  const serializedValue = useMemo(() => serializeNodes(nodes), [nodes])

  useEffect(() => {
    if (expectedValueRef.current === value) {
      expectedValueRef.current = null
      return
    }

    if (expectedValueRef.current) {
      return
    }

    if (value === serializedValue) {
      return
    }

    const nextNodes = normalizeNodes(value)
    setNodes(nextNodes)
    setActiveNodeIndex(Math.max(0, nextNodes.length - 1))
    setFocusPlacement('end')
  }, [serializedValue, value])

  useEffect(() => {
    expectedValueRef.current = null
    const nextNodes = normalizeNodes(value)
    setNodes(nextNodes)
    setActiveNodeIndex(Math.max(0, nextNodes.length - 1))
    setFocusPlacement('end')
    setRichEditingNodeId(null)
  }, [documentKey])

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
    setActiveNodeIndex(getSafeActiveIndex(nodes, nodeIndex))
    setFocusPlacement(placement)
  }

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
    <section className="single-pane-live-editor">
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
          <p className="single-pane-live-editor__document-toolbar-hint">回车提交当前段落，列表、引用和代码块保留原生 Markdown 编辑。</p>
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
      <article className="preview-content preview-content--live single-pane-live-editor__document">
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
          const textareaClassName = [
            'single-pane-live-editor__textarea',
            `single-pane-live-editor__textarea--${node.kind}`,
            headingLevel ? `single-pane-live-editor__textarea--heading-${headingLevel}` : null,
          ]
            .filter(Boolean)
            .join(' ')

          if (isActiveNode) {
            if (usesRichParagraphEditor || usesRichHeadingEditor) {
              const richEditorClassName = [
                'single-pane-live-editor__rich-editor',
                usesRichHeadingEditor ? 'single-pane-live-editor__rich-editor--heading' : null,
                usesRichHeadingEditor ? `single-pane-live-editor__rich-editor--heading-${parsedHeadingNode?.level}` : null,
              ]
                .filter(Boolean)
                .join(' ')
              const richEditorValue = usesRichHeadingEditor ? parsedHeadingNode?.content ?? '' : node.text

              return (
                <div key={node.id} className={blockClassName}>
                  <LiveRichParagraphEditor
                    ref={activeEditorRef as Ref<LiveRichParagraphEditorHandle>}
                    value={richEditorValue}
                    className={richEditorClassName}
                    ariaLabel={usesRichHeadingEditor ? 'Markdown 标题编辑器' : 'Markdown 段落编辑器'}
                    autoFocus
                    initialSelection={focusPlacement}
                    allowSoftBreaks={!usesRichHeadingEditor}
                    normalizeValue={usesRichHeadingEditor ? normalizeSingleLineText : undefined}
                    onChange={(nextValue) => {
                      if (usesRichHeadingEditor && parsedHeadingNode) {
                        updateNode(nodeIndex, `${parsedHeadingNode.prefix}${normalizeSingleLineText(nextValue)}`)
                        return
                      }

                      updateNode(nodeIndex, nextValue)
                    }}
                    onSplitBlock={(currentValue) => {
                      if (usesRichHeadingEditor && parsedHeadingNode) {
                        const nextValue = `${parsedHeadingNode.prefix}${normalizeSingleLineText(currentValue)}`
                        return handleSplitNode(
                          nodeIndex,
                          { start: nextValue.length, end: nextValue.length },
                          nextValue,
                        )
                      }

                      return handleSplitNode(
                        nodeIndex,
                        { start: currentValue.length, end: currentValue.length },
                        currentValue,
                      )
                    }}
                    onRemoveEmptyBlockBackward={() => handleRemoveEmptyNodeBackward(nodeIndex)}
                    onMoveBetweenBlocks={(direction) => handleMoveBetweenNodes(nodeIndex, direction)}
                  />
                </div>
              )
            }

            return (
              <div key={node.id} className={blockClassName}>
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
                />
              </div>
            )
          }

          if (node.text.trim().length === 0) {
            return null
          }

          return (
            <div
              key={node.id}
              className={blockClassName}
              onClick={(event) => {
                const target = event.target as HTMLElement
                if (target.closest('a, button, input, textarea')) {
                  return
                }

                if (target.closest('summary')) {
                  event.preventDefault()
                }

                activateNode(nodeIndex, 'end')
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
