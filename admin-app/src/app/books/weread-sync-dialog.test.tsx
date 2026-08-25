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
    expect(screen.getByRole('button', { name: '保存并立即同步' })).toBeTruthy()
  })

  it('renders masked key when key is already stored and allows editing', () => {
    localStorage.setItem('alpaca-admin:weread-api-key', 'wrk-1234567890abcdef')

    render(<WeReadSyncDialog isOpen={true} onClose={vi.fn()} />)

    expect(screen.getByText('wrk-******cdef')).toBeTruthy()
    expect(screen.getByRole('button', { name: '立即同步' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '修改密钥' }))
    expect(screen.getByPlaceholderText(/例如 wrk-/i)).toBeTruthy()
  })

  it('triggers sync on click and displays progress and success', async () => {
    const syncSpy = vi.spyOn(wereadClient, 'syncAllWeReadNotebooks').mockImplementation(
      async (_key, onProgress) => {
        onProgress?.('正在同步《测试书》…', 1, 1)
        return { booksCount: 2, annotationsCount: 15 }
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

    const input = screen.getByPlaceholderText(/例如 wrk-/i)
    fireEvent.change(input, { target: { value: 'wrk-my-new-key' } })

    const syncBtn = screen.getByRole('button', { name: '保存并立即同步' })
    fireEvent.click(syncBtn)

    await waitFor(() => {
      expect(screen.getByText(/已成功同步 2 本书、共 15 条划线与想法！/)).toBeTruthy()
    })

    expect(syncSpy).toHaveBeenCalledWith('wrk-my-new-key', expect.any(Function))
    expect(handleComplete).toHaveBeenCalledTimes(1)
  })
})
