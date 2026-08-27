import type { DiaryStructuredSection, ParsedDiarySummary } from './diary-view-types'

const STRUCTURED_QUOTE_METADATA_PATTERN =
  /^(?:🔗\s*)?(?:\*\*)?(?:来源|出处)(?:\*\*)?\s*[：:]|^(?:💬\s*)?(?:\*\*)?(?:我的思考|想法)(?:\*\*)?\s*[：:]/

export function parseDiarySummaryFromMarkdown(content: string, postDesc = ''): ParsedDiarySummary {
  const sections: DiaryStructuredSection[] = []
  const text = (content || postDesc || '').trim()

  if (!text) {
    return {
      sections: [],
      categoriesSummary: [],
      totalItemsCount: 0,
    }
  }

  // 1. Extract Self-Observations (Emotion / Behavior Check-ins)
  const selfObsRegex =
    /<!--\s*alpaca:self-observation[^>]*kind="([^"]+)"[^>]*-->([\s\S]*?)<!--\s*\/alpaca:self-observation\s*-->/gi
  let obsMatch: RegExpExecArray | null

  while ((obsMatch = selfObsRegex.exec(text)) !== null) {
    const kind = obsMatch[1] // 'emotion' | 'behavior'
    const blockContent = obsMatch[2]
    const cleanBlock = blockContent.replace(/\*\*/g, '').replace(/^[>\s]+/gm, '')

    // Time from ### 🔖 HH:mm
    const timeMatch = cleanBlock.match(/###\s*🔖\s*(\d{1,2}:\d{2})/)
    const timeStr = timeMatch ? timeMatch[1] : undefined

    // Emotions from 我现在：... or 我做了：...
    const emotionsMatch = cleanBlock.match(/(?:我现在|我做了)[：:]\s*([^\n\r]+)/)
    const emotions = emotionsMatch
      ? emotionsMatch[1]
          .split(/[,，、\s]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      : []

    // Event from 发生了什么：... or 实际发生了什么：...
    const eventMatch = cleanBlock.match(/(?:发生了什么|实际发生了什么)[：:]\s*([^\n\r]+)/)
    const event = eventMatch ? eventMatch[1].trim() : ''

    sections.push({
      type: 'emotion',
      timeStr,
      title: kind === 'behavior' ? '行为尝试' : '情绪签到',
      emotions: emotions.length > 0 ? emotions : undefined,
      event: event || '日常签到记录',
    })
  }

  // 2. Extract Read-Later Quotes / Blockquotes with source
  const quoteRegex = /(?:^|\n)(?:###\s*(?:📄\s*)?(\d{1,2}:\d{2})?[^\n]*待读摘录[^\n]*\n+)?((?:>[^\n]+\n*)+)(?:\s*(?:来源|出处)[：:]\s*([^\n]+))?/g
  let quoteMatch: RegExpExecArray | null

  while ((quoteMatch = quoteRegex.exec(text)) !== null) {
    const timeStr = quoteMatch[1]
    const rawQuote = quoteMatch[2]
      .split('\n')
      .map((line) => line.replace(/^>\s*/, '').trim())
      .filter(Boolean)
      .join('\n')
    const source = quoteMatch[3]?.trim()

    if (rawQuote && !rawQuote.includes('alpaca:self-observation') && !rawQuote.includes('我现在')) {
      sections.push({
        type: 'read-later',
        timeStr,
        title: '待读摘录',
        quote: rawQuote.length > 150 ? `${rawQuote.slice(0, 150)}…` : rawQuote,
        source: source || '待读收录',
      })
    }
  }

  // 3. Extract General Life Notes / Lists
  const cleanBody = text
    .replace(/<!--[\s\S]*?-->/gi, '') // remove all HTML comments
    .replace(/^---[\s\S]*?---/g, '') // remove frontmatter
    .trim()

  const listItems: string[] = []
  const lines = cleanBody.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (
      !trimmed ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('>') ||
      trimmed.startsWith('---') ||
      trimmed.startsWith('<!--') ||
      trimmed.startsWith('-->') ||
      trimmed.includes('alpaca:self-observation') ||
      STRUCTURED_QUOTE_METADATA_PATTERN.test(trimmed)
    ) {
      continue
    }
    // Match bullet or numbered item or paragraph
    const itemClean = trimmed.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '')
    if (itemClean.length > 0 && listItems.length < 5) {
      listItems.push(itemClean)
    }
  }

  if (listItems.length > 0) {
    sections.push({
      type: 'note',
      title: '生活记录',
      items: listItems,
    })
  }

  // If no sections were parsed, fallback to postDesc
  if (sections.length === 0 && postDesc.trim()) {
    sections.push({
      type: 'note',
      title: '日常记录',
      items: [postDesc.trim()],
    })
  }

  // Derive categories summary
  const categoriesSet = new Set<string>()
  const times: string[] = []

  for (const sec of sections) {
    categoriesSet.add(sec.title)
    if (sec.timeStr) {
      times.push(sec.timeStr)
    }
  }

  let timeRangeStr: string | undefined
  if (times.length > 0) {
    times.sort()
    timeRangeStr = times.length > 1 ? `${times[0]}–${times[times.length - 1]}` : times[0]
  }

  return {
    sections,
    categoriesSummary: Array.from(categoriesSet),
    timeRangeStr,
    totalItemsCount: sections.length,
  }
}
