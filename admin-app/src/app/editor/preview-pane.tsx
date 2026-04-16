import type { ReactNode } from 'react'

type PreviewPaneProps = {
  title: string
  date: string
  markdown: string
  previewImageUrls?: Record<string, string>
}

const SAFE_LINK_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])
const IMAGE_MARKDOWN_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g

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

function renderTextInline(markdown: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g
  let lastIndex = 0
  let matchIndex = 0

  for (const match of markdown.matchAll(pattern)) {
    const [fullMatch, , linkLabel, linkHref, boldText, italicText, codeText] = match
    const start = match.index || 0

    if (start > lastIndex) {
      nodes.push(markdown.slice(lastIndex, start))
    }

    if (linkLabel && linkHref) {
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
    nodes.push(markdown.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [markdown]
}

function renderInline(markdown: string, previewImageUrls?: Record<string, string>): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let matchIndex = 0

  for (const match of markdown.matchAll(IMAGE_MARKDOWN_PATTERN)) {
    const [fullMatch, altText, imageUrl] = match
    const start = match.index || 0

    if (start > lastIndex) {
      nodes.push(...renderTextInline(markdown.slice(lastIndex, start)))
    }

    const safeSrc = previewImageUrls?.[imageUrl] ?? sanitizeImageSrc(imageUrl)
    if (safeSrc) {
      nodes.push(<img key={`image-${matchIndex}`} src={safeSrc} alt={altText} />)
    }

    lastIndex = start + fullMatch.length
    matchIndex += 1
  }

  if (lastIndex < markdown.length) {
    nodes.push(...renderTextInline(markdown.slice(lastIndex)))
  }

  return nodes.length > 0 ? nodes : [markdown]
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

function flushParagraph(
  lines: string[],
  nodes: ReactNode[],
  keyPrefix: string,
  previewImageUrls?: Record<string, string>,
) {
  if (lines.length === 0) {
    return
  }

  nodes.push(
    <p key={`${keyPrefix}-${nodes.length}`}>{renderInline(lines.join(' '), previewImageUrls)}</p>,
  )
  lines.length = 0
}

function renderBlocks(markdown: string, previewImageUrls?: Record<string, string>) {
  const lines = markdown.split('\n')
  const nodes: ReactNode[] = []
  const paragraph: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6
      const HeadingTag = `h${level}` as const
      nodes.push(<HeadingTag key={`heading-${nodes.length}`}>{renderInline(headingMatch[2], previewImageUrls)}</HeadingTag>)
      continue
    }

    if (
      isTableRow(line) &&
      index + 1 < lines.length &&
      isTableDivider(lines[index + 1])
    ) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
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
                <th key={`table-head-${headerIndex}`}>{renderInline(header, previewImageUrls)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`table-row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`table-cell-${rowIndex}-${cellIndex}`}>{renderInline(cell, previewImageUrls)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
      continue
    }

    if (/^(```)/.test(trimmed)) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
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
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      nodes.push(<hr key={`hr-${nodes.length}`} />)
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      const quoteLines = [trimmed.replace(/^>\s?/, '')]
      while (index + 1 < lines.length && /^>\s?/.test(lines[index + 1].trim())) {
        index += 1
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''))
      }
      nodes.push(
        <blockquote key={`quote-${nodes.length}`}>
          <p>{renderInline(quoteLines.join(' '), previewImageUrls)}</p>
        </blockquote>,
      )
      continue
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.*)$/)
    if (unorderedMatch) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      const items = [unorderedMatch[1]]
      while (index + 1 < lines.length) {
        const nextMatch = lines[index + 1].match(/^\s*[-*+]\s+(.*)$/)
        if (!nextMatch) {
          break
        }
        index += 1
        items.push(nextMatch[1])
      }
      nodes.push(
        <ul key={`ul-${nodes.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`ul-item-${itemIndex}`}>{renderInline(item, previewImageUrls)}</li>
          ))}
        </ul>,
      )
      continue
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/)
    if (orderedMatch) {
      flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)
      const items = [orderedMatch[1]]
      while (index + 1 < lines.length) {
        const nextMatch = lines[index + 1].match(/^\s*\d+\.\s+(.*)$/)
        if (!nextMatch) {
          break
        }
        index += 1
        items.push(nextMatch[1])
      }
      nodes.push(
        <ol key={`ol-${nodes.length}`}>
          {items.map((item, itemIndex) => (
            <li key={`ol-item-${itemIndex}`}>{renderInline(item, previewImageUrls)}</li>
          ))}
        </ol>,
      )
      continue
    }

    paragraph.push(trimmed)
  }

  flushParagraph(paragraph, nodes, 'paragraph', previewImageUrls)

  return nodes
}

export default function PreviewPane({ title, date, markdown, previewImageUrls }: PreviewPaneProps) {
  return (
    <section className="preview-pane preview-pane--reading-canvas">
      <article className="preview-content">
        <header className="preview-content__header">
          <h1>{title.trim() || '未命名草稿'}</h1>
          <p className="preview-content__date">{date}</p>
        </header>
        {renderBlocks(markdown, previewImageUrls)}
      </article>
    </section>
  )
}
