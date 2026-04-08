import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as postsModule from './posts/index-posts'
import * as sessionModule from './session'

describe('App auth flow', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  it('renders the login gate when unauthenticated', () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue(null)

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Alpaca Notes Admin' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
  })

  it('hydrates an existing session', () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue([])

    render(<App />)

    expect(screen.getByRole('heading', { name: '内容编辑台' })).toBeTruthy()
    expect(screen.getByText('请选择一篇文章开始编辑，或新建一篇草稿。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '退出登录' })).toBeTruthy()
  })

  it('starts popup login and renders the authenticated workspace on success', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue(null)
    vi.spyOn(sessionModule, 'loginWithPopup').mockResolvedValue({ token: 'abc123' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue([])

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '内容编辑台' })).toBeTruthy()
    })

    expect(screen.getByRole('button', { name: '退出登录' })).toBeTruthy()
  })

  it('shows the login error and keeps the user at the gate when login fails', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue(null)
    vi.spyOn(sessionModule, 'loginWithPopup').mockRejectedValue(new sessionModule.AuthError('blocked'))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }))

    expect(await screen.findByText('blocked')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
  })

  it('logs out and returns to the login gate', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'persisted-token' })

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))

    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
    expect(screen.queryByText('请选择一篇文章开始编辑，或新建一篇草稿。')).not.toBeTruthy()
  })
})
