import { describe, expect, it } from 'vitest'
import { extractMarkdownExternalSources, normalizeMarkdownReferenceLinks } from './markdown-references'

describe('markdown references', () => {
  it('resolves full and collapsed reference links and removes their definitions', () => {
    const markdown = `来自 [Tronick][study] 和 [PubMed][]。

[study]: https://example.com/tronick "Study"
[pubmed]: https://pubmed.ncbi.nlm.nih.gov/2702877/`

    expect(normalizeMarkdownReferenceLinks(markdown)).toBe(
      '来自 [Tronick](https://example.com/tronick) 和 [PubMed](https://pubmed.ncbi.nlm.nih.gov/2702877/)。',
    )
  })

  it('leaves reference-looking code fences untouched', () => {
    const markdown = `\`\`\`md
[示例][1]
[1]: https://example.com/code
\`\`\`

[正文][1]
[1]: https://example.com/article`

    const normalized = normalizeMarkdownReferenceLinks(markdown)
    expect(normalized).toContain('[示例][1]')
    expect(normalized).toContain('[1]: https://example.com/code')
    expect(normalized).toContain('[正文](https://example.com/article)')
  })

  it('collects unique external sources, occurrence counts, and tracking hints', () => {
    const sources = extractMarkdownExternalSources(`
[研究][1] 与 [原始论文](https://example.com/paper?utm_source=chatgpt.com) 指向同一来源。
[另一个来源](https://pubmed.ncbi.nlm.nih.gov/2702877/)

[1]: https://example.com/paper?utm_source=chatgpt.com
`)

    expect(sources).toHaveLength(2)
    expect(sources[0]).toMatchObject({
      label: '研究',
      domain: 'example.com',
      occurrences: 2,
      displayUrl: 'https://example.com/paper',
      hasTrackingParameters: true,
    })
    expect(sources[1]).toMatchObject({
      label: '另一个来源',
      domain: 'pubmed.ncbi.nlm.nih.gov',
      occurrences: 1,
    })
  })
})
