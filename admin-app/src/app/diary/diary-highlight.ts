export interface HighlightContext {
  prefix?: string
  suffix?: string
}

/**
 * Escapes regex special characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Applies markdown highlight ==quote== to the target markdown content.
 * Returns the modified markdown, or null if no valid insertion point was found.
 */
export function applyDiaryMarkdownHighlight(
  markdown: string,
  quote: string,
  context?: HighlightContext,
): string | null {
  const trimmedQuote = (quote || '').trim()
  if (!trimmedQuote || !markdown) {
    return null
  }

  // Guard: if quote is already wrapped in ==...==, do not double wrap
  if (trimmedQuote.startsWith('==') && trimmedQuote.endsWith('==')) {
    return null
  }

  // 1. Try with surrounding context if provided
  if (context?.prefix || context?.suffix) {
    const cleanPrefix = (context.prefix || '').slice(-15)
    const cleanSuffix = (context.suffix || '').slice(0, 15)

    if (cleanPrefix || cleanSuffix) {
      const patternStr = `${escapeRegExp(cleanPrefix)}(${escapeRegExp(trimmedQuote)})${escapeRegExp(cleanSuffix)}`
      const pattern = new RegExp(patternStr, 'g')
      let match: RegExpExecArray | null
      let bestIndex = -1

      while ((match = pattern.exec(markdown)) !== null) {
        // Ensure the match is not already inside ==...==
        const quoteStart = match.index + cleanPrefix.length
        const quoteEnd = quoteStart + trimmedQuote.length
        const before = markdown.slice(Math.max(0, quoteStart - 2), quoteStart)
        const after = markdown.slice(quoteEnd, quoteEnd + 2)

        if (before !== '==' || after !== '==') {
          bestIndex = quoteStart
          break
        }
      }

      if (bestIndex !== -1) {
        return (
          markdown.slice(0, bestIndex) +
          `==${trimmedQuote}==` +
          markdown.slice(bestIndex + trimmedQuote.length)
        )
      }
    }
  }

  // 2. Fallback: Search for first unhighlighted occurrence of quote
  const quotePattern = new RegExp(`(?<!==)${escapeRegExp(trimmedQuote)}(?!==)`, 'g')
  const match = quotePattern.exec(markdown)
  if (match) {
    const idx = match.index
    return (
      markdown.slice(0, idx) +
      `==${trimmedQuote}==` +
      markdown.slice(idx + trimmedQuote.length)
    )
  }

  return null
}

/**
 * Removes markdown highlight ==quote== from the target markdown content.
 * Returns the modified markdown, or null if no highlight was found.
 */
export function removeDiaryMarkdownHighlight(
  markdown: string,
  quote: string,
  context?: HighlightContext,
): string | null {
  const cleanQuote = (quote || '').replace(/^==|==$/g, '').trim()
  if (!cleanQuote || !markdown) {
    return null
  }

  // Target to remove is ==cleanQuote==
  const targetHighlight = `==${cleanQuote}==`

  // 1. Try with surrounding context
  if (context?.prefix || context?.suffix) {
    const cleanPrefix = (context.prefix || '').slice(-15)
    const cleanSuffix = (context.suffix || '').slice(0, 15)

    if (cleanPrefix || cleanSuffix) {
      const patternStr = `${escapeRegExp(cleanPrefix)}${escapeRegExp(targetHighlight)}${escapeRegExp(cleanSuffix)}`
      const pattern = new RegExp(patternStr)
      const match = pattern.exec(markdown)
      if (match) {
        const replaceStart = match.index + cleanPrefix.length
        return (
          markdown.slice(0, replaceStart) +
          cleanQuote +
          markdown.slice(replaceStart + targetHighlight.length)
        )
      }
    }
  }

  // 2. Fallback: Search for first occurrence of ==cleanQuote==
  const idx = markdown.indexOf(targetHighlight)
  if (idx !== -1) {
    return (
      markdown.slice(0, idx) +
      cleanQuote +
      markdown.slice(idx + targetHighlight.length)
    )
  }

  return null
}
