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

  it('builds a pending inline citation with optional cleaned link metadata', () => {
    const titleOnly = buildArticleCitationMarkdown('《The Power of Discord》')
    const linked = buildArticleCitationMarkdown(
      'Alliance Rupture Repair',
      'https://pubmed.ncbi.nlm.nih.gov/30335462/?utm_source=chatgpt.com',
    )

    expect(titleOnly).toContain('[^1]<!-- article-citation:')
    expect(decodeURIComponent(titleOnly!.match(/article-citation:([^\s]+)/)?.[1] || '')).toContain('The Power of Discord')
    expect(decodeURIComponent(linked!.match(/article-citation:([^\s]+)/)?.[1] || '')).toContain('https://pubmed.ncbi.nlm.nih.gov/30335462/')
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
    expect(synced).toContain('先引用 [^1]，再引用 [^2]，最后补充 [^1]。')
    expect(synced).toContain('1. <!-- article-reference:1 -->[《The Power of Discord》](<https://example.com/discord>)')
    expect(synced).toContain('2. <!-- article-reference:2 -->[《Rejection Sensitivity》](<https://example.com/rejection>)')
    expect(synced.indexOf('The Power of Discord')).toBeLessThan(synced.lastIndexOf('Rejection Sensitivity'))
  })

  it('rebuilds a generated reference section without duplicating it', () => {
    const citation = buildArticleCitationMarkdown('First Source')!
    const once = syncGeneratedArticleReferences(`正文 ${citation}`)
    const twice = syncGeneratedArticleReferences(once)

    expect(twice.match(/<!-- article-references:start -->/g)).toHaveLength(1)
    expect(stripGeneratedArticleReferences(twice)).toBe('正文 [^1]')
  })

  it('renumbers existing inline citations by their first appearance after editing', () => {
    const first = buildArticleCitationMarkdown('First Source')!
    const second = buildArticleCitationMarkdown('Second Source')!
    const initial = syncGeneratedArticleReferences(`先看 ${first}，再看 ${second}。`)
    const reorderedBody = stripGeneratedArticleReferences(initial).replace('先看 [^1]，再看 [^2]', '先看 [^2]，再看 [^1]')
    const reordered = syncGeneratedArticleReferences(`${reorderedBody}\n\n${initial.slice(initial.indexOf('<!-- article-references:start -->'))}`)

    expect(stripGeneratedArticleReferences(reordered)).toBe('先看 [^1]，再看 [^2]。')
    expect(reordered).toContain('1. <!-- article-reference:1 -->《Second Source》')
    expect(reordered).toContain('2. <!-- article-reference:2 -->《First Source》')
  })

  it('keeps generated Markdown links from being escaped by hostile URL punctuation', () => {
    const citation = buildArticleCitationMarkdown(
      '安全标题',
      'https://example.com/)[x](javascript:alert(document.domain))',
    )!
    const synced = syncGeneratedArticleReferences(`正文${citation}`)

    expect(synced).toContain('https://example.com/%29[x]%28javascript:alert%28document.domain%29%29')
    expect(synced).not.toContain(')[x](')
    expect(buildArticleCitationMarkdown('凭据链接', 'https://user:password@example.com/')).toBeNull()
  })

  it('keeps linked titles with Markdown punctuation stable across repeated syncs', () => {
    const citation = buildArticleCitationMarkdown('A <B> [C]', 'https://example.com/source')!
    const once = syncGeneratedArticleReferences(`正文${citation}`)
    const twice = syncGeneratedArticleReferences(once)

    expect(twice).toBe(once)
  })

  it('migrates legacy visible citations without removing their title', () => {
    const synced = syncGeneratedArticleReferences('正文《旧文章》<!-- article-citation -->。')

    expect(stripGeneratedArticleReferences(synced)).toBe('正文《旧文章》[^1]。')
    expect(synced).toContain('1. <!-- article-reference:1 -->《旧文章》')
  })
})
