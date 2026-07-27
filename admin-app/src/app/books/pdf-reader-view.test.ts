import { describe, expect, it } from 'vitest'
import { isCachedPdfPageCompatible } from './pdf-reader-view'

describe('PDF 页面缓存尺寸兼容性', () => {
  const cached = { layout: 'paginated' as const, frameWidth: 560, frameHeight: 620 }

  it('容器尺寸变化时拒绝复用旧 Canvas', () => {
    expect(isCachedPdfPageCompatible(cached, 'paginated', 560, 620)).toBe(true)
    expect(isCachedPdfPageCompatible(cached, 'paginated', 560, 540)).toBe(false)
    expect(isCachedPdfPageCompatible(cached, 'scrolled', 560, 620)).toBe(false)
  })
})
