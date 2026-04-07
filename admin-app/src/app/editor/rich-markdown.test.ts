import { describe, expect, it } from 'vitest'
import { detectRichMarkdownSupport, markdownToRichText, richTextToMarkdown } from './rich-markdown'

describe('rich markdown conversion boundaries', () => {
  it('accepts the supported v1 markdown subset', () => {
    const markdown = `# Heading

Paragraph with **bold** and *italic*.

> Quote

- item
1. ordered

[Link](https://example.com)

---

\`\`\`ts
const x = 1
\`\`\``

    expect(detectRichMarkdownSupport(markdown)).toEqual({ supported: true, reason: null })
    expect(markdownToRichText(markdown)).toBe(markdown)
    expect(richTextToMarkdown(markdown)).toBe(markdown)
  })

  it('rejects raw HTML blocks', () => {
    expect(detectRichMarkdownSupport('<div>unsafe</div>')).toEqual({
      supported: false,
      reason: 'HTML blocks are not supported in rich mode.',
    })
  })

  it('rejects custom markdown extensions', () => {
    expect(detectRichMarkdownSupport('{% note %}\nhello\n{% endnote %}')).toEqual({
      supported: false,
      reason: 'Custom markdown extensions are not supported in rich mode.',
    })
  })

  it('rejects image syntax for safe markdown fallback', () => {
    expect(detectRichMarkdownSupport('![alt](/uploads/example.png)')).toEqual({
      supported: false,
      reason: 'Image syntax is not supported in rich mode.',
    })
  })
})
