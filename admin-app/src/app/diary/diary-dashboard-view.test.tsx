import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DiaryDashboardView from './diary-dashboard-view'
import type { PostIndexItem } from '../posts/post-types'

const mockDiaryPosts: PostIndexItem[] = [
  {
    path: 'source/diary/20260825080000.md',
    sha: 'sha-1',
    title: '2026-08-25-星期二',
    date: '2026-08-25 08:00:00',
    desc: `
<!-- alpaca:self-observation id="so_1" kind="emotion" version="1" -->
### 🔖 13:43 · 情绪签到
> 💭 **我现在**：期待、平静
> 📝 **发生了什么**：发现了小汤的钢琴教材
<!-- /alpaca:self-observation -->
`,
    published: false,
    hasExplicitPublished: false,
    categories: [],
    tags: ['工作', '生活'],
    permalink: null,
    cover: null,
  },
]

describe('DiaryDashboardView', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('defaults to lock (calendar) mode with zero sensitive snippets in DOM', () => {
    render(
      <DiaryDashboardView
        posts={mockDiaryPosts}
        search=""
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
      />,
    )

    // Calendar grid is present
    expect(screen.getByLabelText('日记月历视图')).toBeTruthy()

    // Date numbers & word counts are present
    expect(screen.getByText('25')).toBeTruthy()

    // Crucial Privacy Check: NO emotion text or private body snippets in DOM
    expect(screen.queryByText('发现了小汤的钢琴教材')).toBeNull()
    expect(screen.queryByText('期待')).toBeNull()
  })

  it('switches to timeline (eye) mode and unmounts on lock toggle', () => {
    render(
      <DiaryDashboardView
        posts={mockDiaryPosts}
        search=""
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
      />,
    )

    // Switch to Eye (timeline) mode
    const eyeBtn = screen.getByRole('tab', { name: /时间线模式/i })
    fireEvent.click(eyeBtn)

    expect(screen.getByLabelText('日记时间线预览')).toBeTruthy()
    expect(screen.getByText('发现了小汤的钢琴教材')).toBeTruthy()
    expect(screen.getByText('期待')).toBeTruthy()

    // Switch back to Lock mode
    const lockBtn = screen.getByRole('tab', { name: /月历模式/i })
    fireEvent.click(lockBtn)

    // Verify complete removal from DOM
    expect(screen.queryByText('发现了小汤的钢琴教材')).toBeNull()
  })

  it('groups consecutive read-later quotes under one timeline heading and renders source header', () => {
    const postWithBatchQuotes: PostIndexItem = {
      ...mockDiaryPosts[0],
      body: `
## 待读摘录

> 摘录一

来源：《同一本书》

---

> 摘录二

来源：《同一本书》

---

> 摘录三

来源：《同一本书》
`,
    }

    render(
      <DiaryDashboardView
        posts={[postWithBatchQuotes]}
        search=""
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /时间线模式/i }))

    expect(screen.getAllByText('待读摘录')).toHaveLength(1)
    expect(screen.getByText('《同一本书》 · 3 条')).toBeTruthy()
    expect(screen.getByText('摘录一')).toBeTruthy()
    expect(screen.getByText('摘录二')).toBeTruthy()
    expect(screen.getByText('摘录三')).toBeTruthy()
  })

  it('handles multi-source quote allocation limits and expands on click', () => {
    const postWithManyQuotes: PostIndexItem = {
      ...mockDiaryPosts[0],
      body: `
## 待读摘录

> 来源1摘录1

> 来源1摘录2

> 来源1摘录3

来源：《来源书1》

---

> 来源2摘录1

> 来源2摘录2

> 来源2摘录3

来源：《来源书2》
`,
    }

    render(
      <DiaryDashboardView
        posts={[postWithManyQuotes]}
        search=""
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /时间线模式/i }))

    // 2 sources -> 2 quotes each (4 visible out of 6 total -> 2 hidden)
    expect(screen.getByText('还有 2 条摘录 · 展开全部')).toBeTruthy()

    // Click "还有 2 条摘录 · 展开全部"
    fireEvent.click(screen.getByText('还有 2 条摘录 · 展开全部'))

    // All quotes now visible
    expect(screen.getByText('来源1摘录3')).toBeTruthy()
    expect(screen.getByText('来源2摘录3')).toBeTruthy()
    expect(screen.getByText('收起摘录')).toBeTruthy()
  })

  it('expands every diary summary by default and supports 折叠摘要 and 展开摘要', () => {
    const nextDay = {
      ...mockDiaryPosts[0],
      path: 'source/diary/20260824080000.md',
      sha: 'sha-2',
      title: '2026-08-24-星期一',
      date: '2026-08-24 08:00:00',
    }

    render(
      <DiaryDashboardView
        posts={[mockDiaryPosts[0], nextDay]}
        search=""
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /时间线模式/i }))

    expect(screen.getAllByRole('button', { name: '打开日记 →' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: '展开摘要' })).toBeNull()

    // Click 折叠摘要 on first card
    const collapseBtns = screen.getAllByRole('button', { name: '折叠摘要' })
    fireEvent.click(collapseBtns[0])

    // First card is now collapsed, showing 展开摘要
    expect(screen.getByRole('button', { name: '展开摘要' })).toBeTruthy()

    // Clicking 展开摘要 re-opens the summary
    fireEvent.click(screen.getByRole('button', { name: '展开摘要' }))
    expect(screen.queryByRole('button', { name: '展开摘要' })).toBeNull()
  })

  it('closes tag filter dropdown on click outside or Escape key', () => {
    render(
      <DiaryDashboardView
        posts={mockDiaryPosts}
        search=""
        availableTags={['生活', '工作']}
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
      />,
    )

    const tagFilterBtn = screen.getByRole('button', { name: '标签筛选' })
    fireEvent.click(tagFilterBtn)

    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getByRole('option', { name: '生活' })).toBeTruthy()

    // Click outside
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).toBeNull()

    // Reopen and test Escape
    fireEvent.click(tagFilterBtn)
    expect(screen.getByRole('listbox')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
