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
const ARTICLE_CITATION_PATTERN = /<!--\s*article-citation\s*-->/g
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

    const parameterKeys = [...parsedUrl.searchParams.keys()]
    parameterKeys.forEach((key) => {
      if (TRACKING_PARAMETER_PATTERN.test(key)) {
        parsedUrl.searchParams.delete(key)
      }
    })
    return parsedUrl.toString()
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

  const visibleCitation = normalizedUrl
    ? `[《${escapeMarkdownLabel(normalizedTitle)}》](${normalizedUrl})`
    : `《${escapeMarkdownText(normalizedTitle)}》`
  return `${visibleCitation}<!-- article-citation -->`
}

export function stripGeneratedArticleReferences(markdown: string) {
  return markdown.replace(GENERATED_ARTICLE_REFERENCES_PATTERN, '\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

function collectCitationMarkersOutsideCodeFences(markdown: string) {
  const citationMarkdown: string[] = []
  let isInCodeFence = false

  markdown.split('\n').forEach((line) => {
    if (/^\s*```/.test(line)) {
      isInCodeFence = !isInCodeFence
      return
    }
    if (isInCodeFence) {
      return
    }

    for (const match of line.matchAll(ARTICLE_CITATION_PATTERN)) {
      citationMarkdown.push(line.slice(0, match.index).trimEnd())
    }
  })

  return citationMarkdown
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
  const sourceMarkdown = stripGeneratedArticleReferences(markdown)

  collectCitationMarkersOutsideCodeFences(sourceMarkdown).forEach((citationMarkdown) => {
    const parsedCitation = parseArticleCitation(citationMarkdown)
    if (!parsedCitation) {
      return
    }

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
  const sourceMarkdown = stripGeneratedArticleReferences(markdown)
  const citations = extractArticleCitations(sourceMarkdown)
  if (citations.length === 0) {
    return sourceMarkdown
  }

  const referenceItems = citations.map((citation, index) => {
    const title = `《${citation.title}》`
    return citation.url
      ? `${index + 1}. [${escapeMarkdownLabel(title)}](${citation.url})`
      : `${index + 1}. ${escapeMarkdownText(title)}`
  })

  return `${sourceMarkdown}\n\n${GENERATED_ARTICLE_REFERENCES_START}\n## 引用文章\n\n${referenceItems.join('\n')}\n${GENERATED_ARTICLE_REFERENCES_END}`
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
