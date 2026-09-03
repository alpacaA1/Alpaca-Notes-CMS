import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import PrivateAuthDialog from './private-auth-dialog'
import * as privateAuthModule from '../auth/private-auth'

describe('PrivateAuthDialog', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders minimal dialog without eyebrow or long description', () => {
    vi.spyOn(privateAuthModule, 'hasPrivatePassword').mockReturnValue(true)

    render(
      <PrivateAuthDialog
        isOpen={true}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('输入访问密码')).toBeTruthy()
    expect(screen.getByPlaceholderText('输入密码')).toBeTruthy()
    expect(screen.getByRole('button', { name: '取消' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认' })).toBeTruthy()

    // 确认已删除冗余文本
    expect(screen.queryByText('私密空间')).toBeNull()
    expect(screen.queryByText(/此区域存放未公开/)).toBeNull()
  })

  it('calls onSuccess when password verification succeeds', async () => {
    vi.spyOn(privateAuthModule, 'hasPrivatePassword').mockReturnValue(true)
    vi.spyOn(privateAuthModule, 'verifyPrivatePassword').mockResolvedValue(true)
    const onSuccess = vi.fn()

    render(
      <PrivateAuthDialog
        isOpen={true}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />,
    )

    const input = screen.getByPlaceholderText('输入密码')
    fireEvent.change(input, { target: { value: 'mysecret' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })
  })

  it('shows error when password verification fails', async () => {
    vi.spyOn(privateAuthModule, 'hasPrivatePassword').mockReturnValue(true)
    vi.spyOn(privateAuthModule, 'verifyPrivatePassword').mockResolvedValue(false)
    const onSuccess = vi.fn()

    render(
      <PrivateAuthDialog
        isOpen={true}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />,
    )

    const input = screen.getByPlaceholderText('输入密码')
    fireEvent.change(input, { target: { value: 'wrongpassword' } })
    fireEvent.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => {
      expect(screen.getByText('密码错误，请重试')).toBeTruthy()
      expect(onSuccess).not.toHaveBeenCalled()
    })
  })

  it('calls onCancel when clicking cancel', () => {
    const onCancel = vi.fn()

    render(
      <PrivateAuthDialog
        isOpen={true}
        onSuccess={vi.fn()}
        onCancel={onCancel}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalled()
  })
})
