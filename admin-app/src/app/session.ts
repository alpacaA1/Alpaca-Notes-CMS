import { AUTH_ORIGIN, AUTH_START_URL } from './config'

const SESSION_STORAGE_KEY = 'alpaca-admin-session'
const AUTH_READY_MESSAGE = 'authorizing:github'
const AUTH_SUCCESS_PREFIX = 'authorization:github:success:'
const AUTH_ERROR_PREFIX = 'authorization:github:error:'
const DEFAULT_POPUP_TIMEOUT_MS = 60_000
const POPUP_POLL_INTERVAL_MS = 250
const POPUP_FEATURES = 'popup=yes,width=640,height=760,resizable=yes,scrollbars=yes'

export type SessionState = {
  token: string
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

export function readStoredSession(storage: Pick<Storage, 'getItem'> = window.sessionStorage): SessionState | null {
  const raw = storage.getItem(SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SessionState>
    if (typeof parsed.token !== 'string' || parsed.token.length === 0) {
      return null
    }
    return { token: parsed.token }
  } catch {
    return null
  }
}

export function persistSession(
  session: SessionState,
  storage: Pick<Storage, 'setItem'> = window.sessionStorage,
) {
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearStoredSession(storage: Pick<Storage, 'removeItem'> = window.sessionStorage) {
  storage.removeItem(SESSION_STORAGE_KEY)
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

      finish(() => reject(new AuthError(terminal.payload.message || 'GitHub authorization failed.')))
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
