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

const REFERENCE_DEFINITION_PATTERN = /^\s{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*$/
const TRACKING_PARAMETER_PATTERN = /^(?:utm_[a-z0-9_]+|fbclid|gclid|mc_cid|mc_eid)$/i

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

export function extractMarkdownExternalSources(markdown: string): MarkdownExternalSource[] {
  const normalizedMarkdown = normalizeMarkdownReferenceLinks(markdown)
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
