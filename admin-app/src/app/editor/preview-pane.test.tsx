import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PreviewPane from './preview-pane'

describe('PreviewPane', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    delete (window as Window & { mermaid?: unknown; __adminPreviewMermaidRuntimePromise?: Promise<unknown> }).mermaid
    delete (window as Window & { mermaid?: unknown; __adminPreviewMermaidRuntimePromise?: Promise<unknown> }).__adminPreviewMermaidRuntimePromise
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
      <div data-testid="preview-scroll-shell" style={{ overflowY: 'auto', maxHeight: '640px' }}>
        <PreviewPane
          title="文章目录"
          date="2026-05-09 10:00:00"
          markdown={`导语内容。

## 需求背景
平台需要在预览态快速折叠长文档。

### 业务流程
1. 平台发起刷新。
2. 设备执行任务。`}
        />
      </div>,
    )

    const scrollShell = screen.getByTestId('preview-scroll-shell') as HTMLElement
    const article = container.querySelector('#post-preview-content') as HTMLElement | null
    const backgroundHeading = screen.getByRole('heading', { name: '需求背景' })
    const flowHeading = screen.getByRole('heading', { name: '业务流程' })
    let backgroundTop = 176
    let flowTop = 468

    if (!article) {
      throw new Error('Missing article preview container for active outline test.')
    }

    Object.defineProperty(scrollShell, 'getBoundingClientRect', {
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

    fireEvent.scroll(scrollShell)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '需求背景' }).className).toContain('is-active')
    })

    backgroundTop = -96
    flowTop = 188
    fireEvent.scroll(scrollShell)

    await waitFor(() => {
      expect(screen.getByRole('link', { name: '业务流程' }).className).toContain('is-active')
    })

    expect(screen.getByRole('link', { name: '需求背景' }).className).not.toContain('is-active')
  })

  it('scrolls the enclosing layout instead of the window when article preview lives in an internal scroller', () => {
    const { container } = render(
      <div data-testid="preview-scroll-shell" style={{ overflowY: 'auto', maxHeight: '640px' }}>
        <PreviewPane
          title="文章目录"
          date="2026-05-09 10:00:00"
          markdown={`导语内容。

## 需求背景
平台需要在预览态快速折叠长文档。

### 业务流程
1. 平台发起刷新。
2. 设备执行任务。`}
        />
      </div>,
    )

    const scrollShell = screen.getByTestId('preview-scroll-shell') as HTMLElement
    const backgroundHeading = screen.getByRole('heading', { name: '需求背景' })
    const backgroundLink = screen.getByRole('link', { name: '需求背景' })
    const layoutScrollTo = vi.fn()
    const windowScrollTo = vi.fn()

    Object.defineProperty(scrollShell, 'scrollTo', {
      configurable: true,
      value: layoutScrollTo,
    })
    Object.defineProperty(scrollShell, 'scrollTop', {
      configurable: true,
      value: 180,
      writable: true,
    })
    Object.defineProperty(scrollShell, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 84, left: 0, right: 1200, bottom: 724, width: 1200, height: 640, x: 0, y: 84, toJSON: () => ({}) }),
    })
    Object.defineProperty(backgroundHeading, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 340, left: 0, right: 640, bottom: 380, width: 640, height: 40, x: 0, y: 340, toJSON: () => ({}) }),
    })
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      value: windowScrollTo,
    })

    fireEvent.click(backgroundLink)

    expect(layoutScrollTo).toHaveBeenCalledWith({ top: 412, behavior: 'smooth' })
    expect(windowScrollTo).not.toHaveBeenCalled()
    expect(container.querySelector('.preview-post-outline__panel')?.className).toContain('preview-post-outline__panel')
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

  it('opens a lightbox when preview images are clicked', () => {
    render(
      <PreviewPane
        title="图片预览"
        date="2026-05-09 14:27:37"
        markdown="![方案概览 Mockup](https://example.com/mockup(v2).png)"
      />,
    )

    fireEvent.click(screen.getByRole('img', { name: '方案概览 Mockup' }))

    expect(screen.getByRole('dialog', { name: '图片预览' })).toBeTruthy()
    expect(screen.getByText('方案概览 Mockup')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '关闭图片预览' }))
    expect(screen.queryByRole('dialog', { name: '图片预览' })).toBeNull()
  })

  it('renders mermaid fenced code blocks as diagrams when the runtime is available', async () => {
    const initialize = vi.fn()
    const renderMermaid = vi.fn().mockResolvedValue({
      svg: '<svg viewBox="0 0 160 64"><text x="12" y="32">阶段 1</text></svg>',
    })

    ;(window as Window & {
      mermaid?: {
        initialize: typeof initialize
        render: typeof renderMermaid
      }
    }).mermaid = {
      initialize,
      render: renderMermaid,
    }

    const { container } = render(
      <PreviewPane
        title="Mermaid 预览"
        date="2026-05-14 20:16:00"
        markdown={'```mermaid\nflowchart LR\nA[阶段 1] --> B[阶段 2]\n```'}
      />,
    )

    await waitFor(() => {
      expect(renderMermaid).toHaveBeenCalledWith(expect.stringMatching(/^preview-mermaid-/), 'flowchart LR\nA[阶段 1] --> B[阶段 2]')
    })

    expect(initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'neutral',
    })
    expect(container.querySelector('.preview-mermaid svg')).toBeTruthy()
    expect(screen.queryByText('flowchart LR')).toBeNull()
  })

  it('falls back to raw code when mermaid rendering fails', async () => {
    ;(window as Window & {
      mermaid?: {
        initialize: ReturnType<typeof vi.fn>
        render: ReturnType<typeof vi.fn>
      }
    }).mermaid = {
      initialize: vi.fn(),
      render: vi.fn().mockRejectedValue(new Error('render failed')),
    }

    render(
      <PreviewPane
        title="Mermaid 回退"
        date="2026-05-14 20:19:00"
        markdown={'```mermaid\nflowchart LR\nA --> B\n```'}
      />,
    )

    const rawCode = await screen.findByText(
      (_, element) => element?.tagName === 'CODE' && element.textContent === 'flowchart LR\nA --> B',
    )
    expect(rawCode.closest('code')).toBeTruthy()
  })
})
