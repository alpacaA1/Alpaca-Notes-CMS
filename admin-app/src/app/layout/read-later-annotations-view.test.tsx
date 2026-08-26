import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReadLaterAnnotationIndexItem } from '../read-later/annotation-index'
import ReadLaterAnnotationsView from './read-later-annotations-view'

function createAnnotationIndexItem(overrides: Partial<ReadLaterAnnotationIndexItem> = {}): ReadLaterAnnotationIndexItem {
  return {
    id: overrides.id || 'annotation-id',
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
})

