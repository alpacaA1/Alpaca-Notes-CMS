import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PreviewPane from './preview-pane'

describe('PreviewPane', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders markdown headings as collapsible sections in preview', () => {
    render(
      <PreviewPane
        title="标题折叠"
        date="2026-05-08 10:00:00"
        markdown={`导语内容。

## 需求背景
平台需要在预览态快速折叠长文档。

### 业务流程
1. 平台发起刷新。
2. 设备执行任务。

#### 执行结果
设备回写执行状态。`}
      />,
    )

    expect(screen.getByText('导语内容。')).toBeTruthy()

    const backgroundDetails = screen.getByRole('heading', { name: '需求背景' }).closest('details') as HTMLDetailsElement | null
    const flowDetails = screen.getByRole('heading', { name: '业务流程' }).closest('details') as HTMLDetailsElement | null
    const resultDetails = screen.getByRole('heading', { name: '执行结果' }).closest('details') as HTMLDetailsElement | null

    expect(backgroundDetails?.open).toBe(true)
    expect(flowDetails?.open).toBe(true)
    expect(resultDetails?.open).toBe(true)

    fireEvent.click(backgroundDetails?.querySelector('summary') as HTMLElement)
    expect(backgroundDetails?.open).toBe(false)

    fireEvent.click(backgroundDetails?.querySelector('summary') as HTMLElement)
    expect(backgroundDetails?.open).toBe(true)
  })

  it('renders a sticky outline for article preview and scrolls to the selected heading', async () => {
    const { container } = render(
      <PreviewPane
        title="文章目录"
        date="2026-05-09 10:00:00"
        markdown={`导语内容。

## 需求背景
平台需要在预览态快速折叠长文档。

### 业务流程
1. 平台发起刷新。
2. 设备执行任务。`}
      />,
    )

    const previewPane = container.querySelector('.preview-pane--reading-canvas') as HTMLElement | null
    const article = container.querySelector('#post-preview-content') as HTMLElement | null
    const backgroundHeading = screen.getByRole('heading', { name: '需求背景' })
    const backgroundLink = screen.getByRole('link', { name: '需求背景' })
    const scrollTo = vi.fn()

    if (!previewPane || !article) {
      throw new Error('Missing article preview container for outline test.')
    }

    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    })
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 240,
      writable: true,
    })
    Object.defineProperty(previewPane, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, left: 0, right: 1200, bottom: 900, width: 1200, height: 800, x: 0, y: 100, toJSON: () => ({}) }),
    })
    Object.defineProperty(article, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 112, left: 0, right: 860, bottom: 1080, width: 860, height: 968, x: 0, y: 112, toJSON: () => ({}) }),
    })
    Object.defineProperty(backgroundHeading, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 420, left: 0, right: 640, bottom: 460, width: 640, height: 40, x: 0, y: 420, toJSON: () => ({}) }),
    })

    expect(screen.getByRole('navigation', { name: '文章目录' })).toBeTruthy()
    expect(backgroundLink.getAttribute('href')).toBe('#post-preview-heading-需求背景')

    fireEvent.click(backgroundLink)

    expect(scrollTo).toHaveBeenCalledWith({ top: 552, behavior: 'smooth' })
  })

  it('updates the active article outline item while preview scroll position changes', async () => {
    const { container } = render(
      <PreviewPane
        title="文章目录"
        date="2026-05-09 10:00:00"
        markdown={`导语内容。

## 需求背景
平台需要在预览态快速折叠长文档。

### 业务流程
1. 平台发起刷新。
2. 设备执行任务。`}
      />,
    )

    const previewPane = container.querySelector('.preview-pane--reading-canvas') as HTMLElement | null
    const article = container.querySelector('#post-preview-content') as HTMLElement | null
    const backgroundHeading = screen.getByRole('heading', { name: '需求背景' })
    const flowHeading = screen.getByRole('heading', { name: '业务流程' })
    let backgroundTop = 176
    let flowTop = 468

    if (!previewPane || !article) {
      throw new Error('Missing article preview container for active outline test.')
    }

    Object.defineProperty(previewPane, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 100, left: 0, right: 1200, bottom: 900, width: 1200, height: 800, x: 0, y: 100, toJSON: () => ({}) }),
    })
    Object.defineProperty(article, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 112, left: 0, right: 860, bottom: 1080, width: 860, height: 968, x: 0, y: 112, toJSON: () => ({}) }),
    })
    Object.defineProperty(backgroundHeading, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: backgroundTop, left: 0, right: 640, bottom: backgroundTop + 40, width: 640, height: 40, x: 0, y: backgroundTop, toJSON: () => ({}) }),
    })
    Object.defineProperty(flowHeading, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: flowTop, left: 0, right: 640, bottom: flowTop + 40, width: 640, height: 40, x: 0, y: flowTop, toJSON: () => ({}) }),
    })

    fireEvent.scroll(previewPane)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '需求背景' }).className).toContain('is-active')
    })

    backgroundTop = -96
    flowTop = 188
    fireEvent.scroll(previewPane)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '业务流程' }).className).toContain('is-active')
    })

    expect(screen.getByRole('link', { name: '需求背景' }).className).not.toContain('is-active')
  })

  it('renders markdown images whose URLs contain parentheses', () => {
    render(
      <PreviewPane
        title="图片预览"
        date="2026-05-09 14:27:37"
        markdown="![方案概览 Mockup](https://example.com/mockup(v2).png)"
      />,
    )

    const image = screen.getByRole('img', { name: '方案概览 Mockup' })
    expect(image.getAttribute('src')).toBe('https://example.com/mockup(v2).png')
  })
})
