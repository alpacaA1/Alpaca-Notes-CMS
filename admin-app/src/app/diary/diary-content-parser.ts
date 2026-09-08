import type {
  DiaryReadLaterGroup,
  DiaryReadLaterQuoteItem,
  DiaryReadLaterSourceGroup,
  DiaryStructuredSection,
  ParsedDiarySummary,
} from './diary-view-types'

const STRUCTURED_QUOTE_METADATA_PATTERN =
  /^(?:🔗\s*)?(?:\*\*)?(?:来源|出处)(?:\*\*)?\s*[：:]|^(?:💬\s*)?(?:\*\*)?(?:我的思考|想法)(?:\*\*)?\s*[：:]/

export function extractCleanSourceTitle(raw: string): string {
  let title = (raw || '').trim()
  if (!title) return '未知来源'

  // If 《书名》, extract inside
  const bookMatch = title.match(/《([^》]+)》/)
  if (bookMatch) {
    title = bookMatch[1].trim()
  } else {
    // If [[文章名]], extract inside
    const wikiMatch = title.match(/\[\[([^\]]+)\]\]/)
    if (wikiMatch) {
      title = wikiMatch[1].trim()
    }
  }

  // Strip prefixes like 🔗 **来源**： or 来源：
  title = title.replace(/^(?:🔗\s*)?(?:\*\*)?(?:来源|出处)(?:\*\*)?[：:]\s*/, '').trim()

  // Strip trailing site/author suffix with pipe/underscore/dash:
  title = title.replace(/\s*[|｜丨_]\s*.*$/, '').trim()
  title = title.replace(/\s+-\s+[^\-\n]+$/, '').trim()
  title = title.replace(/\s+(?<!—)—(?!—)\s+[^—\n]+$/, '').trim()

  // Clean remaining wrapping brackets if any
  title = title.replace(/^[《\["']+|[》\]"']+$/g, '').trim()

  return title || '未知来源'
}

export function parseDiaryReadLaterGroups(markdown: string): DiaryReadLaterSourceGroup[] {
  // Strip out structured blocks like music-note and self-observation so their blockquotes are NEVER parsed as read-later quotes
  const text = (markdown || '')
    .replace(/<!--\s*alpaca:(?:music-note|self-observation)[^>]*-->[\s\S]*?<!--\s*\/alpaca:(?:music-note|self-observation)\s*-->/gi, '')
    .trim()
  if (!text) return []

  // Extract content within ## 待读摘录 if present, or scan if text has explicit read-later indicators
  let targetContent = ''
  const h2Match = text.match(/^##\s+(?:(?:🔖|📄)\s*)?待读摘录\s*$/m)
  if (h2Match && h2Match.index !== undefined) {
    const startIndex = h2Match.index + h2Match[0].length
    const rest = text.slice(startIndex)
    const nextH2 = rest.match(/\n(##\s+[^\n]+)/)
    if (nextH2 && nextH2.index !== undefined) {
      targetContent = rest.slice(0, nextH2.index).trim()
    } else {
      targetContent = rest.trim()
    }
  } else if (
    text.includes('待读摘录') ||
    STRUCTURED_QUOTE_METADATA_PATTERN.test(text) ||
    /^(?:🔗\s*)?(?:\*\*)?(?:来源|出处)/m.test(text) ||
    /来源[：:]/.test(text)
  ) {
    targetContent = text.trim()
  }

  if (!targetContent) return []

  // Split by horizontal rules `---`
  const chunks = targetContent.split(/\n\s*---\s*\n/).map((c) => c.trim()).filter(Boolean)
  const groups: DiaryReadLaterSourceGroup[] = []
  let globalOrder = 0

  for (const chunk of chunks) {
    // Check if chunk contains quotes
    if (!chunk.includes('>')) {
      continue
    }

    const lines = chunk.split('\n')
    let currentSource = ''
    const quoteItems: Array<{ quote: string; note?: string }> = []
    let currentQuoteLines: string[] = []
    let currentNoteLines: string[] = []
    let hasEmptyLineAfterQuote = false

    const flushCurrentQuote = () => {
      if (currentQuoteLines.length > 0) {
        const fullQuote = currentQuoteLines.join('\n').trim()
        const fullNote = currentNoteLines.join('\n').trim()
        if (
          fullQuote &&
          !fullQuote.includes('alpaca:self-observation') &&
          !fullQuote.includes('alpaca:music-note') &&
          !fullQuote.includes('我现在') &&
          !fullQuote.includes('歌名') &&
          !fullQuote.includes('歌词摘录')
        ) {
          quoteItems.push({
            quote: fullQuote,
            note: fullNote || undefined,
          })
        }
        currentQuoteLines = []
        currentNoteLines = []
        hasEmptyLineAfterQuote = false
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()

      // Source line detection: e.g. 来源：《书名》 or 🔗 **来源**：[[书名]]
      if (STRUCTURED_QUOTE_METADATA_PATTERN.test(line) || /^(?:🔗\s*)?(?:\*\*)?(?:来源|出处)/.test(line)) {
        if (/^(?:💬\s*)?(?:\*\*)?(?:我的思考|想法)/.test(line) || /^💭\s*/.test(line)) {
          // It's a note line
          const noteText = line.replace(/^(?:💬\s*)?(?:\*\*)?(?:我的思考|想法)(?:\*\*)?[：:]\s*|^💭\s*/, '').trim()
          if (noteText) {
            currentNoteLines.push(noteText)
          }
          hasEmptyLineAfterQuote = false
        } else {
          // It's a source line
          const sourceRaw = line.replace(/^(?:🔗\s*)?(?:\*\*)?(?:来源|出处)(?:\*\*)?[：:]\s*/, '').trim()
          currentSource = extractCleanSourceTitle(sourceRaw)
        }
        continue
      }

      if (line.startsWith('💭')) {
        const noteText = line.replace(/^💭\s*/, '').trim()
        if (noteText) {
          currentNoteLines.push(noteText)
        }
        hasEmptyLineAfterQuote = false
        continue
      }

      if (line.startsWith('>')) {
        // If we previously had a quote and encountered empty lines, or already collected a note, this is a new quote item
        if (currentQuoteLines.length > 0 && (hasEmptyLineAfterQuote || currentNoteLines.length > 0)) {
          flushCurrentQuote()
        }
        const quoteText = line.replace(/^>\s?/, '')
        currentQuoteLines.push(quoteText)
        hasEmptyLineAfterQuote = false
      } else if (!line) {
        // Blank line marks separation
        if (currentQuoteLines.length > 0) {
          hasEmptyLineAfterQuote = true
        }
      } else if (line.startsWith('###') && line.includes('待读摘录')) {
        // Sub-heading separator
        flushCurrentQuote()
      } else if (currentNoteLines.length > 0) {
        // Multi-line note continuation
        currentNoteLines.push(line)
      }
    }
    flushCurrentQuote()

    if (quoteItems.length > 0) {
      const resolvedSource = currentSource || '未知来源'
      const itemsWithMeta: DiaryReadLaterQuoteItem[] = quoteItems.map((q) => ({
        id: `quote-${++globalOrder}`,
        quote: q.quote,
        note: q.note,
        sourceTitle: resolvedSource,
        order: globalOrder,
      }))

      // Merge with previous group if same source
      const lastGroup = groups[groups.length - 1]
      if (lastGroup && lastGroup.sourceTitle === resolvedSource) {
        lastGroup.items.push(...itemsWithMeta)
      } else {
        groups.push({
          sourceTitle: resolvedSource,
          items: itemsWithMeta,
        })
      }
    }
  }

  return groups
}

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

  // 2. Extract Music Notes (拾音)
  const musicNoteRegex =
    /<!--\s*alpaca:music-note[^>]*-->([\s\S]*?)<!--\s*\/alpaca:music-note\s*-->/gi
  let musicMatch: RegExpExecArray | null

  while ((musicMatch = musicNoteRegex.exec(text)) !== null) {
    const blockContent = musicMatch[1]
    const cleanBlock = blockContent.replace(/\*\*/g, '').replace(/^[>\s]+/gm, '')

    // Time from ### 🎵 HH:mm
    const timeMatch = cleanBlock.match(/###\s*🎵\s*(\d{1,2}:\d{2})/)
    const timeStr = timeMatch ? timeMatch[1] : undefined

    // Song title from 歌名：...
    const songMatch = cleanBlock.match(/(?:🎤\s*)?歌名[：:]\s*([^\n\r]+)/)
    const songTitle = songMatch ? songMatch[1].trim() : ''

    // Artist from 歌手：...
    const artistMatch = cleanBlock.match(/(?:🎸\s*)?歌手[：:]\s*([^\n\r]+)/)
    const artist = artistMatch ? artistMatch[1].trim() : ''

    // Lyrics from 歌词摘录：... (may span multiple lines in blockquote)
    const lyricsMatch = cleanBlock.match(/(?:🎶\s*)?歌词摘录[：:]\s*([\s\S]*?)(?=💭|$)/)
    const lyrics = lyricsMatch ? lyricsMatch[1].replace(/^[>\s]+/gm, '').trim() : ''

    // Thoughts from 我的感触：...
    const thoughtsMatch = cleanBlock.match(/(?:💭\s*)?我的感触[：:]\s*([^\n\r]+(?:\n(?![#><!]).*)*)/m)
    const thoughts = thoughtsMatch ? thoughtsMatch[1].trim() : ''

    sections.push({
      type: 'music-note',
      timeStr,
      title: '拾音',
      songTitle,
      artist,
      lyrics,
      event: thoughts,
    })
  }

  // 3. Extract Read-Later Quotes with Sources and Groups
  const readLaterGroups = parseDiaryReadLaterGroups(text)
  if (readLaterGroups.length > 0) {
    const totalQuotesCount = readLaterGroups.reduce((acc, g) => acc + g.items.length, 0)
    sections.push({
      type: 'read-later',
      title: '待读摘录',
      groups: readLaterGroups,
      totalQuotesCount,
      quote: readLaterGroups[0]?.items[0]?.quote,
      source: readLaterGroups[0]?.sourceTitle,
      quoteCount: totalQuotesCount,
    })
  }

  // 4. Extract General Life Notes / Lists
  // Remove self-obs comments, frontmatter, and read-later heading section to avoid leaking notes
  let cleanBody = text
    .replace(/<!--[\s\S]*?-->/gi, '') // remove all HTML comments
    .replace(/^---[\s\S]*?---/g, '') // remove frontmatter
    .trim()

  const readLaterH2Match = cleanBody.match(/^##\s+(?:(?:🔖|📄)\s*)?待读摘录\s*$/m)
  if (readLaterH2Match && readLaterH2Match.index !== undefined) {
    const startIndex = readLaterH2Match.index
    const rest = cleanBody.slice(startIndex + readLaterH2Match[0].length)
    const nextH2 = rest.match(/\n(##\s+[^\n]+)/)
    if (nextH2 && nextH2.index !== undefined) {
      cleanBody = cleanBody.slice(0, startIndex) + rest.slice(nextH2.index)
    } else {
      cleanBody = cleanBody.slice(0, startIndex)
    }
  }

  const musicNoteH2Match = cleanBody.match(/^##\s+(?:(?:🎵)\s*)?拾音\s*$/m)
  if (musicNoteH2Match && musicNoteH2Match.index !== undefined) {
    const startIndex = musicNoteH2Match.index
    const rest = cleanBody.slice(startIndex + musicNoteH2Match[0].length)
    const nextH2 = rest.match(/\n(##\s+[^\n]+)/)
    if (nextH2 && nextH2.index !== undefined) {
      cleanBody = cleanBody.slice(0, startIndex) + rest.slice(nextH2.index)
    } else {
      cleanBody = cleanBody.slice(0, startIndex)
    }
  }

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
      trimmed.startsWith('💭') ||
      trimmed.includes('alpaca:self-observation') ||
      trimmed.includes('alpaca:music-note') ||
      STRUCTURED_QUOTE_METADATA_PATTERN.test(trimmed) ||
      /^(?:🔗\s*)?(?:\*\*)?(?:来源|出处)/.test(trimmed)
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
