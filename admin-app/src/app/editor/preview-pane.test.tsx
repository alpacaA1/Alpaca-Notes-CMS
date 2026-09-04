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

  it('renders ==highlight== markdown as a highlighted inline mark', () => {
    render(
      <PreviewPane
        title="高亮"
        date="2026-05-08 10:00:00"
        markdown="这里有 ==重要内容==。"
      />,
    )

    const highlighted = screen.getByText('重要内容')
    expect(highlighted.tagName).toBe('MARK')
    expect(highlighted.className).toContain('preview-content__markdown-highlight')
  })

  it('emits a task toggle when a preview checkbox is clicked', () => {
    const onToggleTask = vi.fn()
    render(
      <PreviewPane
        title="待办"
        date="2026-05-08 10:00:00"
        markdown="- [ ] 完成编辑"
        onToggleTask={onToggleTask}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox'))

    expect(onToggleTask).toHaveBeenCalledWith('完成编辑', true)
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

  it('keeps read-later title metadata to date and original link only', () => {
    const { container } = render(
      <PreviewPane
        title="第268期 - 小河公园"
        date="5月25日 08:00"
        markdown="正文内容。"
        contentType="read-later"
        desc="这段摘要不应出现在标题模块。"
        sourceName="潮流周刊"
        externalUrl="https://weekly.tw93.fun/"
        readingStatus="unread"
        cover="https://example.com/cover.jpg"
      />,
    )

    const titleMeta = container.querySelector('.preview-content__reader-title-meta')
    const originalLink = screen.getByRole('link', { name: '查看原文' })

    expect(titleMeta).toBeTruthy()
    expect(titleMeta?.textContent).toContain('5月25日 08:00')
    expect(titleMeta?.contains(originalLink)).toBe(true)
    expect(originalLink.getAttribute('href')).toBe('https://weekly.tw93.fun/')
    expect(screen.queryByText('潮流周刊')).toBeNull()
    expect(screen.queryByText('未读')).toBeNull()
    expect(screen.queryByText('这段摘要不应出现在标题模块。')).toBeNull()
    expect(screen.queryByRole('img', { name: '第268期 - 小河公园' })).toBeNull()
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

  it('uses the unified reader body style for post, diary, and read-later previews', () => {
    const { container, rerender } = render(
      <PreviewPane title="文档预览" date="2026-05-09 14:27:37" markdown="正文" contentType="post" />,
    )

    expect(container.querySelector('.preview-content')?.className).toContain('preview-content--reader')

    rerender(<PreviewPane title="日记预览" date="2026-05-09 14:27:37" markdown="正文" contentType="diary" />)
    expect(container.querySelector('.preview-content')?.className).toContain('preview-content--reader')

    rerender(<PreviewPane title="待读预览" date="2026-05-09 14:27:37" markdown="正文" contentType="read-later" />)
    expect(container.querySelector('.preview-content')?.className).toContain('preview-content--reader')
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

  it('renders bare mermaid blocks as diagrams when the runtime is available', async () => {
    const initialize = vi.fn()
    const renderMermaid = vi.fn().mockResolvedValue({
      svg: '<svg viewBox="0 0 240 80"><text x="12" y="32">阶段 1 到阶段 2</text></svg>',
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
        title="裸 Mermaid 预览"
        date="2026-05-14 21:05:00"
        markdown={`flowchart LR
  A["阶段 1"] --> B["阶段 2"]
  B --> C["阶段 3"]`}
      />,
    )

    await waitFor(() => {
      expect(renderMermaid).toHaveBeenCalledWith(
        expect.stringMatching(/^preview-mermaid-/),
        'flowchart LR\n  A["阶段 1"] --> B["阶段 2"]\n  B --> C["阶段 3"]',
      )
    })

    expect(container.querySelector('.preview-mermaid svg')).toBeTruthy()
    expect(screen.queryByText('A["阶段 1"] --> B["阶段 2"]')).toBeNull()
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

  it('resolves relative image urls to vercel image proxy api when not in memory cache', () => {
    render(
      <PreviewPane
        title="图片代理测试"
        date="2026-08-21 10:00:00"
        markdown="![示意图](/Alpaca-Notes-CMS/images/2026/08/sample.webp)"
      />,
    )

    const img = screen.getByRole('img', { name: '示意图' })
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('https://alpaca-notes-cms.vercel.app/api/images?path=images%2F2026%2F08%2Fsample.webp')
  })

  it('prefers in-memory previewImageUrls over proxy api url', () => {
    render(
      <PreviewPane
        title="内存图片测试"
        date="2026-08-21 10:00:00"
        markdown="![示意图](/Alpaca-Notes-CMS/images/2026/08/sample.webp)"
        previewImageUrls={{
          '/Alpaca-Notes-CMS/images/2026/08/sample.webp': 'blob:http://localhost/sample-blob',
        }}
      />,
    )

    const img = screen.getByRole('img', { name: '示意图' })
    expect(img).toBeTruthy()
    expect(img.getAttribute('src')).toBe('blob:http://localhost/sample-blob')
  })

  it('does not render HTML comments in preview', () => {
    render(
      <PreviewPane
        title="注释测试"
        date="2026-08-25 10:00:00"
        markdown={`## 自我观察

<!-- alpaca:self-observation id="so_20260825_113353_uh8e" kind="emotion" version="1" -->
### 🔖 11:33 · 情绪签到

> 💭 **我现在**：烦
<!-- /alpaca:self-observation -->
`}
      />,
    )

    expect(screen.getAllByText(/11:33 · 情绪签到/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/我现在/)).toBeTruthy()
    expect(screen.queryByText(/alpaca:self-observation/)).toBeNull()
    expect(screen.queryByText(/<!--/)).toBeNull()
    expect(screen.queryByText(/-->/)).toBeNull()
  })

  describe('Article (post) markdown highlighting', () => {
    it('supports selecting text in article preview and applying markdown highlight ==quote==', async () => {
      const handleUpdateMarkdown = vi.fn()
      const markdown = '这是一个关于前端工程化的核心思想解析。'

      const { container } = render(
        <PreviewPane
          title="前端工程化"
          date="2026-08-28 10:00:00"
          markdown={markdown}
          contentType="post"
          onUpdateMarkdown={handleUpdateMarkdown}
        />,
      )

      const p = screen.getByText('这是一个关于前端工程化的核心思想解析。')
      const textNode = p.firstChild as Text

      const rangeMock = {
        collapsed: false,
        commonAncestorContainer: p,
        startContainer: textNode,
        startOffset: 12,
        endContainer: textNode,
        endOffset: 16,
        getBoundingClientRect: () => ({
          top: 100,
          left: 100,
          width: 40,
          height: 18,
          right: 140,
          bottom: 118,
        }),
      }

      const selectionMock = {
        rangeCount: 1,
        isCollapsed: false,
        toString: () => '核心思想',
        getRangeAt: (_index = 0) => rangeMock,
        removeAllRanges: vi.fn(),
      }

      vi.spyOn(window, 'getSelection').mockReturnValue(selectionMock as unknown as Selection)

      const article = container.querySelector('article')!
      fireEvent.mouseUp(article)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '高亮' })).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: '高亮' }))

      expect(handleUpdateMarkdown).toHaveBeenCalledWith('这是一个关于前端工程化的==核心思想==解析。')
    })

    it('supports cancelling highlight on click of an existing mark in article preview', async () => {
      const handleUpdateMarkdown = vi.fn()
      const markdown = '这是一个关于前端工程化的==核心思想==解析。'

      render(
        <PreviewPane
          title="前端工程化"
          date="2026-08-28 10:00:00"
          markdown={markdown}
          contentType="post"
          onUpdateMarkdown={handleUpdateMarkdown}
        />,
      )

      const mark = screen.getByText('核心思想')
      expect(mark.tagName.toLowerCase()).toBe('mark')

      fireEvent.click(mark)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '取消高亮' })).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: '取消高亮' }))

      expect(handleUpdateMarkdown).toHaveBeenCalledWith('这是一个关于前端工程化的核心思想解析。')
    })
  })

  describe('Image Gallery and Lightbox', () => {
    it('renders multiple consecutive images as a gallery with caption', () => {
      const markdown = `
![Avatar 1](https://example.com/avatar1.png)
![Avatar 2](https://example.com/avatar2.png)
![Avatar 3](https://example.com/avatar3.png)
*Bot avatar visual style explorations*
`
      const { container } = render(
        <PreviewPane
          title="头像展览"
          date="2026-09-04 10:00:00"
          markdown={markdown}
          contentType="read-later"
        />,
      )

      const gallery = container.querySelector('.preview-gallery')
      expect(gallery).toBeTruthy()
      expect(gallery?.className).toContain('preview-gallery--count-3')

      const images = container.querySelectorAll('.preview-gallery__img')
      expect(images.length).toBe(3)

      const caption = container.querySelector('.preview-gallery__caption')
      expect(caption?.textContent).toContain('Bot avatar visual style explorations')
    })

    it('renders single-line multi-image strip with trailing caption in next line', () => {
      const markdown = `
![light day](https://example.com/wall-1.png)![light noon](https://example.com/wall-2.png)![light night](https://example.com/wall-3.png)![dark day](https://example.com/wall-4.png)![dark noon](https://example.com/wall-5.png)

Dynamic wallpaper by Kenny Kuh and Luke Barker.
`
      const { container } = render(
        <PreviewPane
          title="壁纸演变"
          date="2026-09-04 10:00:00"
          markdown={markdown}
          contentType="read-later"
        />,
      )

      const gallery = container.querySelector('.preview-gallery')
      expect(gallery).toBeTruthy()
      expect(gallery?.className).toContain('preview-gallery--count-5')
      expect(gallery?.className).not.toContain('preview-gallery--dense')

      const images = container.querySelectorAll('.preview-gallery__img')
      expect(images.length).toBe(5)

      const caption = container.querySelector('.preview-gallery__caption')
      expect(caption?.textContent).toContain('Dynamic wallpaper by Kenny Kuh and Luke Barker.')
    })

    it('renders 10 or more images as a dense gallery matrix', () => {
      const markdown = Array.from({ length: 12 }, (_, i) => `![Bot ${i + 1}](https://example.com/bot${i + 1}.png)`).join('\n')
      const { container } = render(
        <PreviewPane
          title="Grok Bot Avatars"
          date="2026-09-04 10:00:00"
          markdown={markdown}
          contentType="read-later"
        />,
      )

      const gallery = container.querySelector('.preview-gallery')
      expect(gallery).toBeTruthy()
      expect(gallery?.className).toContain('preview-gallery--dense')

      const items = container.querySelectorAll('.preview-gallery__item')
      expect(items.length).toBe(12)
    })

    it('opens lightbox on gallery item click and supports prev/next navigation', async () => {
      const markdown = `
![Img 1](https://example.com/1.png)
![Img 2](https://example.com/2.png)
![Img 3](https://example.com/3.png)
`
      const { container } = render(
        <PreviewPane
          title="图集浏览"
          date="2026-09-04 10:00:00"
          markdown={markdown}
          contentType="read-later"
        />,
      )

      const items = container.querySelectorAll('.preview-gallery__item')
      expect(items.length).toBe(3)

      // Click second image
      fireEvent.click(items[1])

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: '图片预览' })).toBeTruthy()
      })

      // Counter should show 2 / 3
      expect(screen.getByText('2 / 3')).toBeTruthy()

      // Click next
      const nextBtn = screen.getByRole('button', { name: '下一张图片' })
      fireEvent.click(nextBtn)

      expect(screen.getByText('3 / 3')).toBeTruthy()

      // Keyboard left arrow
      fireEvent.keyDown(window, { key: 'ArrowLeft' })
      expect(screen.getByText('2 / 3')).toBeTruthy()

      // Keyboard left arrow again
      fireEvent.keyDown(window, { key: 'ArrowLeft' })
      expect(screen.getByText('1 / 3')).toBeTruthy()

      // Close lightbox via close button
      const closeBtn = screen.getByRole('button', { name: '关闭图片预览' })
      fireEvent.click(closeBtn)

      expect(screen.queryByRole('dialog', { name: '图片预览' })).toBeNull()
    })
  })
})
