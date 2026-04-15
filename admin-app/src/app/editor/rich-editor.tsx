import { useEffect, useMemo, useState } from 'react'

type RichEditorProps = {
  value: string
  onChange: (value: string) => void
}

type RichBlock =
  | { id: string; type: 'heading'; level: number; text: string }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'quote'; text: string }
  | { id: string; type: 'list'; ordered: boolean; items: string[] }
  | { id: string; type: 'image'; alt: string; url: string }

function createBlockId(index: number) {
  return `block-${index}`
}

function parseRichMarkdown(markdown: string): RichBlock[] {
  const lines = markdown.split('\n')
  const blocks: RichBlock[] = []
  const paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return
    }

    blocks.push({ id: createBlockId(blocks.length), type: 'paragraph', text: paragraph.join(' ') })
    paragraph.length = 0
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph()
      blocks.push({
        id: createBlockId(blocks.length),
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2],
      })
      continue
    }

    const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (imageMatch) {
      flushParagraph()
      blocks.push({
        id: createBlockId(blocks.length),
        type: 'image',
        alt: imageMatch[1],
        url: imageMatch[2],
      })
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph()
      const quoteLines = [trimmed.replace(/^>\s?/, '')]
      while (index + 1 < lines.length && /^>\s?/.test(lines[index + 1].trim())) {
        index += 1
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''))
      }
      blocks.push({ id: createBlockId(blocks.length), type: 'quote', text: quoteLines.join('\n') })
      continue
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/)
    if (unorderedMatch) {
      flushParagraph()
      const items = [unorderedMatch[1]]
      while (index + 1 < lines.length) {
        const nextMatch = lines[index + 1].trim().match(/^[-*+]\s+(.*)$/)
        if (!nextMatch) {
          break
        }
        index += 1
        items.push(nextMatch[1])
      }
      blocks.push({ id: createBlockId(blocks.length), type: 'list', ordered: false, items })
      continue
    }

    const orderedMatch = trimmed.match(/^\d+[.)]\s+(.*)$/)
    if (orderedMatch) {
      flushParagraph()
      const items = [orderedMatch[1]]
      while (index + 1 < lines.length) {
        const nextMatch = lines[index + 1].trim().match(/^\d+[.)]\s+(.*)$/)
        if (!nextMatch) {
          break
        }
        index += 1
        items.push(nextMatch[1])
      }
      blocks.push({ id: createBlockId(blocks.length), type: 'list', ordered: true, items })
      continue
    }

    paragraph.push(trimmed)
  }

  flushParagraph()

  return blocks.length > 0 ? blocks : [{ id: 'block-0', type: 'paragraph', text: '' }]
}

function serializeRichBlocks(blocks: RichBlock[]) {
  return blocks
    .map((block) => {
      if (block.type === 'heading') {
        return `${'#'.repeat(block.level)} ${block.text}`.trimEnd()
      }

      if (block.type === 'paragraph') {
        return block.text.trim()
      }

      if (block.type === 'quote') {
        return block.text
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => `> ${line}`)
          .join('\n')
      }

      if (block.type === 'list') {
        return block.items
          .map((item, index) => `${block.ordered ? `${index + 1}.` : '-'} ${item}`.trimEnd())
          .join('\n')
      }

      return `![${block.alt}](${block.url})`
    })
    .filter((blockMarkdown) => blockMarkdown.trim())
    .join('\n\n')
}

function updateBlock(blocks: RichBlock[], targetId: string, updater: (block: RichBlock) => RichBlock) {
  return blocks.map((block) => (block.id === targetId ? updater(block) : block))
}

export default function RichEditor({ value, onChange }: RichEditorProps) {
  const parsedBlocks = useMemo(() => parseRichMarkdown(value), [value])
  const [blocks, setBlocks] = useState(parsedBlocks)

  useEffect(() => {
    setBlocks(parsedBlocks)
  }, [parsedBlocks])

  const applyBlocks = (nextBlocks: RichBlock[]) => {
    setBlocks(nextBlocks)
    onChange(serializeRichBlocks(nextBlocks))
  }

  const addParagraphBlock = () => {
    applyBlocks([...blocks, { id: createBlockId(blocks.length), type: 'paragraph', text: '' }])
  }

  return (
    <section className="editor-surface editor-surface--editor-canvas rich-editor">
      <div className="rich-editor__header">
        <div>
          <span className="editor-surface__label">可视编辑</span>
          <p className="editor-surface__hint">按内容块编辑标题、段落、列表、引用和图片。</p>
        </div>
        <button type="button" className="rich-editor__add" onClick={addParagraphBlock}>
          添加段落
        </button>
      </div>

      <textarea aria-label="可视编辑器" className="rich-editor__markdown-value" value={value} readOnly />

      <div className="rich-editor__blocks">
        {blocks.map((block) => {
          if (block.type === 'heading') {
            return (
              <label key={block.id} className="rich-editor__block">
                <span>标题内容</span>
                <input
                  aria-label="标题内容"
                  value={block.text}
                  onChange={(event) =>
                    applyBlocks(
                      updateBlock(blocks, block.id, (currentBlock) =>
                        currentBlock.type === 'heading'
                          ? { ...currentBlock, text: event.target.value }
                          : currentBlock,
                      ),
                    )
                  }
                />
              </label>
            )
          }

          if (block.type === 'paragraph') {
            return (
              <label key={block.id} className="rich-editor__block">
                <span>段落内容</span>
                <textarea
                  aria-label="段落内容"
                  value={block.text}
                  onChange={(event) =>
                    applyBlocks(
                      updateBlock(blocks, block.id, (currentBlock) =>
                        currentBlock.type === 'paragraph'
                          ? { ...currentBlock, text: event.target.value }
                          : currentBlock,
                      ),
                    )
                  }
                />
              </label>
            )
          }

          if (block.type === 'quote') {
            return (
              <label key={block.id} className="rich-editor__block">
                <span>引用内容</span>
                <textarea
                  aria-label="引用内容"
                  value={block.text}
                  onChange={(event) =>
                    applyBlocks(
                      updateBlock(blocks, block.id, (currentBlock) =>
                        currentBlock.type === 'quote'
                          ? { ...currentBlock, text: event.target.value }
                          : currentBlock,
                      ),
                    )
                  }
                />
              </label>
            )
          }

          if (block.type === 'list') {
            return (
              <label key={block.id} className="rich-editor__block">
                <span>{block.ordered ? '有序列表' : '无序列表'}</span>
                <textarea
                  aria-label={block.ordered ? '有序列表内容' : '无序列表内容'}
                  value={block.items.join('\n')}
                  onChange={(event) =>
                    applyBlocks(
                      updateBlock(blocks, block.id, (currentBlock) =>
                        currentBlock.type === 'list'
                          ? {
                              ...currentBlock,
                              items: event.target.value.split('\n'),
                            }
                          : currentBlock,
                      ),
                    )
                  }
                />
              </label>
            )
          }

          return (
            <div key={block.id} className="rich-editor__block rich-editor__block--image">
              <label>
                <span>图片说明</span>
                <input
                  aria-label="图片说明"
                  value={block.alt}
                  onChange={(event) =>
                    applyBlocks(
                      updateBlock(blocks, block.id, (currentBlock) =>
                        currentBlock.type === 'image'
                          ? { ...currentBlock, alt: event.target.value }
                          : currentBlock,
                      ),
                    )
                  }
                />
              </label>
              <label>
                <span>图片地址</span>
                <input
                  aria-label="图片地址"
                  value={block.url}
                  onChange={(event) =>
                    applyBlocks(
                      updateBlock(blocks, block.id, (currentBlock) =>
                        currentBlock.type === 'image'
                          ? { ...currentBlock, url: event.target.value }
                          : currentBlock,
                      ),
                    )
                  }
                />
              </label>
            </div>
          )
        })}
      </div>
    </section>
  )
}
