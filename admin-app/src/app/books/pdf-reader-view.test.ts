import { describe, expect, it, vi } from 'vitest'
import { isCachedPdfPageCompatible, scrollPdfPageWithinContainer } from './pdf-reader-view'

describe('PDF 页面缓存尺寸兼容性', () => {
  const cached = { layout: 'paginated' as const, frameWidth: 560, frameHeight: 620 }

  it('容器尺寸变化时拒绝复用旧 Canvas', () => {
    expect(isCachedPdfPageCompatible(cached, 'paginated', 560, 620)).toBe(true)
    expect(isCachedPdfPageCompatible(cached, 'paginated', 560, 540)).toBe(false)
    expect(isCachedPdfPageCompatible(cached, 'scrolled', 560, 620)).toBe(false)
  })
})

describe('PDF 滚动定位', () => {
  it('只滚动 PDF 容器，不调用会连带滚动外层页面的 scrollIntoView', () => {
    const container = document.createElement('div')
    const target = document.createElement('div')
    container.scrollTop = 240
    container.getBoundingClientRect = () => ({ top: 80 } as DOMRect)
    target.getBoundingClientRect = () => ({ top: 560 } as DOMRect)
    const scrollTo = vi.fn()
    const scrollIntoView = vi.fn()
    container.scrollTo = scrollTo
    target.scrollIntoView = scrollIntoView

    scrollPdfPageWithinContainer(container, target, 'auto')

    expect(scrollTo).toHaveBeenCalledWith({ top: 720, behavior: 'auto' })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
