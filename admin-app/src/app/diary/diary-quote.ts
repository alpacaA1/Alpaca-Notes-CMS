import type { PostIndexItem } from '../posts/post-types'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function getTodayDateString(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function findTodayDiaryPost(diaryPosts: readonly PostIndexItem[], now = new Date()): PostIndexItem | undefined {
  const todayStr = getTodayDateString(now)
  const todayCompact = todayStr.replace(/-/g, '')
  return diaryPosts.find((post) => {
    const postDatePrefix = (post.date || '').slice(0, 10)
    const postTitle = (post.title || '').trim()
    const postPath = (post.path || '').trim()
    return (
      postDatePrefix === todayStr ||
      postTitle.startsWith(todayStr) ||
      postPath.includes(todayCompact) ||
      postPath.includes(todayStr)
    )
  })
}

export type HighlightQuoteOptions = {
  quote: string
  note?: string
  sourceTitle: string
  date?: Date
}

export function cleanSourceTitleForDiary(rawTitle: string): string {
  let title = (rawTitle || '').trim()
  if (!title) return '未命名文章'

  // Strip trailing site/author suffix with pipe/underscore:
  // " | 美团 · 技术团队", " ｜ 少数派", " 丨 微信公众号", " _ 知乎"
  title = title.replace(/\s*[|｜丨_]\s*.*$/, '').trim()

  // Strip trailing single hyphen/dash site suffix: " - 少数派", " — 36氪"
  title = title.replace(/\s+-\s+[^\-\n]+$/, '').trim()
  title = title.replace(/\s+(?<!—)—(?!—)\s+[^—\n]+$/, '').trim()

  return title || rawTitle.trim()
}

export function formatHighlightQuoteForDiary(options: HighlightQuoteOptions): string {
  const date = options.date ?? new Date()
  const timeHeading = `### 🔖 ${pad(date.getHours())}:${pad(date.getMinutes())} · 待读摘录`

  const rawQuote = (options.quote || '').trim()
  const quoteLines = rawQuote
    ? rawQuote
        .split('\n')
        .map((line) => (line.trim() ? `> ${line}` : '>'))
        .join('\n')
    : '> (未命名摘录)'

  const parts: string[] = [timeHeading, quoteLines]

  const note = (options.note || '').trim()
  if (note) {
    parts.push(`💬 **我的思考**：${note}`)
  }

  const cleanSourceTitle = cleanSourceTitleForDiary(options.sourceTitle)
  parts.push(`🔗 **来源**：[[${cleanSourceTitle}]]`)

  return parts.join('\n\n')
}

const DIARY_READ_LATER_HEADING_PATTERN = /^##\s+(?:🔖\s*)?待读摘录\s*$/m

export function appendQuoteToDiaryBody(existingBody: string, quoteBlock: string): string {
  const trimmed = existingBody.trim()
  if (!trimmed) {
    return `## 待读摘录\n\n${quoteBlock}\n`
  }

  const match = trimmed.match(DIARY_READ_LATER_HEADING_PATTERN)
  if (!match || match.index === undefined) {
    return `${trimmed}\n\n## 待读摘录\n\n${quoteBlock}\n`
  }

  const headingStartIndex = match.index
  const afterHeadingIndex = headingStartIndex + match[0].length
  const restOfContent = trimmed.slice(afterHeadingIndex)

  // Find if there is a subsequent Level 2 heading (e.g. \n## Heading)
  const nextH2Match = restOfContent.match(/\n(##\s+[^\n]+)/)
  if (nextH2Match && nextH2Match.index !== undefined) {
    const insertPosition = afterHeadingIndex + nextH2Match.index
    const beforeInsert = trimmed.slice(0, insertPosition).trimEnd()
    const afterInsert = trimmed.slice(insertPosition).trimStart()
    return `${beforeInsert}\n\n${quoteBlock}\n\n${afterInsert}\n`
  }

  return `${trimmed}\n\n${quoteBlock}\n`
}

export type BatchHighlightQuoteItem = {
  quote: string
  note?: string
  sourceTitle: string
}

export function formatBatchHighlightQuotesForDiary(items: BatchHighlightQuoteItem[]): string {
  if (items.length === 0) {
    return ''
  }

  // Group consecutive items that share the same cleaned source title
  const groups: Array<{
    sourceTitle: string
    items: Array<{ quote: string; note?: string }>
  }> = []

  for (const item of items) {
    const cleanTitle = cleanSourceTitleForDiary(item.sourceTitle)
    const currentGroup = groups[groups.length - 1]
    if (currentGroup && currentGroup.sourceTitle === cleanTitle) {
      currentGroup.items.push({ quote: item.quote, note: item.note })
    } else {
      groups.push({
        sourceTitle: cleanTitle,
        items: [{ quote: item.quote, note: item.note }],
      })
    }
  }

  const groupBlocks = groups.map((group) => {
    const itemStrings = group.items.map((item) => {
      const rawQuote = (item.quote || '').trim()
      const quoteLines = rawQuote
        ? rawQuote
            .split('\n')
            .map((line) => (line.trim() ? `> ${line}` : '>'))
            .join('\n')
        : '> (未命名摘录)'

      const note = (item.note || '').trim()
      if (note) {
        return `${quoteLines}\n\n💭 ${note}`
      }
      return quoteLines
    })

    const allQuotesContent = itemStrings.join('\n\n')
    return `${allQuotesContent}\n\n来源：《${group.sourceTitle}》`
  })

  return groupBlocks.join('\n\n---\n\n')
}
