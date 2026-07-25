import { describe, expect, it } from 'vitest'
import {
  BOOK_HIGHLIGHT_COLOR,
  createBookAnnotationId,
  createBookId,
  flattenBookTocLabels,
  formatBookProgress,
  formatContributor,
  formatLanguageMap,
  getFallbackCoverColor,
  isEpubFile,
  isPdfFile,
  isSupportedBookFile,
  normalizeBookQuote,
} from './book-utils'

describe('isEpubFile', () => {
  it('按扩展名识别 epub', () => {
    expect(isEpubFile({ name: 'demo.epub' })).toBe(true)
    expect(isEpubFile({ name: 'demo.EPUB' })).toBe(true)
    expect(isEpubFile({ name: 'demo.pdf' })).toBe(false)
  })

  it('按 mime 识别 epub', () => {
    expect(isEpubFile({ name: 'demo', type: 'application/epub+zip' })).toBe(true)
  })
})

describe('PDF 文件识别', () => {
  it('按扩展名和 mime 识别 pdf', () => {
    expect(isPdfFile({ name: 'demo.pdf' })).toBe(true)
    expect(isPdfFile({ name: 'demo.PDF' })).toBe(true)
    expect(isPdfFile({ name: 'demo', type: 'application/pdf' })).toBe(true)
    expect(isPdfFile({ name: 'demo.epub' })).toBe(false)
  })

  it('识别支持的电子书格式', () => {
    expect(isSupportedBookFile({ name: 'demo.epub' })).toBe(true)
    expect(isSupportedBookFile({ name: 'demo.pdf' })).toBe(true)
    expect(isSupportedBookFile({ name: 'demo.txt' })).toBe(false)
  })
})

describe('id 生成', () => {
  it('book id 带前缀且不重复', () => {
    const left = createBookId()
    const right = createBookId()
    expect(left.startsWith('book-')).toBe(true)
    expect(left).not.toBe(right)
  })

  it('annotation id 带前缀且不重复', () => {
    const left = createBookAnnotationId()
    const right = createBookAnnotationId()
    expect(left.startsWith('book-annotation-')).toBe(true)
    expect(left).not.toBe(right)
  })
})

describe('formatLanguageMap', () => {
  it('处理字符串、对象与空值', () => {
    expect(formatLanguageMap('标题')).toBe('标题')
    expect(formatLanguageMap({ zh: '标题', en: 'Title' })).toBe('标题')
    expect(formatLanguageMap(undefined)).toBe('')
    expect(formatLanguageMap(null)).toBe('')
    expect(formatLanguageMap({})).toBe('')
  })
})

describe('formatContributor', () => {
  it('处理数组、contributor 对象与字符串', () => {
    expect(formatContributor(['张三', '李四'])).toBe('张三、李四')
    expect(formatContributor({ name: '张三' })).toBe('张三')
    expect(formatContributor('张三')).toBe('张三')
    expect(formatContributor(undefined)).toBe('')
    expect(formatContributor([{ name: { zh: '张三' } }])).toBe('张三')
  })
})

describe('normalizeBookQuote', () => {
  it('压缩空白并截断', () => {
    expect(normalizeBookQuote('  一段  话\n换行  ')).toBe('一段 话 换行')
    expect(normalizeBookQuote('')).toBe('')
    const long = '字'.repeat(600)
    expect(normalizeBookQuote(long)).toHaveLength(500)
  })
})

describe('formatBookProgress', () => {
  it('格式化为百分比并夹取范围', () => {
    expect(formatBookProgress(0)).toBe('0%')
    expect(formatBookProgress(0.456)).toBe('46%')
    expect(formatBookProgress(1)).toBe('100%')
    expect(formatBookProgress(1.2)).toBe('100%')
    expect(formatBookProgress(-0.5)).toBe('0%')
  })
})

describe('getFallbackCoverColor', () => {
  it('同一 seed 返回稳定颜色', () => {
    expect(getFallbackCoverColor(7)).toBe(getFallbackCoverColor(7))
    expect(getFallbackCoverColor(-7)).toBe(getFallbackCoverColor(7))
    expect(typeof getFallbackCoverColor(0)).toBe('string')
  })
})

describe('flattenBookTocLabels', () => {
  it('展平多级目录标签', () => {
    const labels = flattenBookTocLabels([
      { label: '第一章', subitems: [{ label: '1.1 小节', subitems: null }] },
      { label: '第二章', subitems: null },
    ])
    expect(labels).toEqual(['第一章', '1.1 小节', '第二章'])
  })
})

describe('BOOK_HIGHLIGHT_COLOR', () => {
  it('是合法 hex 颜色', () => {
    expect(BOOK_HIGHLIGHT_COLOR).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
})
