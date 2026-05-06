import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AuthError,
  clearStoredSession,
  getSessionStorageKey,
  loginWithPopup,
  persistSession,
  readStoredSession,
} from './session'
import {
  AUTH_BASE_URL,
  AUTH_ORIGIN,
  AUTH_START_URL,
  POSTS_PATH,
  REPO_BRANCH,
  REPO_NAME,
  REPO_OWNER,
  SITE_ROOT_PATH,
} from './config'

describe('session config and popup flow', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  it('exposes the approved production config defaults', () => {
    expect(AUTH_BASE_URL).toBe('https://alpaca-notes-cms.vercel.app')
    expect(AUTH_START_URL).toBe('https://alpaca-notes-cms.vercel.app/api/auth')
    expect(AUTH_ORIGIN).toBe('https://alpaca-notes-cms.vercel.app')
    expect(REPO_OWNER).toBe('alpacaA1')
    expect(REPO_NAME).toBe('Alpaca-Notes-Content')
    expect(REPO_BRANCH).toBe('main')
    expect(POSTS_PATH).toBe('source/_posts')
    expect(SITE_ROOT_PATH).toBe('/Alpaca-Notes-CMS')
  })

  it('stores and clears the session in sessionStorage', () => {
    persistSession({ token: 'test-token' })
    expect(readStoredSession()).toEqual({ token: 'test-token' })

    clearStoredSession()
    expect(window.sessionStorage.getItem(getSessionStorageKey())).toBeNull()
    expect(readStoredSession()).toBeNull()
  })

  it('rejects login when the popup is blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)

    await expect(loginWithPopup()).rejects.toEqual(
      new AuthError('Login popup was blocked. Please retry.'),
    )
  })

  it('acknowledges the ready message and resolves on success from the auth origin', async () => {
    const popup = {
      closed: false,
      postMessage: vi.fn(),
    } as unknown as Window

    vi.spyOn(window, 'open').mockReturnValue(popup)

    const loginPromise = loginWithPopup({ timeoutMs: 5_000, popupPollIntervalMs: 50 })

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: AUTH_ORIGIN,
        source: popup,
        data: 'authorizing:github',
      }),
    )

    expect((popup as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage).toHaveBeenCalledWith(
      'ack',
      AUTH_ORIGIN,
    )

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: AUTH_ORIGIN,
        source: popup,
        data: 'authorization:github:success:{"token":"abc123"}',
      }),
    )

    await expect(loginPromise).resolves.toEqual({ token: 'abc123' })
    expect(readStoredSession()).toEqual({ token: 'abc123' })
  })

  it('ignores unrelated message events', async () => {
    const popup = {
      closed: false,
      postMessage: vi.fn(),
    } as unknown as Window

    vi.spyOn(window, 'open').mockReturnValue(popup)

    const loginPromise = loginWithPopup({ timeoutMs: 100, popupPollIntervalMs: 20 })

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://example.com',
        source: popup,
        data: 'authorizing:github',
      }),
    )

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: AUTH_ORIGIN,
        source: window,
        data: 'authorization:github:success:{"token":"wrong"}',
      }),
    )

    await expect(loginPromise).rejects.toEqual(
      new AuthError('GitHub authorization timed out. Please retry.'),
    )
  })

  it('surfaces popup close as login failure', async () => {
    vi.useFakeTimers()

    const popup = {
      closed: false,
      postMessage: vi.fn(),
    } as unknown as { closed: boolean; postMessage: ReturnType<typeof vi.fn> }

    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)

    const outcomePromise = loginWithPopup({ timeoutMs: 5_000, popupPollIntervalMs: 20 }).then(
      (session) => ({ status: 'resolved' as const, session }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    )

    popup.closed = true
    await vi.advanceTimersByTimeAsync(25)

    const outcome = await outcomePromise
    expect(outcome).toMatchObject({
      status: 'rejected',
      error: new AuthError('Login popup was closed before authorization completed.'),
    })

    vi.useRealTimers()
  })

  it('surfaces popup timeout as login failure', async () => {
    vi.useFakeTimers()

    const popup = {
      closed: false,
      postMessage: vi.fn(),
    } as unknown as Window

    vi.spyOn(window, 'open').mockReturnValue(popup)

    const outcomePromise = loginWithPopup({ timeoutMs: 100, popupPollIntervalMs: 20 }).then(
      (session) => ({ status: 'resolved' as const, session }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    )

    await vi.advanceTimersByTimeAsync(110)

    const outcome = await outcomePromise
    expect(outcome).toMatchObject({
      status: 'rejected',
      error: new AuthError('GitHub authorization timed out. Please retry.'),
    })

    vi.useRealTimers()
  })

  it('surfaces auth error payloads', async () => {
    const popup = {
      closed: false,
      postMessage: vi.fn(),
    } as unknown as Window

    vi.spyOn(window, 'open').mockReturnValue(popup)

    const loginPromise = loginWithPopup({ timeoutMs: 5_000, popupPollIntervalMs: 50 })

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: AUTH_ORIGIN,
        source: popup,
        data: 'authorization:github:error:{"message":"owner only"}',
      }),
    )

    await expect(loginPromise).rejects.toEqual(new AuthError('owner only'))
  })
})
