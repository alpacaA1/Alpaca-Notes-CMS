import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ReadLaterAnnotationIndexItem } from '../read-later/annotation-index'
import ReadLaterAnnotationsView from './read-later-annotations-view'

const appStyles = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8')

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
    note: overrides.note || '默认评论',
    createdAt: overrides.createdAt || '2026-05-01T10:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-05-01T10:00:00.000Z',
    searchText: overrides.searchText || '默认文章 默认摘录 默认评论',
  }
}

describe('ReadLaterAnnotationsView', () => {
  it('allows vertical scroll chaining from the annotations list shell', () => {
    expect(appStyles).toMatch(/\.annotation-dashboard__list-shell\s*\{[^}]*overscroll-behavior-x:\s*contain;[^}]*overscroll-behavior-y:\s*auto;/s)
    expect(appStyles).not.toMatch(/\.annotation-dashboard__list-shell\s*\{[^}]*overscroll-behavior:\s*contain;/s)
  })

  it('keeps vertical mouse wheel scrolling available on the annotations list shell', () => {
    render(
      <ReadLaterAnnotationsView
        annotations={[
          createAnnotationIndexItem({
            id: 'annotation-1',
            annotationId: 'annotation-1',
            postPath: 'source/read-later-items/item-1.md',
            postTitle: '文章 1',
            quote: '摘录 1',
            note: '评论 1',
            searchText: '文章 1 摘录 1 评论 1',
          }),
        ]}
        isLoading={false}
        search=""
        onOpenAnnotation={vi.fn()}
      />,
    )

    const listShell = screen.getByLabelText('批注列表区') as HTMLDivElement
    let scrollLeftValue = 0

    Object.defineProperty(listShell, 'scrollWidth', {
      configurable: true,
      value: 1600,
    })
    Object.defineProperty(listShell, 'clientWidth', {
      configurable: true,
      value: 800,
    })
    Object.defineProperty(listShell, 'scrollLeft', {
      configurable: true,
      get: () => scrollLeftValue,
      set: (value: number) => {
        scrollLeftValue = value
      },
    })

    const wheelEvent = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 120,
    })

    const dispatchResult = listShell.dispatchEvent(wheelEvent)

    expect(dispatchResult).toBe(true)
    expect(wheelEvent.defaultPrevented).toBe(false)
    expect(scrollLeftValue).toBe(0)
  })
})
