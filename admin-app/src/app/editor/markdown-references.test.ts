import { describe, expect, it } from 'vitest'
import {
  buildArticleCitationMarkdown,
  extractArticleCitations,
  extractMarkdownExternalSources,
  normalizeMarkdownReferenceLinks,
  stripGeneratedArticleReferences,
  syncGeneratedArticleReferences,
} from './markdown-references'

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

  it('builds visible citations with optional links and hidden metadata', () => {
    const titleOnly = buildArticleCitationMarkdown('《The Power of Discord》')
    const linked = buildArticleCitationMarkdown(
      'Alliance Rupture Repair',
      'https://pubmed.ncbi.nlm.nih.gov/30335462/?utm_source=chatgpt.com',
    )

    expect(titleOnly).toBe('《The Power of Discord》<!-- article-citation -->')
    expect(linked).toContain('[《Alliance Rupture Repair》](https://pubmed.ncbi.nlm.nih.gov/30335462/)')
    expect(linked).not.toContain('utm_source')
  })

  it('generates references by first appearance, deduplicates, and upgrades a title-only citation with a later link', () => {
    const first = buildArticleCitationMarkdown('The Power of Discord')!
    const second = buildArticleCitationMarkdown('Rejection Sensitivity', 'https://example.com/rejection')!
    const firstWithLink = buildArticleCitationMarkdown('The Power of Discord', 'https://example.com/discord')!
    const markdown = `先引用 ${first}，再引用 ${second}，最后补充 ${firstWithLink}。`

    const citations = extractArticleCitations(markdown)
    expect(citations).toEqual([
      { title: 'The Power of Discord', url: 'https://example.com/discord' },
      { title: 'Rejection Sensitivity', url: 'https://example.com/rejection' },
    ])

    const synced = syncGeneratedArticleReferences(markdown)
    expect(synced).toContain('## 引用文章')
    expect(synced).toContain('1. [《The Power of Discord》](https://example.com/discord)')
    expect(synced).toContain('2. [《Rejection Sensitivity》](https://example.com/rejection)')
    expect(synced.indexOf('The Power of Discord')).toBeLessThan(synced.lastIndexOf('Rejection Sensitivity'))
  })

  it('rebuilds a generated reference section without duplicating it', () => {
    const citation = buildArticleCitationMarkdown('First Source')!
    const once = syncGeneratedArticleReferences(`正文 ${citation}`)
    const twice = syncGeneratedArticleReferences(once)

    expect(twice.match(/<!-- article-references:start -->/g)).toHaveLength(1)
    expect(stripGeneratedArticleReferences(twice)).toBe(`正文 ${citation}`)
  })
})
