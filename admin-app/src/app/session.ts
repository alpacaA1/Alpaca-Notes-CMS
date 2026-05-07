import { AUTH_ORIGIN, AUTH_START_URL } from './config'

const SESSION_STORAGE_KEY = 'alpaca-admin-session-v2'
const AUTH_READY_MESSAGE = 'authorizing:github'
const AUTH_SUCCESS_PREFIX = 'authorization:github:success:'
const AUTH_ERROR_PREFIX = 'authorization:github:error:'
const DEFAULT_POPUP_TIMEOUT_MS = 60_000
const POPUP_POLL_INTERVAL_MS = 250
const POPUP_FEATURES = 'popup=yes,width=640,height=760,resizable=yes,scrollbars=yes'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type SessionState = {
  token: string
}

type PersistedSessionState = SessionState & {
  expiresAt?: number
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

function parseTerminalMessage(message: string):
  | { status: 'success'; payload: { token: string } }
  | { status: 'error'; payload: { message?: string } }
  | null {
  if (message.startsWith(AUTH_SUCCESS_PREFIX)) {
    return {
      status: 'success',
      payload: JSON.parse(message.slice(AUTH_SUCCESS_PREFIX.length)) as { token: string },
    }
  }

  if (message.startsWith(AUTH_ERROR_PREFIX)) {
    return {
      status: 'error',
      payload: JSON.parse(message.slice(AUTH_ERROR_PREFIX.length)) as { message?: string },
    }
  }

  return null
}

export function getSessionStorageKey() {
  return SESSION_STORAGE_KEY
}

function resolveStoredSession(storage: Pick<Storage, 'getItem'>):
  | { status: 'missing' }
  | { status: 'invalid' }
  | { status: 'expired' }
  | { status: 'valid'; session: PersistedSessionState } {
  const raw = storage.getItem(SESSION_STORAGE_KEY)
  if (!raw) {
    return { status: 'missing' }
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSessionState>
    if (typeof parsed.token !== 'string' || parsed.token.length === 0) {
      return { status: 'invalid' }
    }

    if (
      parsed.expiresAt !== undefined
      && (!Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= Date.now())
    ) {
      return { status: 'expired' }
    }

    return {
      status: 'valid',
      session: {
        token: parsed.token,
        ...(typeof parsed.expiresAt === 'number' ? { expiresAt: parsed.expiresAt } : {}),
      },
    }
  } catch {
    return { status: 'invalid' }
  }
}

function clearStoredSessionFrom(storage: Pick<Storage, 'removeItem'>) {
  storage.removeItem(SESSION_STORAGE_KEY)
}

function writeSessionToStorage(session: SessionState, storage: Pick<Storage, 'setItem'>) {
  storage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      ...session,
      expiresAt: Date.now() + SESSION_TTL_MS,
    } satisfies PersistedSessionState),
  )
}

export function readStoredSession(storage?: Pick<Storage, 'getItem'>): SessionState | null {
  if (storage) {
    const resolved = resolveStoredSession(storage)
    return resolved.status === 'valid' ? { token: resolved.session.token } : null
  }

  const localSession = resolveStoredSession(window.localStorage)
  if (localSession.status === 'valid') {
    if (localSession.session.expiresAt === undefined) {
      writeSessionToStorage({ token: localSession.session.token }, window.localStorage)
    }
    return { token: localSession.session.token }
  }
  if (localSession.status === 'invalid' || localSession.status === 'expired') {
    clearStoredSessionFrom(window.localStorage)
  }

  const sessionSession = resolveStoredSession(window.sessionStorage)
  if (sessionSession.status === 'valid') {
    persistSession({ token: sessionSession.session.token })
    clearStoredSessionFrom(window.sessionStorage)
    return { token: sessionSession.session.token }
  }
  if (sessionSession.status === 'invalid' || sessionSession.status === 'expired') {
    clearStoredSessionFrom(window.sessionStorage)
  }

  return null
}

export function persistSession(
  session: SessionState,
  storage?: Pick<Storage, 'setItem'>,
) {
  if (storage) {
    writeSessionToStorage(session, storage)
    return
  }

  writeSessionToStorage(session, window.localStorage)
  clearStoredSessionFrom(window.sessionStorage)
}

export function clearStoredSession(storage?: Pick<Storage, 'removeItem'>) {
  if (storage) {
    clearStoredSessionFrom(storage)
    return
  }

  clearStoredSessionFrom(window.localStorage)
  clearStoredSessionFrom(window.sessionStorage)
}

export function createSessionStore(initialSession: SessionState | null = null) {
  let session = initialSession

  return {
    getSession() {
      return session
    },
    setSession(nextSession: SessionState | null) {
      session = nextSession
      if (nextSession) {
        persistSession(nextSession)
        return
      }
      clearStoredSession()
    },
    logout() {
      session = null
      clearStoredSession()
    },
  }
}

export type LoginOptions = {
  timeoutMs?: number
  popupPollIntervalMs?: number
}

export function loginWithPopup(options: LoginOptions = {}): Promise<SessionState> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_POPUP_TIMEOUT_MS
  const popupPollIntervalMs = options.popupPollIntervalMs ?? POPUP_POLL_INTERVAL_MS
  const popup = window.open(AUTH_START_URL, 'alpaca-admin-auth', POPUP_FEATURES)

  if (!popup) {
    return Promise.reject(new AuthError('Login popup was blocked. Please retry.'))
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let timeoutId: number | undefined
    let closePollId: number | undefined

    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
      if (closePollId) {
        window.clearInterval(closePollId)
      }
    }

    const finish = (callback: () => void) => {
      if (settled) {
        return
      }
      settled = true
      cleanup()
      callback()
    }

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== AUTH_ORIGIN || event.source !== popup || typeof event.data !== 'string') {
        return
      }

      if (event.data === AUTH_READY_MESSAGE) {
        popup.postMessage('ack', AUTH_ORIGIN)
        return
      }

      const terminal = parseTerminalMessage(event.data)
      if (!terminal) {
        return
      }

      if (terminal.status === 'success') {
        if (!terminal.payload.token) {
          finish(() => reject(new AuthError('GitHub authorization succeeded without a token.')))
          return
        }

        const session = { token: terminal.payload.token }
        persistSession(session)
        finish(() => resolve(session))
        return
      }

      finish(() => reject(new AuthError(terminal.payload.message || 'GitHub 授权失败。')))
    }

    window.addEventListener('message', onMessage)

    timeoutId = window.setTimeout(() => {
      finish(() => reject(new AuthError('GitHub authorization timed out. Please retry.')))
    }, timeoutMs)

    closePollId = window.setInterval(() => {
      if (!popup.closed) {
        return
      }
      finish(() => reject(new AuthError('Login popup was closed before authorization completed.')))
    }, popupPollIntervalMs)
  })
}
