type MarkdownReferenceDefinition = {
  url: string
}

export type MarkdownExternalSource = {
  url: string
  displayUrl: string
  label: string
  domain: string
  occurrences: number
  hasTrackingParameters: boolean
}

export type ArticleCitation = {
  title: string
  url: string
}

const REFERENCE_DEFINITION_PATTERN = /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/
const TRACKING_PARAMETER_PATTERN = /^(?:utm_[a-z0-9_]+|fbclid|gclid|mc_cid|mc_eid)$/i
const LEGACY_ARTICLE_CITATION_PATTERN = /<!--\s*article-citation\s*-->/g
const PENDING_ARTICLE_CITATION_PATTERN = /\[\^(\d+)\]<!--\s*article-citation:([^\s]+)\s*-->/g
const ARTICLE_REFERENCE_MARKER_PATTERN = /<!--\s*article-reference:(\d+)\s*-->/
const GENERATED_ARTICLE_REFERENCES_START = '<!-- article-references:start -->'
const GENERATED_ARTICLE_REFERENCES_END = '<!-- article-references:end -->'
const GENERATED_ARTICLE_REFERENCES_PATTERN = /\n?<!-- article-references:start -->[\s\S]*?<!-- article-references:end -->\n?/g

function normalizeReferenceId(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function collectReferenceDefinitions(markdown: string) {
  const definitions = new Map<string, MarkdownReferenceDefinition>()
  const lines = markdown.split('\n')
  const contentLines: string[] = []
  let isInCodeFence = false

  lines.forEach((line) => {
    if (/^\s*```/.test(line)) {
      isInCodeFence = !isInCodeFence
      contentLines.push(line)
      return
    }

    if (!isInCodeFence) {
      const match = line.match(REFERENCE_DEFINITION_PATTERN)
      if (match) {
        const id = normalizeReferenceId(match[1])
        const url = (match[2] || match[3] || '').trim()
        if (id && url && !definitions.has(id)) {
          definitions.set(id, { url })
        }
        return
      }
    }

    contentLines.push(line)
  })

  return {
    definitions,
    markdown: contentLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd(),
  }
}

function resolveReferenceLinksInLine(line: string, definitions: Map<string, MarkdownReferenceDefinition>) {
  const replaceReference = (fullMatch: string, prefix: string, label: string, rawId: string) => {
    const id = normalizeReferenceId(rawId || label)
    const definition = definitions.get(id)
    return definition ? `${prefix}[${label}](${definition.url})` : fullMatch
  }

  return line.replace(/(!?)\[([^\]]+)\]\[([^\]]*)\]/g, replaceReference)
}

export function normalizeMarkdownReferenceLinks(markdown: string) {
  const { definitions, markdown: markdownWithoutDefinitions } = collectReferenceDefinitions(markdown)
  if (definitions.size === 0) {
    return markdown
  }

  let isInCodeFence = false
  return markdownWithoutDefinitions
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) {
        isInCodeFence = !isInCodeFence
        return line
      }

      return isInCodeFence ? line : resolveReferenceLinksInLine(line, definitions)
    })
    .join('\n')
}

function parseMarkdownDestination(markdown: string, openParenIndex: number) {
  if (markdown[openParenIndex] !== '(') {
    return null
  }

  let index = openParenIndex + 1
  const valueStart = index
  let depth = 1

  while (index < markdown.length) {
    const character = markdown[index]
    if (character === '\\') {
      index += 2
      continue
    }

    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth -= 1
      if (depth === 0) {
        return {
          value: markdown.slice(valueStart, index).trim(),
          end: index + 1,
        }
      }
    }

    index += 1
  }

  return null
}

function readDestinationUrl(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('<')) {
    const closingIndex = trimmed.indexOf('>')
    return closingIndex > 1 ? trimmed.slice(1, closingIndex) : ''
  }

  return trimmed.match(/^\S+/)?.[0] || ''
}

function extractInlineMarkdownLinks(markdown: string) {
  const links: Array<{ label: string; url: string }> = []
  let isInCodeFence = false

  markdown.split('\n').forEach((line) => {
    if (/^\s*```/.test(line)) {
      isInCodeFence = !isInCodeFence
      return
    }
    if (isInCodeFence) {
      return
    }

    let searchIndex = 0
    while (searchIndex < line.length) {
      const labelStart = line.indexOf('[', searchIndex)
      if (labelStart === -1) {
        break
      }

      if (labelStart > 0 && line[labelStart - 1] === '!') {
        searchIndex = labelStart + 1
        continue
      }

      const labelEnd = line.indexOf(']', labelStart + 1)
      if (labelEnd === -1 || line[labelEnd + 1] !== '(') {
        searchIndex = labelStart + 1
        continue
      }

      const destination = parseMarkdownDestination(line, labelEnd + 1)
      if (!destination) {
        searchIndex = labelEnd + 1
        continue
      }

      const url = readDestinationUrl(destination.value)
      if (/^https?:\/\//i.test(url)) {
        links.push({
          label: line.slice(labelStart + 1, labelEnd).trim(),
          url,
        })
      }
      searchIndex = destination.end
    }
  })

  return links
}

function getSourcePresentation(url: string) {
  try {
    const parsedUrl = new URL(url)
    const hasTrackingParameters = [...parsedUrl.searchParams.keys()].some((key) => TRACKING_PARAMETER_PATTERN.test(key))
    const displayUrl = new URL(parsedUrl.toString())
    const displayParameterKeys = [...displayUrl.searchParams.keys()]
    displayParameterKeys.forEach((key) => {
      if (TRACKING_PARAMETER_PATTERN.test(key)) {
        displayUrl.searchParams.delete(key)
      }
    })

    return {
      displayUrl: displayUrl.toString(),
      domain: parsedUrl.hostname.replace(/^www\./, ''),
      hasTrackingParameters,
    }
  } catch {
    return {
      displayUrl: url,
      domain: url,
      hasTrackingParameters: false,
    }
  }
}

function normalizeCitationTitle(title: string) {
  return title.trim().replace(/^《\s*/, '').replace(/\s*》$/, '')
}

function normalizeCitationTitleKey(title: string) {
  return normalizeCitationTitle(title).replace(/\s+/g, ' ').toLocaleLowerCase()
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/([\\\[\]<>])/g, '\\$1')
}

function escapeMarkdownText(value: string) {
  return value.replace(/([\\`*_{}\[\]<>])/g, '\\$1')
}

export function cleanArticleCitationUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  try {
    const parsedUrl = new URL(trimmed)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null
    }
    if (parsedUrl.username || parsedUrl.password) {
      return null
    }

    const parameterKeys = [...parsedUrl.searchParams.keys()]
    parameterKeys.forEach((key) => {
      if (TRACKING_PARAMETER_PATTERN.test(key)) {
        parsedUrl.searchParams.delete(key)
      }
    })
    return parsedUrl.toString().replace(/\(/g, '%28').replace(/\)/g, '%29')
  } catch {
    return null
  }
}

export function buildArticleCitationMarkdown(title: string, url = ''): string | null {
  const normalizedTitle = normalizeCitationTitle(title)
  const normalizedUrl = cleanArticleCitationUrl(url)
  if (!normalizedTitle || normalizedUrl === null) {
    return null
  }

  const metadata = encodeURIComponent(JSON.stringify({ title: normalizedTitle, url: normalizedUrl }))
  return `[^1]<!-- article-citation:${metadata} -->`
}

export function stripGeneratedArticleReferences(markdown: string) {
  return markdown.replace(GENERATED_ARTICLE_REFERENCES_PATTERN, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

type CitationOccurrence = {
  citation: ArticleCitation
  start: number
  end: number
  visiblePrefix: string
  resolvedCitation?: ArticleCitation
}

function parseGeneratedArticleReferences(markdown: string) {
  const references = new Map<number, ArticleCitation>()
  const sectionStart = markdown.indexOf(GENERATED_ARTICLE_REFERENCES_START)
  const sectionEnd = markdown.indexOf(GENERATED_ARTICLE_REFERENCES_END, sectionStart)
  if (sectionStart < 0 || sectionEnd < 0) {
    return references
  }

  markdown.slice(sectionStart, sectionEnd).split('\n').forEach((line) => {
    const itemMatch = line.match(/^\s*(\d+)\.\s+(.*)$/)
    if (!itemMatch) {
      return
    }

    const referenceNumber = Number(itemMatch[1])
    const content = itemMatch[2].replace(ARTICLE_REFERENCE_MARKER_PATTERN, '').trim()
    const linkedStart = content.startsWith('[《') ? 0 : -1
    if (linkedStart === 0) {
      const labelEnd = content.indexOf('》]')
      if (labelEnd > 2 && content[labelEnd + 2] === '(') {
        const destination = parseMarkdownDestination(content, labelEnd + 2)
        const url = destination ? cleanArticleCitationUrl(readDestinationUrl(destination.value)) : null
        const title = normalizeCitationTitle(content.slice(2, labelEnd).replace(/\\([\\\[\]<>])/g, '$1'))
        if (title && url) {
          references.set(referenceNumber, { title, url })
          return
        }
      }
    }

    const titleMatch = content.match(/^《([\s\S]+)》$/)
    if (titleMatch) {
      const title = normalizeCitationTitle(titleMatch[1].replace(/\\(.)/g, '$1'))
      if (title) {
        references.set(referenceNumber, { title, url: '' })
      }
    }
  })

  return references
}

function parsePendingArticleCitation(value: string): ArticleCitation | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<ArticleCitation>
    const title = normalizeCitationTitle(typeof parsed.title === 'string' ? parsed.title : '')
    const url = cleanArticleCitationUrl(typeof parsed.url === 'string' ? parsed.url : '')
    return title && url !== null ? { title, url } : null
  } catch {
    return null
  }
}

function collectCitationOccurrences(markdown: string, references: Map<number, ArticleCitation>) {
  const occurrences: CitationOccurrence[] = []
  let isInCodeFence = false
  let lineOffset = 0

  markdown.split('\n').forEach((line) => {
    if (/^\s*```/.test(line)) {
      isInCodeFence = !isInCodeFence
      lineOffset += line.length + 1
      return
    }
    if (isInCodeFence) {
      lineOffset += line.length + 1
      return
    }

    const occupiedRanges: Array<{ start: number; end: number }> = []
    for (const match of line.matchAll(PENDING_ARTICLE_CITATION_PATTERN)) {
      const citation = parsePendingArticleCitation(match[2])
      const start = match.index || 0
      const end = start + match[0].length
      occupiedRanges.push({ start, end })
      if (citation) {
        occurrences.push({ citation, start: lineOffset + start, end: lineOffset + end, visiblePrefix: '' })
      }
    }

    for (const match of line.matchAll(LEGACY_ARTICLE_CITATION_PATTERN)) {
      const markerStart = match.index || 0
      const markdownBeforeMarker = line.slice(0, markerStart).trimEnd()
      const citation = parseArticleCitation(markdownBeforeMarker)
      if (!citation) {
        continue
      }
      const linkedStart = markdownBeforeMarker.lastIndexOf('[《')
      const titleStart = markdownBeforeMarker.lastIndexOf('《')
      const visibleStart = linkedStart >= 0 ? linkedStart : titleStart
      if (visibleStart < 0) {
        continue
      }
      const end = markerStart + match[0].length
      occupiedRanges.push({ start: visibleStart, end })
      occurrences.push({
        citation,
        start: lineOffset + visibleStart,
        end: lineOffset + end,
        visiblePrefix: markdownBeforeMarker.slice(visibleStart),
      })
    }

    for (const match of line.matchAll(/\[\^(\d+)\]/g)) {
      const start = match.index || 0
      const end = start + match[0].length
      if (occupiedRanges.some((range) => start >= range.start && end <= range.end)) {
        continue
      }
      const citation = references.get(Number(match[1]))
      if (citation) {
        occurrences.push({ citation: { ...citation }, start: lineOffset + start, end: lineOffset + end, visiblePrefix: '' })
      }
    }

    lineOffset += line.length + 1
  })

  return occurrences.sort((left, right) => left.start - right.start)
}

function parseArticleCitation(markdownBeforeMarker: string): ArticleCitation | null {
  const linkedCitationStart = markdownBeforeMarker.lastIndexOf('[《')
  const linkedCandidate = linkedCitationStart >= 0 ? markdownBeforeMarker.slice(linkedCitationStart) : ''
  const linkedMatch = linkedCandidate.match(/^\[《((?:\\.|[^\]])+)》\]\((https?:\/\/[\s\S]+)\)$/i)
  if (linkedMatch) {
    const title = normalizeCitationTitle(linkedMatch[1].replace(/\\([\\\[\]])/g, '$1'))
    const url = cleanArticleCitationUrl(linkedMatch[2])
    return title && url ? { title, url } : null
  }

  const titleOnlyStart = markdownBeforeMarker.lastIndexOf('《')
  const titleOnlyCandidate = titleOnlyStart >= 0 ? markdownBeforeMarker.slice(titleOnlyStart) : ''
  const titleOnlyMatch = titleOnlyCandidate.match(/^《([\s\S]+)》$/)
  if (!titleOnlyMatch) {
    return null
  }

  const title = normalizeCitationTitle(titleOnlyMatch[1].replace(/\\(.)/g, '$1'))
  return title ? { title, url: '' } : null
}

export function extractArticleCitations(markdown: string): ArticleCitation[] {
  const citations: ArticleCitation[] = []
  const citationsByTitle = new Map<string, ArticleCitation>()
  const citationsByUrl = new Map<string, ArticleCitation>()
  const generatedReferences = parseGeneratedArticleReferences(markdown)
  const sourceMarkdown = stripGeneratedArticleReferences(markdown)

  collectCitationOccurrences(sourceMarkdown, generatedReferences).forEach(({ citation: parsedCitation }) => {
    const { title, url } = parsedCitation
    const titleKey = normalizeCitationTitleKey(title)
    const existing = (url ? citationsByUrl.get(url) : undefined) || citationsByTitle.get(titleKey)
    if (existing) {
      if (!existing.url && url) {
        existing.url = url
        citationsByUrl.set(url, existing)
      }
      return
    }

    const citation = { title, url }
    citations.push(citation)
    citationsByTitle.set(titleKey, citation)
    if (url) {
      citationsByUrl.set(url, citation)
    }
  })

  return citations
}

export function syncGeneratedArticleReferences(markdown: string) {
  const generatedReferences = parseGeneratedArticleReferences(markdown)
  const sourceMarkdown = stripGeneratedArticleReferences(markdown)
  const occurrences = collectCitationOccurrences(sourceMarkdown, generatedReferences)
  const citations: ArticleCitation[] = []
  const citationsByTitle = new Map<string, ArticleCitation>()
  const citationsByUrl = new Map<string, ArticleCitation>()

  occurrences.forEach((occurrence) => {
    const { title, url } = occurrence.citation
    const titleKey = normalizeCitationTitleKey(title)
    const existing = (url ? citationsByUrl.get(url) : undefined) || citationsByTitle.get(titleKey)
    if (existing) {
      if (!existing.url && url) {
        existing.url = url
        citationsByUrl.set(url, existing)
      }
      occurrence.resolvedCitation = existing
      return
    }

    const citation = { title, url }
    citations.push(citation)
    citationsByTitle.set(titleKey, citation)
    if (url) {
      citationsByUrl.set(url, citation)
    }
    occurrence.resolvedCitation = citation
  })

  if (citations.length === 0) {
    return sourceMarkdown
  }

  const citationNumbers = new Map(citations.map((citation, index) => [citation, index + 1]))
  let normalizedSourceMarkdown = sourceMarkdown
  ;[...occurrences].reverse().forEach((occurrence) => {
    const referenceNumber = occurrence.resolvedCitation ? citationNumbers.get(occurrence.resolvedCitation) : undefined
    if (!referenceNumber) {
      return
    }
    const replacement = `${occurrence.visiblePrefix}[^${referenceNumber}]`
    normalizedSourceMarkdown = `${normalizedSourceMarkdown.slice(0, occurrence.start)}${replacement}${normalizedSourceMarkdown.slice(occurrence.end)}`
  })

  const referenceItems = citations.map((citation, index) => {
    const title = `《${citation.title}》`
    const marker = `<!-- article-reference:${index + 1} -->`
    return citation.url
      ? `${index + 1}. ${marker}[${escapeMarkdownLabel(title)}](<${citation.url}>)`
      : `${index + 1}. ${marker}${escapeMarkdownText(title)}`
  })

  return `${normalizedSourceMarkdown}\n\n${GENERATED_ARTICLE_REFERENCES_START}\n## 引用文章\n\n${referenceItems.join('\n')}\n${GENERATED_ARTICLE_REFERENCES_END}`
}

export function extractMarkdownExternalSources(markdown: string): MarkdownExternalSource[] {
  const normalizedMarkdown = normalizeMarkdownReferenceLinks(stripGeneratedArticleReferences(markdown))
  const sources = new Map<string, MarkdownExternalSource>()

  extractInlineMarkdownLinks(normalizedMarkdown).forEach(({ label, url }) => {
    const presentation = getSourcePresentation(url)
    const sourceKey = presentation.displayUrl
    const existing = sources.get(sourceKey)
    if (existing) {
      existing.occurrences += 1
      return
    }

    sources.set(sourceKey, {
      url,
      label: label || presentation.domain,
      occurrences: 1,
      ...presentation,
    })
  })

  return [...sources.values()]
}
