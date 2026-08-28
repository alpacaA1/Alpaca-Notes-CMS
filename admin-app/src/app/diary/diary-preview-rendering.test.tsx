import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DiaryTimelinePreview, { computeTimelineQuoteDisplay } from './diary-timeline-preview'
import PreviewPane from '../editor/preview-pane'
import type { DiaryReadLaterSourceGroup } from './diary-view-types'
import type { PostIndexItem } from '../posts/post-types'

describe('diary-preview-rendering', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  describe('computeTimelineQuoteDisplay', () => {
    it('allocates max 4 items for 1 source', () => {
      const groups: DiaryReadLaterSourceGroup[] = [
        {
          sourceTitle: '书A',
          items: [
            { id: '1', quote: 'q1', sourceTitle: '书A', order: 1 },
            { id: '2', quote: 'q2', sourceTitle: '书A', order: 2 },
            { id: '3', quote: 'q3', sourceTitle: '书A', order: 3 },
            { id: '4', quote: 'q4', sourceTitle: '书A', order: 4 },
            { id: '5', quote: 'q5', sourceTitle: '书A', order: 5 },
          ],
        },
      ]

      const collapsed = computeTimelineQuoteDisplay(groups, false)
      expect(collapsed.displayGroups).toHaveLength(1)
      expect(collapsed.displayGroups[0].items).toHaveLength(4)
      expect(collapsed.hiddenQuotesCount).toBe(1)

      const expanded = computeTimelineQuoteDisplay(groups, true)
      expect(expanded.displayGroups[0].items).toHaveLength(5)
      expect(expanded.hiddenQuotesCount).toBe(0)
    })

    it('allocates max 2 items per source for 2 sources', () => {
      const groups: DiaryReadLaterSourceGroup[] = [
        {
          sourceTitle: '书A',
          items: [
            { id: '1', quote: 'a1', sourceTitle: '书A', order: 1 },
            { id: '2', quote: 'a2', sourceTitle: '书A', order: 2 },
            { id: '3', quote: 'a3', sourceTitle: '书A', order: 3 },
          ],
        },
        {
          sourceTitle: '书B',
          items: [
            { id: '4', quote: 'b1', sourceTitle: '书B', order: 4 },
            { id: '5', quote: 'b2', sourceTitle: '书B', order: 5 },
            { id: '6', quote: 'b3', sourceTitle: '书B', order: 6 },
          ],
        },
      ]

      const result = computeTimelineQuoteDisplay(groups, false)
      expect(result.displayGroups).toHaveLength(2)
      expect(result.displayGroups[0].items).toHaveLength(2)
      expect(result.displayGroups[1].items).toHaveLength(2)
      expect(result.hiddenQuotesCount).toBe(2)
    })

    it('allocates 1 item per source for 3 to 4 sources', () => {
      const groups: DiaryReadLaterSourceGroup[] = [
        {
          sourceTitle: '书A',
          items: [
            { id: '1', quote: 'a1', sourceTitle: '书A', order: 1 },
            { id: '2', quote: 'a2', sourceTitle: '书A', order: 2 },
          ],
        },
        {
          sourceTitle: '书B',
          items: [
            { id: '3', quote: 'b1', sourceTitle: '书B', order: 3 },
            { id: '4', quote: 'b2', sourceTitle: '书B', order: 4 },
          ],
        },
        {
          sourceTitle: '书C',
          items: [
            { id: '5', quote: 'c1', sourceTitle: '书C', order: 5 },
            { id: '6', quote: 'c2', sourceTitle: '书C', order: 6 },
          ],
        },
      ]

      const result = computeTimelineQuoteDisplay(groups, false)
      expect(result.displayGroups).toHaveLength(3)
      expect(result.displayGroups[0].items).toHaveLength(1)
      expect(result.displayGroups[1].items).toHaveLength(1)
      expect(result.displayGroups[2].items).toHaveLength(1)
      expect(result.hiddenQuotesCount).toBe(3)
    })

    it('limits to first 4 sources (1 each) when exceeding 4 sources', () => {
      const groups: DiaryReadLaterSourceGroup[] = [
        { sourceTitle: '书1', items: [{ id: '1', quote: 'q1', sourceTitle: '书1', order: 1 }] },
        { sourceTitle: '书2', items: [{ id: '2', quote: 'q2', sourceTitle: '书2', order: 2 }] },
        { sourceTitle: '书3', items: [{ id: '3', quote: 'q3', sourceTitle: '书3', order: 3 }] },
        { sourceTitle: '书4', items: [{ id: '4', quote: 'q4', sourceTitle: '书4', order: 4 }] },
        { sourceTitle: '书5', items: [{ id: '5', quote: 'q5', sourceTitle: '书5', order: 5 }] },
      ]

      const result = computeTimelineQuoteDisplay(groups, false)
      expect(result.displayGroups).toHaveLength(4)
      expect(result.hiddenQuotesCount).toBe(1)
    })
  })

  describe('Single Diary PreviewPane rendering', () => {
    it('renders diary read-later quotes in borderless whitespace layout with group headers and no truncation', () => {
      const markdown = `
# 2026-08-28-星期五

今天复盘了待读摘录。

## 待读摘录

> 在我们的文化中，逃避焦虑有四种主要的方法：把焦虑合理化；否认焦虑；麻痹焦虑；避免一切可能导致焦虑的思想、情感、冲动以及情境。

> 换句话说，如果一种抑制强大到足以阻碍我们的愿望与冲动，那我们也就根本不可能意识到这种抑制的存在。

> 在认为谦虚是一种美德的教条基础之上，我们很容易形成一种不敢有所要求的抑制。

来源：《我们时代的神经症人格》

---

> 童年不再是线下的探索与冒险，而是被安排得密不透风的竞赛。

> 社交媒体让孩子们生活在一个永不打烊的自我比较市场。

来源：《焦虑的一代》
`
      const { container } = render(
        <PreviewPane
          title="2026-08-28-星期五"
          date="2026-08-28 08:00:00"
          markdown={markdown}
          contentType="diary"
        />,
      )

      expect(screen.getByText('《我们时代的神经症人格》 · 3 条')).toBeTruthy()
      expect(screen.getByText('《焦虑的一代》 · 2 条')).toBeTruthy()

      // All 5 quotes rendered as independent paragraphs in the DOM
      expect(screen.getByText(/逃避焦虑有四种主要的方法/)).toBeTruthy()
      expect(screen.getByText(/如果一种抑制强大到足以/)).toBeTruthy()
      expect(screen.getByText(/在认为谦虚是一种美德的教条基础之上/)).toBeTruthy()
      expect(screen.getByText(/童年不再是线下的探索与冒险/)).toBeTruthy()
      expect(screen.getByText(/社交媒体让孩子们生活在一个永不打烊/)).toBeTruthy()

      // Verify the reader quotes wrapper class
      expect(container.querySelector('.diary-reader-quotes')).toBeTruthy()
      expect(container.querySelectorAll('.diary-reader-quotes__group')).toHaveLength(2)
      expect(container.querySelectorAll('.diary-reader-quotes__item')).toHaveLength(5)
    })
  })

  describe('Diary text highlighting in single preview', () => {
    it('supports selecting text and applying markdown highlight ==quote==', async () => {
      const handleUpdateMarkdown = vi.fn()
      const markdown = '今天完成了一个核心功能的开发。'

      render(
        <PreviewPane
          title="2026-08-28-星期五"
          date="2026-08-28 08:00:00"
          markdown={markdown}
          contentType="diary"
          onUpdateMarkdown={handleUpdateMarkdown}
        />,
      )

      const p = screen.getByText('今天完成了一个核心功能的开发。')
      const textNode = p.firstChild as Text

      const rangeMock = {
        collapsed: false,
        commonAncestorContainer: p,
        startContainer: textNode,
        startOffset: 6,
        endContainer: textNode,
        endOffset: 10,
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
        toString: () => '核心功能',
        getRangeAt: (_index = 0) => rangeMock,
        removeAllRanges: vi.fn(),
      }

      vi.spyOn(window, 'getSelection').mockReturnValue(selectionMock as unknown as Selection)
      vi.spyOn(document, 'getSelection').mockReturnValue(selectionMock as unknown as Selection)
      if (document.defaultView) {
        vi.spyOn(document.defaultView, 'getSelection').mockReturnValue(selectionMock as unknown as Selection)
      }

      const article = p.closest('article')!
      fireEvent.mouseUp(article)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '高亮' })).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: '高亮' }))

      expect(handleUpdateMarkdown).toHaveBeenCalledWith('今天完成了一个==核心功能==的开发。')
    })

    it('supports cancelling highlight on click of an existing mark', async () => {
      const handleUpdateMarkdown = vi.fn()
      const markdown = '今天完成了一个==核心功能==的开发。'

      render(
        <PreviewPane
          title="2026-08-28-星期五"
          date="2026-08-28 08:00:00"
          markdown={markdown}
          contentType="diary"
          onUpdateMarkdown={handleUpdateMarkdown}
        />,
      )

      const mark = screen.getByText('核心功能')
      expect(mark.tagName.toLowerCase()).toBe('mark')

      // Click on the highlighted mark
      fireEvent.click(mark)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '取消高亮' })).toBeTruthy()
      })

      fireEvent.click(screen.getByRole('button', { name: '取消高亮' }))

      expect(handleUpdateMarkdown).toHaveBeenCalledWith('今天完成了一个核心功能的开发。')
    })
  })

  describe('Diary timeline list preview highlight restriction', () => {
    it('renders existing ==highlight== in timeline list as mark without floating toolbar', () => {
      const diaryPost: PostIndexItem = {
        path: 'source/diary/20260828080000.md',
        sha: 'sha-1',
        title: '2026-08-28-星期五',
        date: '2026-08-28 08:00:00',
        desc: '今天完成了一个==核心功能==的开发。',
        published: false,
        hasExplicitPublished: true,
        categories: [],
        tags: [],
        permalink: null,
        cover: null,
        body: '今天完成了一个==核心功能==的开发。',
      }

      render(
        <DiaryTimelinePreview
          posts={[diaryPost]}
          onOpenPost={vi.fn()}
          onDeletePost={vi.fn()}
        />,
      )

      const mark = screen.getByText('核心功能')
      expect(mark.tagName.toLowerCase()).toBe('mark')
      expect(screen.queryByRole('toolbar', { name: '文本批注工具栏' })).toBeNull()
    })
  })
})
