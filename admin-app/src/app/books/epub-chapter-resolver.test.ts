import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  canonicalizeFullText,
  flattenToc,
  isMeaningfulChapter,
  matchesPath,
  matchQuoteInSection,
  normalizeTextForSearch,
  resolveAnnotationsWithEpub,
  stripPunctuation,
  type ResolvedSectionContent,
} from './epub-chapter-resolver'
import type { BookAnnotation, BookTocItem } from './book-types'

vi.mock('./book-store', () => ({
  listBookAnnotations: vi.fn().mockResolvedValue([]),
  putBookAnnotation: vi.fn().mockResolvedValue(undefined),
  getBookFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('foliate-js/view.js', () => ({
  makeBook: vi.fn(),
}))

describe('epub-chapter-resolver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Text Normalization & Full Content Matching', () => {
    it('normalizes whitespace and linebreaks for full text search', () => {
      const input = '阿德勒心理学\n\t  是“勇气的心理学”。\u3000'
      expect(normalizeTextForSearch(input)).toBe('阿德勒心理学 是“勇气的心理学”。')
    })

    it('canonicalizes quotes and punctuation while retaining full text sequence', () => {
      const input = '“世界很单纯，人生也一样。”'
      expect(canonicalizeFullText(input)).toBe('"世界很单纯，人生也一样。"')
      // Checks that stripped/canonicalized version contains every word in sequence
      expect(canonicalizeFullText(input)).toContain('世界很单纯')
      expect(canonicalizeFullText(input)).toContain('人生也一样')
    })

    it('strips all punctuation for full character-content matching', () => {
      const input = '——所谓的自由，就是被人讨厌。'
      expect(stripPunctuation(input)).toBe('所谓的自由就是被人讨厌')
    })

    it('ensures matchQuoteInSection checks the ENTIRE content, not just prefix', () => {
      const sectionText = '这是一段正文：所谓的自由，就是被人讨厌。这也是阿德勒心理学的核心。'
      const section: Pick<ResolvedSectionContent, 'normalizedText' | 'canonicalText' | 'strippedText'> = {
        normalizedText: normalizeTextForSearch(sectionText),
        canonicalText: canonicalizeFullText(sectionText),
        strippedText: stripPunctuation(sectionText),
      }

      // Exact full match
      expect(matchQuoteInSection('所谓的自由，就是被人讨厌。', section)).toBe(true)

      // Full match with different quote marks or minor spacing
      expect(matchQuoteInSection('“所谓的自由，就是被人讨厌。”', section)).toBe(true)

      // Does NOT match if the second half differs (even if first 20 chars match!)
      const prefixMatchedButSuffixWrong = '所谓的自由，就是被人喜欢。'
      expect(matchQuoteInSection(prefixMatchedButSuffixWrong, section)).toBe(false)
    })
  })

  describe('TOC Flattening & Path Matching', () => {
    it('flattens nested TOC items and extracts fragments', () => {
      const toc: BookTocItem[] = [
        {
          label: '封面',
          href: 'cover.xhtml',
          subitems: null,
        },
        {
          label: '第一夜 我们的不幸是谁的错',
          href: 'text/chapter01.xhtml#night1',
          subitems: [
            {
              label: '不为人知的心理学第三巨头',
              href: 'text/chapter01.xhtml#section1',
              subitems: null,
            },
          ],
        },
      ]

      const flat = flattenToc(toc)
      expect(flat).toHaveLength(3)
      expect(flat[0].label).toBe('封面')
      expect(flat[0].normalizedPath).toBe('cover.xhtml')
      expect(flat[0].fragment).toBeNull()

      expect(flat[1].label).toBe('第一夜 我们的不幸是谁的错')
      expect(flat[1].normalizedPath).toBe('text/chapter01.xhtml')
      expect(flat[1].fragment).toBe('night1')

      expect(flat[2].label).toBe('不为人知的心理学第三巨头')
      expect(flat[2].normalizedPath).toBe('text/chapter01.xhtml')
      expect(flat[2].fragment).toBe('section1')
    })

    it('matches section paths across relative segment variations', () => {
      expect(matchesPath('text/chapter01.xhtml', 'OEBPS/text/chapter01.xhtml')).toBe(true)
      expect(matchesPath('chapter01.xhtml', 'OEBPS/text/chapter01.xhtml')).toBe(true)
      expect(matchesPath('./text/chapter01.xhtml', 'text/chapter01.xhtml')).toBe(true)
      expect(matchesPath('text/ch02.xhtml', 'text/ch01.xhtml')).toBe(false)
    })

    it('identifies placeholder chapter names', () => {
      expect(isMeaningfulChapter('第一夜 我们的不幸是谁的错')).toBe(true)
      expect(isMeaningfulChapter('划线片段')).toBe(false)
      expect(isMeaningfulChapter('读书想法')).toBe(false)
      expect(isMeaningfulChapter('未知章节')).toBe(false)
      expect(isMeaningfulChapter('')).toBe(false)
      expect(isMeaningfulChapter(null)).toBe(false)
    })
  })

  describe('resolveAnnotationsWithEpub', () => {
    it('resolves annotations by matching full quote against EPUB sections and TOC', async () => {
      const { makeBook } = await import('foliate-js/view.js')

      const fakeDoc1 = {
        body: {
          textContent: '不为人知的心理学第三巨头。阿德勒生于维也纳，与弗洛伊德、荣格并称为心理学三大巨头。',
        },
        querySelector: vi.fn().mockReturnValue(null),
      }

      const fakeDoc2 = {
        body: {
          textContent: '所谓的自由，就是被人讨厌。因为如果想要按照自己的意愿生活，就必须具备被他人讨厌的勇气。',
        },
        querySelector: vi.fn().mockReturnValue(null),
      }

      vi.mocked(makeBook).mockResolvedValueOnce({
        toc: [
          { label: '第一夜 我们的不幸是谁的错', href: 'text/ch1.xhtml', subitems: null },
          { label: '第四夜 要有被讨厌的勇气', href: 'text/ch4.xhtml', subitems: null },
        ],
        sections: [
          {
            id: 'text/ch1.xhtml',
            createDocument: vi.fn().mockResolvedValue(fakeDoc1),
          },
          {
            id: 'text/ch4.xhtml',
            createDocument: vi.fn().mockResolvedValue(fakeDoc2),
          },
        ],
      } as any)

      const annotations: BookAnnotation[] = [
        {
          id: 'ann-1',
          bookId: 'weread-1001',
          value: '',
          color: '#D4A574',
          quote: '阿德勒生于维也纳，与弗洛伊德、荣格并称为心理学三大巨头。',
          note: '',
          chapter: '划线片段', // placeholder
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'ann-2',
          bookId: 'weread-1001',
          value: '',
          color: '#D4A574',
          quote: '所谓的自由，就是被人讨厌。因为如果想要按照自己的意愿生活，就必须具备被他人讨厌的勇气。',
          note: '核心洞见',
          chapter: '', // empty
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
        {
          id: 'ann-3',
          bookId: 'weread-1001',
          value: '',
          color: '#D4A574',
          quote: '这一段在书里没有出现过的内容。',
          note: '',
          chapter: '划线片段',
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
        },
      ]

      const fakeBlob = new Blob(['mock-epub-content'], { type: 'application/epub+zip' })
      const { enrichedAnnotations, updatedCount } = await resolveAnnotationsWithEpub(fakeBlob, annotations)

      expect(updatedCount).toBe(2)
      expect(enrichedAnnotations[0].chapter).toBe('第一夜 我们的不幸是谁的错')
      expect(enrichedAnnotations[1].chapter).toBe('第四夜 要有被讨厌的勇气')
      expect(enrichedAnnotations[2].chapter).toBe('划线片段') // unmatched remains unchanged
    })
  })
})
