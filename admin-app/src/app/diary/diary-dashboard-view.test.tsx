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

  it('groups consecutive read-later quotes under one timeline heading', () => {
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
    expect(screen.getAllByText('来源: 《同一本书》')).toHaveLength(3)
  })

  it('triggers onNewPostForDate when clicking an empty calendar cell', () => {
    const handleNewForDate = vi.fn()

    render(
      <DiaryDashboardView
        posts={mockDiaryPosts}
        search=""
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={vi.fn()}
        onNewPostForDate={handleNewForDate}
      />,
    )

    const emptyCell = screen.getByRole('button', { name: /2026-08-10 无记录/i })
    fireEvent.click(emptyCell)

    expect(handleNewForDate).toHaveBeenCalledWith('2026-08-10')
  })

  it('offers deletion from a recorded calendar date', () => {
    const handleDelete = vi.fn()

    render(
      <DiaryDashboardView
        posts={mockDiaryPosts}
        search=""
        onOpenPost={vi.fn()}
        onNewPost={vi.fn()}
        onDeletePost={handleDelete}
      />,
    )

    fireEvent.click(screen.getByLabelText('日记 2026-08-25 的更多操作'))
    fireEvent.click(screen.getByRole('button', { name: '删除日记' }))

    expect(handleDelete).toHaveBeenCalledWith(mockDiaryPosts[0])
  })

  it('expands every diary by default in timeline mode', () => {
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

    expect(screen.getAllByRole('button', { name: '查看完整日记 →' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: '查看详情 →' })).toBeNull()
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

    const tagFilterBtn = screen.getByRole('button', { name: /全部标签/i })
    fireEvent.click(tagFilterBtn)

    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByRole('button', { name: '生活' })).toBeTruthy()

    // Click outside
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('menu')).toBeNull()

    // Reopen and test Escape
    fireEvent.click(tagFilterBtn)
    expect(screen.getByRole('menu')).toBeTruthy()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
