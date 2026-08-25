import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BookShelfView from './book-shelf-view'
import type { StoredBookMeta } from './book-types'

describe('BookShelfView', () => {
  afterEach(() => {
    cleanup()
  })

  const mockBook: StoredBookMeta = {
    id: 'book-1',
    title: '设计模式简明教程',
    creator: 'GoF',
    format: 'epub',
    coverBlob: null,
    coverSeed: 42,
    addedAt: '2026-08-01T00:00:00.000Z',
    lastOpenedAt: '2026-08-25T10:00:00.000Z',
    progressFraction: 0.35,
    progressCfi: null,
  }

  it('renders sync button and triggers onSyncBooks', () => {
    const handleSync = vi.fn()
    render(
      <BookShelfView
        books={[]}
        annotationCounts={{}}
        isLoading={false}
        isImporting={false}
        isSyncing={false}
        search=""
        deletingBookId={null}
        onImportFile={vi.fn()}
        onOpenBook={vi.fn()}
        onDeleteBook={vi.fn()}
        onSyncBooks={handleSync}
      />,
    )

    const syncBtn = screen.getByRole('button', { name: '云端同步' })
    expect(syncBtn).toBeTruthy()
    fireEvent.click(syncBtn)
    expect(handleSync).toHaveBeenCalledTimes(1)
  })

  it('shows missing file badge and triggers relink when local file is missing', () => {
    const handleOpen = vi.fn()
    const handleRelink = vi.fn()

    render(
      <BookShelfView
        books={[mockBook]}
        annotationCounts={{ 'book-1': 5 }}
        isLoading={false}
        isImporting={false}
        isSyncing={false}
        search=""
        deletingBookId={null}
        localFilesStatus={{ 'book-1': false }}
        onImportFile={vi.fn()}
        onRelinkFile={handleRelink}
        onOpenBook={handleOpen}
        onDeleteBook={vi.fn()}
        onSyncBooks={vi.fn()}
      />,
    )

    expect(screen.getByText('需载入文件')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()

    const trigger = screen.getByRole('button', { name: /关联《设计模式简明教程》/i })
    fireEvent.click(trigger)

    // handleOpen should not be called because local file is missing
    expect(handleOpen).not.toHaveBeenCalled()
  })

  it('opens book directly when local file is available', () => {
    const handleOpen = vi.fn()

    render(
      <BookShelfView
        books={[mockBook]}
        annotationCounts={{ 'book-1': 2 }}
        isLoading={false}
        isImporting={false}
        isSyncing={false}
        search=""
        deletingBookId={null}
        localFilesStatus={{ 'book-1': true }}
        onImportFile={vi.fn()}
        onOpenBook={handleOpen}
        onDeleteBook={vi.fn()}
        onSyncBooks={vi.fn()}
      />,
    )

    expect(screen.queryByText('需载入文件')).toBeNull()

    const trigger = screen.getByRole('button', { name: /打开《设计模式简明教程》/i })
    fireEvent.click(trigger)

    expect(handleOpen).toHaveBeenCalledWith(mockBook)
  })

  it('supports batch management mode and multi-select delete', () => {
    const handleDeleteMultiple = vi.fn()
    const mockBook2: StoredBookMeta = {
      ...mockBook,
      id: 'book-2',
      title: '重构',
    }

    render(
      <BookShelfView
        books={[mockBook, mockBook2]}
        annotationCounts={{}}
        isLoading={false}
        isImporting={false}
        isSyncing={false}
        search=""
        deletingBookId={null}
        onImportFile={vi.fn()}
        onOpenBook={vi.fn()}
        onDeleteBook={vi.fn()}
        onDeleteMultipleBooks={handleDeleteMultiple}
      />,
    )

    // Enter batch mode
    fireEvent.click(screen.getByRole('button', { name: '批量管理' }))

    expect(screen.getByText('退出管理')).toBeTruthy()
    expect(screen.getByText(/全选 \(已选 0\/2 本\)/)).toBeTruthy()

    // Select book-1
    const book1Trigger = screen.getByRole('button', { name: /选择《设计模式简明教程》/i })
    fireEvent.click(book1Trigger)

    expect(screen.getByText(/全选 \(已选 1\/2 本\)/)).toBeTruthy()
    const deleteBtn = screen.getByRole('button', { name: /批量删除 \(1\)/i })
    expect(deleteBtn).toBeTruthy()

    fireEvent.click(deleteBtn)
    expect(handleDeleteMultiple).toHaveBeenCalledWith([mockBook])
  })
})
