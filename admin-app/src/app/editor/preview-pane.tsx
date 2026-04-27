import type { ReactNode } from 'react'

type PreviewPaneProps = {
  title: string
  date: string
  markdown: string
  previewImageUrls?: Record<string, string>
}

const SAFE_LINK_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel'])
const IMAGE_MARKDOWN_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/g
const BARE_URL_SCHEME_PATTERN = /https?:\/\//gi
const BARE_URL_TERMINATOR_PATTERN = /[\s<>]/
const MID_URL_BARE_URL_TERMINATOR_CHARS = new Set(['，', '。', '！', '？', '；', '：', '“', '”', '‘', '’'])
const ALWAYS_TRAILING_BARE_URL_CHARS = new Set([
  '.',
  ',',
  '!',
  '?',
  ';',
  ':',
  '，',
  '。',
  '！',
  '？',
  '；',
  '：',
  '"',
  "'",
  '“',
  '”',
  '‘',
  '’',
])
const BARE_URL_ATTACHED_TEXT_PATTERN = /^[\p{L}\p{N}]+$/u
const BALANCED_BARE_URL_PAIRS = [
  ['(', ')'],
  ['（', '）'],
  ['[', ']'],
  ['【', '】'],
  ['{', '}'],
  ['｛', '｝'],
] as const

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

function hasUnmatchedBareUrlClosingCharacter(url: string, closingCharacter: string) {
  const balancedPair = BALANCED_BARE_URL_PAIRS.find(([, closing]) => closing === closingCharacter)
  if (!balancedPair) {
    return false
  }

  const [openingCharacter] = balancedPair
  const openingCount = [...url].filter((character) => character === openingCharacter).length
  const closingCount = [...url].filter((character) => character === closingCharacter).length

  return closingCount > openingCount
}

function getBareUrlAttachedTextSplitIndex(url: string) {
  const lastCommaIndex = url.lastIndexOf(',')
  if (lastCommaIndex > 0 && lastCommaIndex < url.length - 1) {
    const commaSuffix = url.slice(lastCommaIndex + 1)
    if (
      BARE_URL_ATTACHED_TEXT_PATTERN.test(commaSuffix) &&
      /[A-Za-z]/.test(commaSuffix) &&
      !url.slice(0, lastCommaIndex).includes('?') &&
      !url.slice(0, lastCommaIndex).includes('#')
    ) {
      return lastCommaIndex
    }
  }

  const lastPeriodIndex = url.lastIndexOf('.')
  if (lastPeriodIndex > 0 && lastPeriodIndex < url.length - 1) {
    const periodSuffix = url.slice(lastPeriodIndex + 1)
    if (BARE_URL_ATTACHED_TEXT_PATTERN.test(periodSuffix) && /[^\x00-\x7F]/.test(periodSuffix)) {
      return lastPeriodIndex
    }
  }

  const lastExclamationIndex = url.lastIndexOf('!')
  if (lastExclamationIndex > 0 && lastExclamationIndex < url.length - 1) {
    const exclamationSuffix = url.slice(lastExclamationIndex + 1)
    if (BARE_URL_ATTACHED_TEXT_PATTERN.test(exclamationSuffix) && /[A-Za-z]/.test(exclamationSuffix)) {
      return lastExclamationIndex
    }
  }

  const lastColonIndex = url.lastIndexOf(':')
  const schemeSeparatorIndex = url.indexOf('://')
  if (lastColonIndex > 'https://'.length && lastColonIndex < url.length - 1 && schemeSeparatorIndex >= 0) {
    const colonSuffix = url.slice(lastColonIndex + 1)
    const afterSchemeBeforeColon = url.slice(schemeSeparatorIndex + 3, lastColonIndex)
    if (
      BARE_URL_ATTACHED_TEXT_PATTERN.test(colonSuffix) &&
      /[^\x00-\x7F]/.test(colonSuffix) &&
      !afterSchemeBeforeColon.includes('/') &&
      !afterSchemeBeforeColon.includes('?') &&
      !afterSchemeBeforeColon.includes('#')
    ) {
      return lastColonIndex
    }
  }

  return -1
}

function trimBareUrlCandidate(url: string) {
  let trimmedUrl = url
  let trailingText = ''

  while (trimmedUrl) {
    const lastCharacter = trimmedUrl[trimmedUrl.length - 1]
    if (!lastCharacter) {
      break
    }

    if (lastCharacter === '/' || lastCharacter === '\\') {
      // no-op
    }

    if (ALWAYS_TRAILING_BARE_URL_CHARS.has(lastCharacter)) {
      trimmedUrl = trimmedUrl.slice(0, -1)
      trailingText = `${lastCharacter}${trailingText}`
      continue
    }

    if (hasUnmatchedBareUrlClosingCharacter(trimmedUrl, lastCharacter)) {
      trimmedUrl = trimmedUrl.slice(0, -1)
      trailingText = `${lastCharacter}${trailingText}`
      continue
    }

    const splitIndex = getBareUrlAttachedTextSplitIndex(trimmedUrl)
    if (splitIndex >= 0) {
      trailingText = `${trimmedUrl.slice(splitIndex)}${trailingText}`
      trimmedUrl = trimmedUrl.slice(0, splitIndex)
      continue
    }

    break
  }

  return { trimmedUrl, trailingText }
}

function renderBareUrls(markdown: string, startIndex: number) {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let matchIndex = startIndex

  for (const match of markdown.matchAll(BARE_URL_SCHEME_PATTERN)) {
    const start = match.index || 0
    let end = start

    while (end < markdown.length && !BARE_URL_TERMINATOR_PATTERN.test(markdown[end])) {
      const character = markdown[end]
      if (MID_URL_BARE_URL_TERMINATOR_CHARS.has(character)) {
        break
      }

      if (hasUnmatchedBareUrlClosingCharacter(markdown.slice(start, end + 1), character)) {
        break
      }

      end += 1
    }

    const matchedUrl = markdown.slice(start, end)
    const { trimmedUrl, trailingText } = trimBareUrlCandidate(matchedUrl)

    if (start > lastIndex) {
      nodes.push(markdown.slice(lastIndex, start))
    }

    const sanitizedHref = sanitizeLinkHref(trimmedUrl)

    if (sanitizedHref) {
      nodes.push(
        <a key={`inline-${matchIndex}`} href={sanitizedHref} rel="noreferrer" target="_blank">
          {trimmedUrl}
        </a>,
      )
      if (trailingText) {
        nodes.push(trailingText)
      }
    } else {
      nodes.push(matchedUrl)
    }

    lastIndex = end
    matchIndex += 1
  }

  if (lastIndex < markdown.length) {
    nodes.push(markdown.slice(lastIndex))
  }

  return {
    nodes: nodes.length > 0 ? nodes : [markdown],
    nextMatchIndex: matchIndex,
  }
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
      const renderedText = renderBareUrls(markdown.slice(lastIndex, start), matchIndex)
      nodes.push(...renderedText.nodes)
      matchIndex = renderedText.nextMatchIndex
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
    const renderedText = renderBareUrls(markdown.slice(lastIndex), matchIndex)
    nodes.push(...renderedText.nodes)
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

function renderInlineWithLineBreaks(markdown: string, previewImageUrls?: Record<string, string>) {
  const inlineNodes = renderInline(markdown, previewImageUrls)
  const nodes: ReactNode[] = []
  let lineBreakIndex = 0

  for (const node of inlineNodes) {
    if (typeof node !== 'string') {
      nodes.push(node)
      continue
    }

    const segments = node.split('\n')
    segments.forEach((segment, index) => {
      if (index > 0) {
        nodes.push(<br key={`line-break-${lineBreakIndex}`} />)
        lineBreakIndex += 1
      }

      if (segment) {
        nodes.push(segment)
      }
    })
  }

  return nodes.length > 0 ? nodes : [markdown]
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
    <p key={`${keyPrefix}-${nodes.length}`}>{renderInlineWithLineBreaks(lines.join('\n'), previewImageUrls)}</p>,
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
          <p>{renderInlineWithLineBreaks(quoteLines.join('\n'), previewImageUrls)}</p>
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
