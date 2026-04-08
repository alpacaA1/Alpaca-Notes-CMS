export type RichMarkdownSupport = {
  supported: boolean
  reason: string | null
}

export function detectRichMarkdownSupport(markdown: string): RichMarkdownSupport {
  if (/^<[^>]+>/m.test(markdown)) {
    return { supported: false, reason: '富文本模式暂不支持 HTML 片段。' }
  }

  if (/^\{[%{]/m.test(markdown)) {
    return { supported: false, reason: '富文本模式暂不支持自定义 Markdown 扩展。' }
  }

  if (/!\[[^\]]*\]\([^)]*\)/.test(markdown)) {
    return { supported: false, reason: '富文本模式暂不支持图片语法。' }
  }

  return { supported: true, reason: null }
}

export function markdownToRichText(markdown: string): string {
  return markdown
}

export function richTextToMarkdown(richText: string): string {
  return richText
}
