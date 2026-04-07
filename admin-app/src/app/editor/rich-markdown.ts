export type RichMarkdownSupport = {
  supported: boolean
  reason: string | null
}

export function detectRichMarkdownSupport(markdown: string): RichMarkdownSupport {
  if (/^<[^>]+>/m.test(markdown)) {
    return { supported: false, reason: 'HTML blocks are not supported in rich mode.' }
  }

  if (/^\{[%{]/m.test(markdown)) {
    return { supported: false, reason: 'Custom markdown extensions are not supported in rich mode.' }
  }

  if (/!\[[^\]]*\]\([^)]*\)/.test(markdown)) {
    return { supported: false, reason: 'Image syntax is not supported in rich mode.' }
  }

  return { supported: true, reason: null }
}

export function markdownToRichText(markdown: string): string {
  return markdown
}

export function richTextToMarkdown(richText: string): string {
  return richText
}
