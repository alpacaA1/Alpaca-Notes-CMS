import type { ReactNode } from 'react'

type PreviewPaneProps = {
  markdown: string
}

function renderInline(markdown: string): ReactNode[] {
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
      nodes.push(
        <a key={`inline-${matchIndex}`} href={linkHref} rel="noreferrer" target="_blank">
          {linkLabel}
        </a>,
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

function flushParagraph(lines: string[], nodes: ReactNode[], keyPrefix: string) {
  if (lines.length === 0) {
    return
  }

  nodes.push(
    <p key={`${keyPrefix}-${nodes.length}`}>{renderInline(lines.join(' '))}</p>,
  )
  lines.length = 0
}

function renderBlocks(markdown: string) {
  const lines = markdown.split('\n')
  const nodes: ReactNode[] = []
  const paragraph: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph(paragraph, nodes, 'paragraph')
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      flushParagraph(paragraph, nodes, 'paragraph')
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6
      const HeadingTag = `h${level}` as const
      nodes.push(<HeadingTag key={`heading-${nodes.length}`}>{renderInline(headingMatch[2])}</HeadingTag>)
      continue
    }

    if (/^(```)/.test(trimmed)) {
      flushParagraph(paragraph, nodes, 'paragraph')
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
      flushParagraph(paragraph, nodes, 'paragraph')
      nodes.push(<hr key={`hr-${nodes.length}`} />)
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph(paragraph, nodes, 'paragraph')
      const quoteLines = [trimmed.replace(/^>\s?/, '')]
      while (index + 1 < lines.length && /^>\s?/.test(lines[index + 1].trim())) {
        index += 1
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''))
      }
      nodes.push(
        <blockquote key={`quote-${nodes.length}`}>
          <p>{renderInline(quoteLines.join(' '))}</p>
        </blockquote>,
      )
      continue
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.*)$/)
    if (unorderedMatch) {
      flushParagraph(paragraph, nodes, 'paragraph')
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
            <li key={`ul-item-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ul>,
      )
      continue
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/)
    if (orderedMatch) {
      flushParagraph(paragraph, nodes, 'paragraph')
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
            <li key={`ol-item-${itemIndex}`}>{renderInline(item)}</li>
          ))}
        </ol>,
      )
      continue
    }

    paragraph.push(trimmed)
  }

  flushParagraph(paragraph, nodes, 'paragraph')

  return nodes
}

export default function PreviewPane({ markdown }: PreviewPaneProps) {
  return (
    <section className="preview-pane">
      <p className="preview-note">Approximate client-side preview. Final Hexo or theme rendering may differ.</p>
      <article className="preview-content">{renderBlocks(markdown)}</article>
    </section>
  )
}
