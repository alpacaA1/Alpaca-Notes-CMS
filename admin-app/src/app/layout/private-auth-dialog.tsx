import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { hasPrivatePassword, setPrivatePassword, verifyPrivatePassword } from '../auth/private-auth'

type PrivateAuthDialogProps = {
  isOpen: boolean
  onSuccess: () => void
  onCancel: () => void
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

export default function PrivateAuthDialog({ isOpen, onSuccess, onCancel }: PrivateAuthDialogProps) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSettingInitialPassword, setIsSettingInitialPassword] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setPassword('')
      setError(null)
      setIsSettingInitialPassword(!hasPrivatePassword())
      setTimeout(() => {
        inputRef.current?.focus()
      }, 50)
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault()
    if (!password.trim()) {
      setError('请输入密码')
      inputRef.current?.focus()
      return
    }

    if (isSettingInitialPassword) {
      await setPrivatePassword(password)
      onSuccess()
      return
    }

    const isValid = await verifyPrivatePassword(password)
    if (isValid) {
      onSuccess()
    } else {
      setError('密码错误，请重试')
      setPassword('')
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="confirm-dialog__overlay" onClick={onCancel}>
      <div
        className="confirm-dialog private-auth-dialog"
        role="dialog"
        aria-labelledby="private-auth-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="confirm-dialog__header" style={{ alignItems: 'center', marginBottom: 16 }}>
          <span className="confirm-dialog__mark" aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12 }}>
            <LockIcon />
          </span>
          <div>
            <h3 id="private-auth-dialog-title" className="confirm-dialog__title" style={{ fontSize: '1.2rem' }}>
              {isSettingInitialPassword ? '设置访问密码' : '输入访问密码'}
            </h3>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ margin: 0 }}>
          <div style={{ margin: '14px 0 6px' }}>
            <input
              ref={inputRef}
              type="password"
              className="private-auth-dialog__input"
              value={password}
              placeholder={isSettingInitialPassword ? '输入新密码以保护暗格' : '输入密码'}
              onChange={(event) => {
                setPassword(event.target.value)
                if (error) setError(null)
              }}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '10px 14px',
                fontSize: '15px',
                fontFamily: 'inherit',
                borderRadius: '8px',
                border: error ? '1px solid var(--admin-button-danger, #8a4f46)' : '1px solid var(--admin-line-strong, #d6c8b8)',
                background: 'var(--admin-bg, #FAF6F0)',
                color: 'var(--admin-text, #2f2a24)',
                outline: 'none',
                transition: 'border-color 150ms ease, box-shadow 150ms ease',
              }}
            />
          </div>

          {error ? (
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--admin-button-danger, #8a4f46)' }}>
              {error}
            </p>
          ) : null}

          <div className="confirm-dialog__actions" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="confirm-dialog__btn confirm-dialog__btn--cancel"
              onClick={onCancel}
            >
              取消
            </button>
            <button
              type="submit"
              className="confirm-dialog__btn confirm-dialog__btn--confirm"
            >
              确认
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
