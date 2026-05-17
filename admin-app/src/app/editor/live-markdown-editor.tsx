import { useEffect, useMemo, useState } from 'react'
import type { ResolvedContentFormat } from '../content-format'
import type { InternalReferenceCandidate } from '../internal-links'
import type { ContentType, KnowledgeSourceType } from '../posts/post-types'
import MarkdownEditor from './markdown-editor'
import PreviewPane from './preview-pane'

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

type ParsedBlockRange = {
  start: number
  end: number
  text: string
}

type FocusPlacement = 'start' | 'end'

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

function getLineStartOffsets(lines: string[]) {
  const offsets: number[] = []
  let offset = 0

  for (const line of lines) {
    offsets.push(offset)
    offset += line.length + 1
  }

  return offsets
}

function sliceLines(lines: string[], startLine: number, endLine: number) {
  return lines.slice(startLine, endLine + 1).join('\n')
}

function parseMarkdownBlockRanges(markdown: string): ParsedBlockRange[] {
  if (!markdown.trim()) {
    return []
  }

  const lines = markdown.split('\n')
  const lineOffsets = getLineStartOffsets(lines)
  const blocks: ParsedBlockRange[] = []
  let lineIndex = 0

  while (lineIndex < lines.length) {
    if (isBlankLine(lines[lineIndex])) {
      lineIndex += 1
      continue
    }

    const startLine = lineIndex
    let endLine = lineIndex

    if (isFenceLine(lines[lineIndex])) {
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
    } else if (isHeadingLine(lines[lineIndex]) || isHorizontalRule(lines[lineIndex])) {
      lineIndex += 1
    } else if (isListLine(lines[lineIndex])) {
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
    } else if (isBlockquoteLine(lines[lineIndex])) {
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

    const blockStart = lineOffsets[startLine]
    const blockEnd = lineOffsets[endLine] + lines[endLine].length
    blocks.push({
      start: blockStart,
      end: blockEnd,
      text: sliceLines(lines, startLine, endLine),
    })
  }

  return blocks
}

function normalizeBlocks(markdown: string) {
  const parsedBlocks = parseMarkdownBlockRanges(markdown).map((block) => block.text)
  return parsedBlocks.length > 0 ? parsedBlocks : ['']
}

function serializeBlocks(blocks: string[]) {
  const compactBlocks = blocks.filter((block) => block.trim().length > 0)
  if (compactBlocks.length === 0) {
    return ''
  }

  return compactBlocks.join('\n\n')
}

function getSafeActiveIndex(blocks: string[], requestedIndex: number) {
  if (blocks.length === 0) {
    return 0
  }

  return Math.min(Math.max(requestedIndex, 0), blocks.length - 1)
}

export default function LiveMarkdownEditor({
  documentKey,
  value,
  title,
  date,
  contentType,
  contentFormat,
  sourceType,
  sourceTitle,
  sourcePath,
  sourceUrl,
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
  const [blocks, setBlocks] = useState<string[]>(() => normalizeBlocks(value))
  const [activeBlockIndex, setActiveBlockIndex] = useState(() => Math.max(0, normalizeBlocks(value).length - 1))
  const [focusPlacement, setFocusPlacement] = useState<FocusPlacement>('end')

  const serializedValue = useMemo(() => serializeBlocks(blocks), [blocks])

  useEffect(() => {
    if (value === serializedValue) {
      return
    }

    const nextBlocks = normalizeBlocks(value)
    setBlocks(nextBlocks)
    setActiveBlockIndex(Math.max(0, nextBlocks.length - 1))
    setFocusPlacement('end')
  }, [serializedValue, value])

  useEffect(() => {
    const nextBlocks = normalizeBlocks(value)
    setBlocks(nextBlocks)
    setActiveBlockIndex(Math.max(0, nextBlocks.length - 1))
    setFocusPlacement('end')
  }, [documentKey])

  const commitBlocks = (nextBlocks: string[], nextActiveIndex: number, nextFocusPlacement: FocusPlacement) => {
    const safeBlocks = nextBlocks.length > 0 ? nextBlocks : ['']
    const safeActiveIndex = getSafeActiveIndex(safeBlocks, nextActiveIndex)

    setBlocks(safeBlocks)
    setActiveBlockIndex(safeActiveIndex)
    setFocusPlacement(nextFocusPlacement)
    onChange(serializeBlocks(safeBlocks))
  }

  const handleBlockChange = (blockIndex: number, nextText: string) => {
    const nextBlocks = blocks.slice()
    nextBlocks[blockIndex] = nextText
    setBlocks(nextBlocks)
    onChange(serializeBlocks(nextBlocks))
  }

  const activateBlock = (blockIndex: number, placement: FocusPlacement = 'end') => {
    setActiveBlockIndex(getSafeActiveIndex(blocks, blockIndex))
    setFocusPlacement(placement)
  }

  const handleSplitBlock = (blockIndex: number, selection: { start: number; end: number }, blockValue: string) => {
    if (selection.start === 0 && selection.end === 0 && blockValue.length === 0) {
      return true
    }

    const before = blockValue.slice(0, selection.start)
    const after = blockValue.slice(selection.end)
    const nextBlocks = blocks.slice()
    nextBlocks.splice(blockIndex, 1, before, after)
    commitBlocks(nextBlocks, blockIndex + 1, 'start')
    return true
  }

  const handleRemoveEmptyBlockBackward = (blockIndex: number) => {
    if (blocks.length === 1) {
      return false
    }

    const nextBlocks = blocks.slice()
    nextBlocks.splice(blockIndex, 1)
    commitBlocks(nextBlocks, Math.max(0, blockIndex - 1), 'end')
    return true
  }

  const handleMoveBetweenBlocks = (blockIndex: number, direction: 'up' | 'down') => {
    if (direction === 'up' && blockIndex > 0) {
      activateBlock(blockIndex - 1, 'end')
      return true
    }

    if (direction === 'down' && blockIndex < blocks.length - 1) {
      activateBlock(blockIndex + 1, 'start')
      return true
    }

    return false
  }

  const activeEditorKey = `${documentKey || 'document'}-${activeBlockIndex}-${focusPlacement}`

  return (
    <section className="single-pane-live-editor">
      <div className="single-pane-live-editor__header">
        <div className="single-pane-live-editor__title-group">
          <span className="editor-surface__label">
            实时写作
          </span>
          <span className="editor-surface__hint">同一块画布内编辑。`Enter` 进入下一块，`Shift + Enter` 继续在当前块内输入。</span>
        </div>
        <span className="single-pane-live-editor__badge">Single Canvas</span>
      </div>

      <div className="single-pane-live-editor__canvas">
        {blocks.map((block, blockIndex) => {
          const isActiveBlock = blockIndex === activeBlockIndex

          if (isActiveBlock) {
            return (
              <div key={activeEditorKey} className="single-pane-live-editor__block single-pane-live-editor__block--active">
                <MarkdownEditor
                  value={block}
                  onChange={(nextValue) => handleBlockChange(blockIndex, nextValue)}
                  onToggleImmersive={onToggleImmersive}
                  isImmersive={isImmersive}
                  onUploadImage={onUploadImage}
                  internalReferenceCandidates={internalReferenceCandidates}
                  surfaceClassName="single-pane-live-editor__block-editor"
                  textareaClassName="single-pane-live-editor__textarea"
                  showMeta={false}
                  autoFocus
                  initialSelection={focusPlacement}
                  onSplitBlock={(selection, blockValue) => handleSplitBlock(blockIndex, selection, blockValue)}
                  onRemoveEmptyBlockBackward={() => handleRemoveEmptyBlockBackward(blockIndex)}
                  onMoveBetweenBlocks={(direction) => handleMoveBetweenBlocks(blockIndex, direction)}
                />
              </div>
            )
          }

          const previewKey = `${documentKey || 'document'}-preview-${blockIndex}-${block}`

          return (
            <div
              key={previewKey}
              className={`single-pane-live-editor__block${block.trim().length === 0 ? ' single-pane-live-editor__block--empty' : ''}`}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                const target = event.target as HTMLElement
                if (target.closest('a, button, summary, input, textarea')) {
                  return
                }

                activateBlock(blockIndex, 'end')
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  activateBlock(blockIndex, 'end')
                }
              }}
            >
              {block.trim().length > 0 ? (
                <PreviewPane
                  title={title}
                  date={date}
                  markdown={block}
                  contentFormat={contentFormat}
                  sourceType={sourceType}
                  sourceTitle={sourceTitle}
                  sourcePath={sourcePath}
                  sourceUrl={sourceUrl}
                  contentType={contentType}
                  previewImageUrls={previewImageUrls}
                  resolveWikiLinkTitle={resolveWikiLinkTitle}
                  onOpenWikiLink={onOpenWikiLink}
                  resolveInternalReferenceTitle={resolveInternalReferenceTitle}
                  onOpenInternalReference={onOpenInternalReference}
                  displayMode="live"
                />
              ) : (
                <div className="single-pane-live-editor__empty-block">空白段落</div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
