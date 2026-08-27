import { AUTH_ORIGIN, AUTH_START_URL } from './config'

const SESSION_STORAGE_KEY = 'alpaca-admin-session-v2'
const AUTH_READY_MESSAGE = 'authorizing:github'
const AUTH_SUCCESS_PREFIX = 'authorization:github:success:'
const AUTH_ERROR_PREFIX = 'authorization:github:error:'
const DEFAULT_POPUP_TIMEOUT_MS = 60_000
const POPUP_POLL_INTERVAL_MS = 250
const POPUP_FEATURES = 'popup=yes,width=640,height=760,resizable=yes,scrollbars=yes'
const SESSION_TTL_DAYS = 180
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000

export type SessionState = {
  token: string
}

type PersistedSessionState = SessionState & {
  expiresAt?: number
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) {
    return null
  }
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(name: string, value: string, expiresAt: number) {
  if (typeof document === 'undefined') {
    return
  }
  try {
    const expiresUtc = new Date(expiresAt).toUTCString()
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; expires=${expiresUtc}`
  } catch {
    // Ignore cookie write failure in restricted environments
  }
}

function deleteCookie(name: string) {
  if (typeof document === 'undefined') {
    return
  }
  try {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  } catch {
    // Ignore cookie delete failure
  }
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
  const expiresAt = Date.now() + SESSION_TTL_MS
  const payload: PersistedSessionState = {
    ...session,
    expiresAt,
  }
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload))
  writeCookie(SESSION_STORAGE_KEY, JSON.stringify(payload), expiresAt)
}

export function readStoredSession(storage?: Pick<Storage, 'getItem'>): SessionState | null {
  if (storage) {
    const resolved = resolveStoredSession(storage)
    return resolved.status === 'valid' ? { token: resolved.session.token } : null
  }

  const localSession = resolveStoredSession(window.localStorage)
  if (localSession.status === 'valid') {
    const expiresAt = localSession.session.expiresAt
    // Sliding renewal: renew if expiresAt is undefined or more than 1 day old
    if (expiresAt === undefined || expiresAt - Date.now() < SESSION_TTL_MS - 24 * 60 * 60 * 1000) {
      writeSessionToStorage({ token: localSession.session.token }, window.localStorage)
    }
    return { token: localSession.session.token }
  }
  if (localSession.status === 'invalid' || localSession.status === 'expired') {
    clearStoredSessionFrom(window.localStorage)
  }

  // Check fallback cookie (safeguard against iOS Safari localStorage eviction)
  const cookieValue = readCookie(SESSION_STORAGE_KEY)
  if (cookieValue) {
    try {
      const parsed = JSON.parse(cookieValue) as Partial<PersistedSessionState>
      if (typeof parsed.token === 'string' && parsed.token.length > 0) {
        if (parsed.expiresAt === undefined || parsed.expiresAt > Date.now()) {
          persistSession({ token: parsed.token })
          return { token: parsed.token }
        }
      }
    } catch {
      deleteCookie(SESSION_STORAGE_KEY)
    }
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

const IDB_AUTH_DB_NAME = 'alpaca-auth-store'
const IDB_AUTH_STORE_NAME = 'auth'
const IDB_AUTH_KEY = 'session'

function openAuthDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'))
    }
    try {
      const request = indexedDB.open(IDB_AUTH_DB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(IDB_AUTH_STORE_NAME)) {
          db.createObjectStore(IDB_AUTH_STORE_NAME)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('Failed to open auth database'))
    } catch (caughtError) {
      reject(caughtError)
    }
  })
}

export async function saveSessionToIndexedDB(session: SessionState): Promise<void> {
  try {
    const db = await openAuthDatabase()
    const tx = db.transaction(IDB_AUTH_STORE_NAME, 'readwrite')
    const store = tx.objectStore(IDB_AUTH_STORE_NAME)
    const expiresAt = Date.now() + SESSION_TTL_MS
    store.put({ token: session.token, expiresAt }, IDB_AUTH_KEY)
  } catch {
    // Best-effort storage fallback
  }
}

export async function readSessionFromIndexedDB(): Promise<SessionState | null> {
  try {
    const db = await openAuthDatabase()
    const tx = db.transaction(IDB_AUTH_STORE_NAME, 'readonly')
    const store = tx.objectStore(IDB_AUTH_STORE_NAME)
    return await new Promise<SessionState | null>((resolve) => {
      const request = store.get(IDB_AUTH_KEY)
      request.onsuccess = () => {
        const result = request.result as Partial<PersistedSessionState> | undefined
        if (result && typeof result.token === 'string' && result.token.length > 0) {
          if (result.expiresAt === undefined || result.expiresAt > Date.now()) {
            resolve({ token: result.token })
            return
          }
        }
        resolve(null)
      }
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function clearSessionFromIndexedDB(): Promise<void> {
  try {
    const db = await openAuthDatabase()
    const tx = db.transaction(IDB_AUTH_STORE_NAME, 'readwrite')
    const store = tx.objectStore(IDB_AUTH_STORE_NAME)
    store.delete(IDB_AUTH_KEY)
  } catch {
    // Best-effort cleanup
  }
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
  void saveSessionToIndexedDB(session)
}

export function clearStoredSession(storage?: Pick<Storage, 'removeItem'>) {
  if (storage) {
    clearStoredSessionFrom(storage)
    return
  }

  clearStoredSessionFrom(window.localStorage)
  clearStoredSessionFrom(window.sessionStorage)
  deleteCookie(SESSION_STORAGE_KEY)
  void clearSessionFromIndexedDB()
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
