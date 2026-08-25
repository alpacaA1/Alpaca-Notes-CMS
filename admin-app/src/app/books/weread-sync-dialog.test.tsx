import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WeReadSyncDialog from './weread-sync-dialog'
import * as wereadClient from './weread-client'

describe('WeReadSyncDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders input for API key when no key is stored', () => {
    render(<WeReadSyncDialog isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByText('同步微信读书划线与想法')).toBeTruthy()
    expect(screen.getByPlaceholderText(/例如 wrk-/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: '获取书单' })).toBeTruthy()
  })

  it('renders masked key and loads notebook list when key is already stored', async () => {
    localStorage.setItem('alpaca-admin:weread-api-key', 'wrk-1234567890abcdef')

    vi.spyOn(wereadClient, 'fetchWeReadNotebooks').mockResolvedValue([
      {
        bookId: 'b1',
        book: { title: '重构', author: 'Martin Fowler' },
        bookmarkCount: 10,
        thoughtCount: 2,
      },
      {
        bookId: 'b2',
        book: { title: '纳瓦尔宝典', author: '埃里克' },
        bookmarkCount: 20,
        thoughtCount: 5,
      },
    ])

    render(<WeReadSyncDialog isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByText('wrk-******cdef')).toBeTruthy()

    await waitFor(() => {
      expect(screen.getByText('重构')).toBeTruthy()
      expect(screen.getByText('纳瓦尔宝典')).toBeTruthy()
      expect(screen.getByText(/全选 \(2\/2 本\)/)).toBeTruthy()
    })
  })

  it('allows selecting books and triggering sync', async () => {
    localStorage.setItem('alpaca-admin:weread-api-key', 'wrk-1234567890abcdef')

    vi.spyOn(wereadClient, 'fetchWeReadNotebooks').mockResolvedValue([
      {
        bookId: 'b1',
        book: { title: '重构', author: 'Martin Fowler' },
        bookmarkCount: 10,
        thoughtCount: 2,
      },
      {
        bookId: 'b2',
        book: { title: '纳瓦尔宝典', author: '埃里克' },
        bookmarkCount: 20,
        thoughtCount: 5,
      },
    ])

    const syncSpy = vi.spyOn(wereadClient, 'syncSelectedWeReadNotebooks').mockImplementation(
      async (_key, selected, onProgress) => {
        onProgress?.('正在同步《重构》…', 1, selected.length)
        return { booksCount: selected.length, annotationsCount: 12 }
      },
    )

    const handleComplete = vi.fn()

    render(
      <WeReadSyncDialog
        isOpen={true}
        onClose={vi.fn()}
        onSyncComplete={handleComplete}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('重构')).toBeTruthy()
    })

    // Deselect one book
    fireEvent.click(screen.getByText('纳瓦尔宝典'))

    const syncBtn = screen.getByRole('button', { name: '同步所选 (1 本)' })
    fireEvent.click(syncBtn)

    await waitFor(() => {
      expect(screen.getByText(/已成功同步 1 本书、共 12 条划线与想法！/)).toBeTruthy()
    })

    expect(syncSpy).toHaveBeenCalledWith(
      'wrk-1234567890abcdef',
      [expect.objectContaining({ bookId: 'b1' })],
      expect.any(Function),
    )
    expect(handleComplete).toHaveBeenCalledTimes(1)
  })
})

