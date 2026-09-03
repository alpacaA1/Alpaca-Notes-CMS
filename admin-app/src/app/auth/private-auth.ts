const PRIVATE_PASSWORD_KEY = 'alpaca_private_password_hash'
const PRIVATE_UNLOCKED_KEY = 'alpaca_private_unlocked'

async function hashPassword(password: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto?.subtle?.digest) {
    const data = new TextEncoder().encode(password)
    const buffer = await crypto.subtle.digest('SHA-256', data)
    const array = Array.from(new Uint8Array(buffer))
    return array.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  // Fallback simple hash for non-crypto environments
  let hash = 0
  for (let index = 0; index < password.length; index += 1) {
    const char = password.charCodeAt(index)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return `hash_${hash}`
}

export function hasPrivatePassword(): boolean {
  try {
    return Boolean(localStorage.getItem(PRIVATE_PASSWORD_KEY))
  } catch {
    return false
  }
}

export async function setPrivatePassword(password: string): Promise<void> {
  const hash = await hashPassword(password.trim())
  try {
    localStorage.setItem(PRIVATE_PASSWORD_KEY, hash)
  } catch {
    // ignore storage errors
  }
}

export async function verifyPrivatePassword(password: string): Promise<boolean> {
  try {
    const storedHash = localStorage.getItem(PRIVATE_PASSWORD_KEY)
    if (!storedHash) {
      return true
    }
    const inputHash = await hashPassword(password.trim())
    return inputHash === storedHash
  } catch {
    return false
  }
}

export function isPrivateSessionUnlocked(): boolean {
  try {
    return sessionStorage.getItem(PRIVATE_UNLOCKED_KEY) === 'true'
  } catch {
    return false
  }
}

export function setPrivateSessionUnlocked(unlocked: boolean): void {
  try {
    if (unlocked) {
      sessionStorage.setItem(PRIVATE_UNLOCKED_KEY, 'true')
    } else {
      sessionStorage.removeItem(PRIVATE_UNLOCKED_KEY)
    }
  } catch {
    // ignore storage errors
  }
}
