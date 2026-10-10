import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReadLaterAnnotationIndexItem } from '../read-later/annotation-index'
import ReadLaterAnnotationsView from './read-later-annotations-view'

function createAnnotationIndexItem(overrides: Partial<ReadLaterAnnotationIndexItem> = {}): ReadLaterAnnotationIndexItem {
  return {
    id: overrides.id || 'annotation-id',
    sourceType: overrides.sourceType,
    annotationId: overrides.annotationId || 'annotation-id',
    postPath: overrides.postPath || 'source/read-later-items/default.md',
    postTitle: overrides.postTitle || '默认文章',
    postDate: overrides.postDate || '2026-05-01 10:00:00',
    sourceName: overrides.sourceName ?? null,
    externalUrl: overrides.externalUrl ?? null,
    tags: overrides.tags || ['默认标签'],
    readingStatus: overrides.readingStatus || 'unread',
    sectionKey: overrides.sectionKey || 'articleExcerpt',
    sectionLabel: overrides.sectionLabel || '原文摘录',
    chapterTitle: overrides.chapterTitle ?? null,
    parentChapterTitle: overrides.parentChapterTitle ?? null,
    quote: overrides.quote || '默认摘录',
    prefix: overrides.prefix || '',
    suffix: overrides.suffix || '',
    note: overrides.note || '',
    createdAt: overrides.createdAt || '2026-05-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-05-01T10:00:00.000Z',
    searchText: overrides.searchText || '默认文章 默认摘录',
  }
}

describe('ReadLaterAnnotationsView', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders 3-column layout with sources, annotation list and detail pane', () => {
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-1',
        annotationId: 'ann-1',
        postPath: 'source/items/item-1.md',
        postTitle: '我弥留之际',
        quote: '在缺乏爱的地方，任何节制都是不可能的。',
        note: '已有评论内容',
        prefix: '前文引述：',
        suffix: '后文结语。',
        updatedAt: '2026-05-02T10:00:00.000Z',
        searchText: '我弥留之际 在缺乏爱的地方 任何节制都是不可能的 已有评论内容',
      }),
      createAnnotationIndexItem({
        id: 'ann-2',
        annotationId: 'ann-2',
        postPath: 'source/items/item-2.md',
        postTitle: '荒原狼',
        quote: '时间是一个最奇妙的作者。',
        note: '',
        updatedAt: '2026-05-01T10:00:00.000Z',
        searchText: '荒原狼 时间是一个最奇妙的作者',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    // Header title and stats
    expect(screen.getByRole('heading', { name: '批注管理' })).toBeTruthy()
    expect(screen.getByText('2 条批注 · 来自 2 篇文章')).toBeTruthy()

    // Left column: 来源文章
    const sourceRail = screen.getByLabelText('来源文章列表')
    expect(sourceRail).toBeTruthy()
    expect(within(sourceRail).getByText('全部来源')).toBeTruthy()
    expect(within(sourceRail).getByText('我弥留之际')).toBeTruthy()
    expect(within(sourceRail).getByText('荒原狼')).toBeTruthy()

    // Middle column: 批注列表
    const listSection = screen.getByLabelText('批注列表区')
    expect(listSection).toBeTruthy()
    expect(within(listSection).getByText('在缺乏爱的地方，任何节制都是不可能的。')).toBeTruthy()
    expect(within(listSection).getByText('已有评论')).toBeTruthy()
    expect(within(listSection).getByText('时间是一个最奇妙的作者。')).toBeTruthy()

    // Right column: 批注详情
    const detailSection = screen.getByLabelText('批注详情与评论')
    expect(detailSection).toBeTruthy()
    expect(within(detailSection).getByText('完整摘录')).toBeTruthy()
    expect(within(detailSection).getByText('我的评论')).toBeTruthy()
    expect(within(detailSection).getByText('上下文')).toBeTruthy()
    expect(within(detailSection).getByText('1 / 2')).toBeTruthy()
  })

  it('filters by source article when clicking left column source items', () => {
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-1',
        annotationId: 'ann-1',
        postPath: 'source/items/item-1.md',
        postTitle: '我弥留之际',
        quote: '在缺乏爱的地方，任何节制都是不可能的。',
      }),
      createAnnotationIndexItem({
        id: 'ann-2',
        annotationId: 'ann-2',
        postPath: 'source/items/item-2.md',
        postTitle: '荒原狼',
        quote: '时间是一个最奇妙的作者。',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    const sourceRail = screen.getByLabelText('来源文章列表')
    const listSection = screen.getByLabelText('批注列表区')

    fireEvent.click(within(sourceRail).getByRole('button', { name: /荒原狼/ }))

    expect(within(listSection).queryByText('在缺乏爱的地方，任何节制都是不可能的。')).toBeNull()
    expect(within(listSection).getByText('时间是一个最奇妙的作者。')).toBeTruthy()

    // Switch back to "全部来源"
    fireEvent.click(within(sourceRail).getByRole('button', { name: /全部来源/ }))
    expect(within(listSection).getByText('在缺乏爱的地方，任何节制都是不可能的。')).toBeTruthy()
    expect(within(listSection).getByText('时间是一个最奇妙的作者。')).toBeTruthy()
  })

  it('filters source articles by searching in the source input', () => {
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-1',
        annotationId: 'ann-1',
        postPath: 'source/items/item-1.md',
        postTitle: '我弥留之际',
        quote: '摘录 1',
      }),
      createAnnotationIndexItem({
        id: 'ann-2',
        annotationId: 'ann-2',
        postPath: 'source/items/item-2.md',
        postTitle: '荒原狼',
        quote: '摘录 2',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    const searchInput = screen.getByPlaceholderText('搜索文章')
    fireEvent.change(searchInput, { target: { value: '荒原' } })

    const sourceRail = screen.getByLabelText('来源文章列表')
    expect(within(sourceRail).queryByText('我弥留之际')).toBeNull()
    expect(within(sourceRail).getByText('荒原狼')).toBeTruthy()
  })

  it('filters by comment status and persists filter in localStorage', () => {
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-1',
        annotationId: 'ann-1',
        postTitle: '文章 1',
        quote: '有评论的批注',
        note: '这是一条评论',
      }),
      createAnnotationIndexItem({
        id: 'ann-2',
        annotationId: 'ann-2',
        postTitle: '文章 2',
        quote: '无评论的批注',
        note: '',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    const listSection = screen.getByLabelText('批注列表区')
    expect(within(listSection).getByText('有评论的批注')).toBeTruthy()
    expect(within(listSection).getByText('无评论的批注')).toBeTruthy()

    // Filter by "有评论"
    fireEvent.click(screen.getByRole('button', { name: '筛选评论状态' }))
    fireEvent.click(screen.getByRole('option', { name: '有评论' }))

    expect(within(listSection).getByText('有评论的批注')).toBeTruthy()
    expect(within(listSection).queryByText('无评论的批注')).toBeNull()
    expect(window.localStorage.getItem('alpaca-annotations-filter-comment-status')).toBe('has-note')

    // Filter by "无评论"
    fireEvent.click(screen.getByRole('button', { name: '筛选评论状态' }))
    fireEvent.click(screen.getByRole('option', { name: '无评论' }))

    expect(within(listSection).queryByText('有评论的批注')).toBeNull()
    expect(within(listSection).getByText('无评论的批注')).toBeTruthy()
    expect(window.localStorage.getItem('alpaca-annotations-filter-comment-status')).toBe('no-note')
  })

  it('sorts annotations by different criteria', () => {
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-1',
        annotationId: 'ann-1',
        postTitle: 'B 篇',
        quote: '最早的批注',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      createAnnotationIndexItem({
        id: 'ann-2',
        annotationId: 'ann-2',
        postTitle: 'A 篇',
        quote: '最新的批注',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    const listSection = screen.getByLabelText('批注列表区')

    // Default is 'updated-desc' (最近批注)
    let cards = within(listSection).getAllByRole('button', { name: /的批注/ })
    expect(within(cards[0]).getByText('最新的批注')).toBeTruthy()
    expect(within(cards[1]).getByText('最早的批注')).toBeTruthy()

    // Change to 'updated-asc' (最早批注)
    fireEvent.click(screen.getByRole('button', { name: '筛选排序规则' }))
    fireEvent.click(screen.getByRole('option', { name: '最早批注' }))

    cards = within(listSection).getAllByRole('button', { name: /的批注/ })
    expect(within(cards[0]).getByText('最早的批注')).toBeTruthy()
    expect(within(cards[1]).getByText('最新的批注')).toBeTruthy()

    // Change to 'source-asc' (按来源文章排序)
    fireEvent.click(screen.getByRole('button', { name: '筛选排序规则' }))
    fireEvent.click(screen.getByRole('option', { name: '按来源文章排序' }))

    cards = within(listSection).getAllByRole('button', { name: /的批注/ })
    expect(within(cards[0]).getByText('最新的批注')).toBeTruthy() // A 篇 comes before B 篇
    expect(within(cards[1]).getByText('最早的批注')).toBeTruthy()
  })

  it('sorts source articles and annotations from near to far (由近及远)', () => {
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-old-book',
        annotationId: 'ann-old-book',
        postPath: 'book:old-book',
        postTitle: '旧书',
        quote: '一年前划线',
        createdAt: '2025-01-01T10:00:00.000Z',
        // Background enrichment might have bumped updatedAt, but without note, createdAt is truth
        updatedAt: '2026-09-09T14:14:00.000Z',
        note: '',
      }),
      createAnnotationIndexItem({
        id: 'ann-mid-book',
        annotationId: 'ann-mid-book',
        postPath: 'book:neurosis',
        postTitle: '我们时代的神经症人格',
        quote: '半年前划线',
        createdAt: '2026-03-01T10:00:00.000Z',
        updatedAt: '2026-09-09T14:14:00.000Z',
        note: '',
      }),
      createAnnotationIndexItem({
        id: 'ann-recent-book',
        annotationId: 'ann-recent-book',
        postPath: 'book:neurosis',
        postTitle: '我们时代的神经症人格',
        quote: '昨天划线',
        createdAt: '2026-09-08T10:00:00.000Z',
        updatedAt: '2026-09-09T14:14:00.000Z',
        note: '',
      }),
      createAnnotationIndexItem({
        id: 'ann-recent-article',
        annotationId: 'ann-recent-article',
        postPath: 'source/items/recent.md',
        postTitle: '最新文章',
        quote: '今天刚写了评论的批注',
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-09-09T12:00:00.000Z',
        note: '深度洞见',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    // Verify left column (来源文章) is sorted newest activity to oldest:
    // 1. "最新文章" (has note updated at 2026-09-09T12:00:00.000Z)
    // 2. "我们时代的神经症人格" (latest highlight at 2026-09-08T10:00:00.000Z)
    // 3. "旧书" (latest highlight at 2025-01-01T10:00:00.000Z)
    const sourceRail = screen.getByLabelText('来源文章列表')
    const sourceButtons = within(sourceRail).getAllByRole('button')
    // Index 0 is "全部来源"
    expect(within(sourceButtons[1]).getByText('最新文章')).toBeTruthy()
    expect(within(sourceButtons[2]).getByText('我们时代的神经症人格')).toBeTruthy()
    expect(within(sourceButtons[3]).getByText('旧书')).toBeTruthy()

    // Verify middle column (批注列表) in default 'updated-desc' (最近批注) is sorted newest to oldest:
    // 1. "今天刚写了评论的批注" (2026-09-09T12:00:00)
    // 2. "昨天划线" (2026-09-08T10:00:00)
    // 3. "半年前划线" (2026-03-01T10:00:00)
    // 4. "一年前划线" (2025-01-01T10:00:00)
    const listSection = screen.getByLabelText('批注列表区')
    const cards = within(listSection).getAllByRole('button', { name: /划线|批注/ })
    expect(within(cards[0]).getByText('今天刚写了评论的批注')).toBeTruthy()
    expect(within(cards[1]).getByText('昨天划线')).toBeTruthy()
    expect(within(cards[2]).getByText('半年前划线')).toBeTruthy()
    expect(within(cards[3]).getByText('一年前划线')).toBeTruthy()
  })

  it('supports sequential navigation using 上一条 and 下一条', () => {
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-1',
        annotationId: 'ann-1',
        postTitle: '文章 1',
        quote: '第一条批注',
      }),
      createAnnotationIndexItem({
        id: 'ann-2',
        annotationId: 'ann-2',
        postTitle: '文章 2',
        quote: '第二条批注',
      }),
      createAnnotationIndexItem({
        id: 'ann-3',
        annotationId: 'ann-3',
        postTitle: '文章 3',
        quote: '第三条批注',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    expect(screen.getByText('1 / 3')).toBeTruthy()
    const nextBtn = screen.getByRole('button', { name: '下一条 ›' })
    const prevBtn = screen.getByRole('button', { name: '‹ 上一条' })

    expect((prevBtn as HTMLButtonElement).disabled).toBe(true)
    expect((nextBtn as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(nextBtn)
    expect(screen.getByText('2 / 3')).toBeTruthy()
    expect((prevBtn as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(nextBtn)
    expect(screen.getByText('3 / 3')).toBeTruthy()
    expect((nextBtn as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(prevBtn)
    expect(screen.getByText('2 / 3')).toBeTruthy()
  })

  it('allows editing, canceling and saving comment in right pane', async () => {
    const onSaveComment = vi.fn().mockResolvedValue(undefined)
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-1',
        annotationId: 'ann-1',
        postTitle: '文章 1',
        quote: '测试摘录',
        note: '原评论',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
        onSaveAnnotationComment={onSaveComment}
      />,
    )

    const textarea = screen.getByPlaceholderText('写下你的想法...') as HTMLTextAreaElement
    expect(textarea.value).toBe('原评论')

    const saveBtn = screen.getByRole('button', { name: '保存评论' })
    const cancelBtn = screen.getByRole('button', { name: '取消' })
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(textarea, { target: { value: '修改后的评论' } })
    expect(textarea.value).toBe('修改后的评论')
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false)

    // Test cancel
    fireEvent.click(cancelBtn)
    expect(textarea.value).toBe('原评论')

    // Test save
    fireEvent.change(textarea, { target: { value: '新保存的评论' } })
    fireEvent.click(saveBtn)

    expect(onSaveComment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'ann-1' }),
      '新保存的评论',
    )
  })

  it('prompts user if navigating away with unsaved comment modifications', () => {
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-1',
        annotationId: 'ann-1',
        postTitle: '文章 1',
        quote: '第一条批注',
        note: '评论 1',
      }),
      createAnnotationIndexItem({
        id: 'ann-2',
        annotationId: 'ann-2',
        postTitle: '文章 2',
        quote: '第二条批注',
        note: '评论 2',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    const textarea = screen.getByPlaceholderText('写下你的想法...')
    fireEvent.change(textarea, { target: { value: '未保存的评论草稿' } })

    // Try to click second item
    const nextBtn = screen.getByRole('button', { name: '下一条 ›' })
    fireEvent.click(nextBtn)

    // Confirmation prompt should appear
    expect(screen.getByText('评论尚未保存')).toBeTruthy()
    expect(screen.getByText('切换批注将丢失当前未保存的评论修改，是否放弃修改？')).toBeTruthy()

    // Click "继续编辑"
    fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
    expect(screen.queryByText('评论尚未保存')).toBeNull()
    expect(screen.getByText('1 / 2')).toBeTruthy()

    // Click again and choose "放弃修改"
    fireEvent.click(nextBtn)
    fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
    expect(screen.queryByText('评论尚未保存')).toBeNull()
    expect(screen.getByText('2 / 2')).toBeTruthy()
  })

  it('renders context block when prefix/suffix exists and hides it when only quote is present', () => {
    const annotationsWithContext = [
      createAnnotationIndexItem({
        id: 'ann-with-context',
        annotationId: 'ann-with-context',
        postTitle: '文章 1',
        quote: '中间的高亮摘录',
        prefix: '这是前置文本，',
        suffix: '这是后置文本。',
      }),
    ]

    const { rerender } = render(
      <ReadLaterAnnotationsView
        annotations={annotationsWithContext}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    const detailPane = screen.getByLabelText('批注详情与评论')
    expect(within(detailPane).getByText('上下文')).toBeTruthy()
    expect(within(detailPane).getByText('这是前置文本，')).toBeTruthy()
    expect(within(detailPane).getAllByText('中间的高亮摘录').length).toBe(2)
    expect(within(detailPane).getByText('这是后置文本。')).toBeTruthy()

    // Now test with pure quote only (no prefix, no suffix)
    const annotationsPureQuote = [
      createAnnotationIndexItem({
        id: 'ann-pure-quote',
        annotationId: 'ann-pure-quote',
        postTitle: '文章 2',
        quote: '纯摘录内容',
        prefix: '',
        suffix: '',
      }),
    ]

    rerender(
      <ReadLaterAnnotationsView
        annotations={annotationsPureQuote}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    expect(within(detailPane).queryByText('上下文')).toBeNull()
  })

  it('renders chapterTitle in list card and detail pane header badge', () => {
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-chapter-1',
        annotationId: 'ann-chapter-1',
        postTitle: '我们时代的神经营症人格',
        chapterTitle: '第一章 神经症的文化含义',
        quote: '对文化标准的偏离。',
        prefix: '前言说，',
        suffix: '结语道。',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    // In middle list card
    const listSection = screen.getByLabelText('批注列表区')
    expect(within(listSection).getByText('我们时代的神经营症人格')).toBeTruthy()
    expect(within(listSection).getByText('第一章 神经症的文化含义')).toBeTruthy()

    // In right detail pane (only displays chapter badge, not the book title)
    const detailPane = screen.getByLabelText('批注详情与评论')
    expect(within(detailPane).getByText('第一章 神经症的文化含义')).toBeTruthy()
    expect(within(detailPane).queryByText('《我们时代的神经营症人格》')).toBeNull()

    // In context footer
    expect(within(detailPane).getByText('我们时代的神经营症人格 · 第一章 神经症的文化含义')).toBeTruthy()
  })

  it('renders WeChat Read sync button when onOpenWeReadSync is provided and highlights missing chapters', () => {
    const onOpenWeReadSync = vi.fn()
    const annotationsWithMissingChapter = [
      createAnnotationIndexItem({
        id: 'book-1::wr-1',
        sourceType: 'book',
        postTitle: '被讨厌的勇气',
        chapterTitle: null,
      }),
    ]

    const { rerender } = render(
      <ReadLaterAnnotationsView
        annotations={annotationsWithMissingChapter}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
        onOpenWeReadSync={onOpenWeReadSync}
      />,
    )

    const syncBtn = screen.getByRole('button', { name: '补全微信读书章节' })
    expect(syncBtn).toBeTruthy()
    expect(syncBtn.classList.contains('has-missing-chapters')).toBe(true)

    fireEvent.click(syncBtn)
    expect(onOpenWeReadSync).toHaveBeenCalledTimes(1)

    // When all annotations have chapter titles
    const annotationsWithChapter = [
      createAnnotationIndexItem({
        id: 'book-1::wr-1',
        sourceType: 'book',
        postTitle: '被讨厌的勇气',
        chapterTitle: '第一夜 我们的不幸是谁的错',
      }),
    ]

    rerender(
      <ReadLaterAnnotationsView
        annotations={annotationsWithChapter}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
        onOpenWeReadSync={onOpenWeReadSync}
      />,
    )

    const normalSyncBtn = screen.getByRole('button', { name: '同步微信读书' })
    expect(normalSyncBtn).toBeTruthy()
    expect(normalSyncBtn.classList.contains('has-missing-chapters')).toBe(false)
  })

  it('renders local EPUB enrich button and handles file selection', () => {
    const onEnrichFromEpub = vi.fn()
    const { container } = render(
      <ReadLaterAnnotationsView
        annotations={[]}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
        onEnrichFromEpub={onEnrichFromEpub}
      />,
    )

    const epubBtn = screen.getByRole('button', { name: '本地 EPUB 补全' })
    expect(epubBtn).toBeTruthy()

    const hiddenInput = container.querySelector('input[type="file"][accept=".epub"]') as HTMLInputElement
    expect(hiddenInput).toBeTruthy()

    const mockFile = new File(['content'], 'courage.epub', { type: 'application/epub+zip' })
    fireEvent.change(hiddenInput, { target: { files: [mockFile] } })
    expect(onEnrichFromEpub).toHaveBeenCalledWith([mockFile])
  })

  it('filters annotations by chapter and updates when chapter is selected', () => {
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-ch1',
        postPath: 'source/items/book-1.md',
        postTitle: '思考，快与慢',
        chapterTitle: '第一章 两个系统',
        quote: '系统1的运行是无意识且快速的。',
      }),
      createAnnotationIndexItem({
        id: 'ann-ch2',
        postPath: 'source/items/book-1.md',
        postTitle: '思考，快与慢',
        chapterTitle: '第二章 启发式与偏见',
        quote: '启发式是捷径，也是偏见的根源。',
      }),
      createAnnotationIndexItem({
        id: 'ann-other',
        postPath: 'source/items/other.md',
        postTitle: '另一本书',
        chapterTitle: '引言',
        quote: '阅读是一座随身携带的避难所。',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    // Chapter filter is present
    expect(screen.getByRole('button', { name: '筛选章节' })).toBeTruthy()

    // Filter by '第一章 两个系统'
    fireEvent.click(screen.getByRole('button', { name: '筛选章节' }))
    fireEvent.click(screen.getByRole('option', { name: /第一章 两个系统/ }))

    const listSection = screen.getByLabelText('批注列表区')
    expect(within(listSection).getByText('系统1的运行是无意识且快速的。')).toBeTruthy()
    expect(within(listSection).queryByText('启发式是捷径，也是偏见的根源。')).toBeNull()
    expect(within(listSection).queryByText('阅读是一座随身携带的避难所。')).toBeNull()

    // Filter by '全部章节'
    fireEvent.click(screen.getByRole('button', { name: '筛选章节' }))
    fireEvent.click(screen.getByRole('option', { name: /全部章节/ }))
    expect(within(listSection).getByText('系统1的运行是无意识且快速的。')).toBeTruthy()
    expect(within(listSection).getByText('启发式是捷径，也是偏见的根源。')).toBeTruthy()
  })

  it('supports in-place original reading in right pane without full page navigation', async () => {
    const onOpenAnnotation = vi.fn()
    const onLoadOriginalContent = vi.fn().mockResolvedValue({
      title: '思考，快与慢',
      chapterTitle: '第一章 两个系统',
      content: '人们往往低估了直觉的力量。系统1的运行是无意识且快速的，它负责对环境做出快速评估。\n\n而系统2则需要分配更多的注意力。',
      isHtml: false,
    })

    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-1',
        postPath: 'source/items/book-1.md',
        postTitle: '思考，快与慢',
        chapterTitle: '第一章 两个系统',
        quote: '系统1的运行是无意识且快速的',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={onOpenAnnotation}
        onLoadOriginalContent={onLoadOriginalContent}
      />,
    )

    // Initially in detail mode
    expect(screen.getByRole('tab', { name: '批注详情' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '原文阅读' })).toBeTruthy()

    // Click "查看原文" in detail actions
    const openOriginalBtn = screen.getByRole('button', { name: '查看原文' })
    fireEvent.click(openOriginalBtn)

    // Does NOT call onOpenAnnotation (which would have navigated the full page away!)
    expect(onOpenAnnotation).not.toHaveBeenCalled()

    // Right pane is now in original reading mode
    expect(screen.getByRole('tab', { name: '原文阅读' }).getAttribute('aria-selected')).toBe('true')
    expect(onLoadOriginalContent).toHaveBeenCalledWith(annotations[0])

    // Wait for content to render
    expect(await screen.findByLabelText('当前批注高亮：系统1的运行是无意识且快速的')).toBeTruthy()
    expect(document.querySelector('.annotation-dashboard__original-chapter-badge')?.textContent).toBe('第一章 两个系统')

    // Clicking "全屏" calls onOpenAnnotation for users who explicitly want full-screen reader
    const fullscreenBtn = screen.getByRole('button', { name: /全屏/ })
    fireEvent.click(fullscreenBtn)
    expect(onOpenAnnotation).toHaveBeenCalledWith(annotations[0])
  })

  it('selecting annotation in middle column always defaults to detail mode even if previously in original mode', async () => {
    const onLoadOriginalContent = vi.fn().mockResolvedValue({
      title: '默认文章',
      content: '前面段落。\n\n时间是一个最奇妙的作者，它会在不知不觉中写下所有答案。\n\n后面段落。',
      isHtml: false,
    })

    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-1',
        quote: '第一条摘录',
        note: '这是第一条评论',
      }),
      createAnnotationIndexItem({
        id: 'ann-2',
        quote: '时间是一个最奇妙的作者',
        note: '这是第二条评论',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
        onLoadOriginalContent={onLoadOriginalContent}
      />,
    )

    // Initially, right pane should default to "批注详情"
    expect(screen.getByRole('tab', { name: '批注详情' }).getAttribute('aria-selected')).toBe('true')

    // User explicitly switches to "原文阅读"
    fireEvent.click(screen.getByRole('tab', { name: '原文阅读' }))
    expect(screen.getByRole('tab', { name: '原文阅读' }).getAttribute('aria-selected')).toBe('true')
    expect(onLoadOriginalContent).toHaveBeenCalledWith(annotations[0])

    // Now user clicks on the second annotation card (via its quote text or container)
    const secondQuote = screen.getByText('时间是一个最奇妙的作者')
    fireEvent.click(secondQuote)

    // Right pane MUST reset/default back to "批注详情", NOT remain in original mode
    expect(screen.getByRole('tab', { name: '批注详情' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tab', { name: '原文阅读' }).getAttribute('aria-selected')).toBe('false')

    // And second annotation's note draft should be shown in the comment area
    expect(screen.getByDisplayValue('这是第二条评论')).toBeTruthy()
  })

  it('supports hierarchical chapter grouping and filtering (major chapters and sub-chapters)', () => {
    const annotations = [
      createAnnotationIndexItem({
        id: 'ann-1',
        parentChapterTitle: '第5章 沟通',
        chapterTitle: '言语沟通',
        quote: '言语沟通的第一条摘录',
      }),
      createAnnotationIndexItem({
        id: 'ann-2',
        parentChapterTitle: '第5章 沟通',
        chapterTitle: '言语沟通',
        quote: '言语沟通的第二条摘录',
      }),
      createAnnotationIndexItem({
        id: 'ann-3',
        parentChapterTitle: '第5章 沟通',
        chapterTitle: '沟通障碍及其应对',
        quote: '沟通障碍的摘录',
      }),
      createAnnotationIndexItem({
        id: 'ann-4',
        parentChapterTitle: '第6章 相互依赖',
        chapterTitle: '社会交换',
        quote: '社会交换理论的摘录',
      }),
    ]

    render(
      <ReadLaterAnnotationsView
        annotations={annotations}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    // Check card display has "第5章 沟通 · 言语沟通"
    expect(screen.getAllByText(/第5章 沟通 · 言语沟通/).length).toBeGreaterThan(0)

    // Open chapter dropdown
    const chapterTrigger = screen.getByRole('button', { name: /章节/i })
    fireEvent.click(chapterTrigger)

    // Options should include parent chapter and sub-chapters with counts
    expect(screen.getByRole('option', { name: /全部章节 \(4\)/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /第5章 沟通 \(3\)/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /言语沟通 \(2\)/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /沟通障碍及其应对 \(1\)/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /第6章 相互依赖 \(1\)/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /社会交换 \(1\)/ })).toBeTruthy()

    // Select parent chapter (第5章 沟通)
    fireEvent.click(screen.getByRole('option', { name: /第5章 沟通 \(3\)/ }))

    const listSection = screen.getByLabelText('批注列表区')
    // Should show all 3 annotations belonging to chapter 5
    expect(within(listSection).getByText('言语沟通的第一条摘录')).toBeTruthy()
    expect(within(listSection).getByText('言语沟通的第二条摘录')).toBeTruthy()
    expect(within(listSection).getByText('沟通障碍的摘录')).toBeTruthy()
    expect(within(listSection).queryByText('社会交换理论的摘录')).toBeNull()

    // Now select sub-chapter (沟通障碍及其应对)
    fireEvent.click(chapterTrigger)
    fireEvent.click(screen.getByRole('option', { name: /沟通障碍及其应对 \(1\)/ }))

    // Should only show 1 annotation
    expect(within(listSection).queryByText('言语沟通的第一条摘录')).toBeNull()
    expect(within(listSection).getByText('沟通障碍的摘录')).toBeTruthy()
  })
})

