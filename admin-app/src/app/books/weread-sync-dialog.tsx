import { useEffect, useState } from 'react'
import {
  getStoredWeReadApiKey,
  getStoredWeReadLastSyncedAt,
  maskWeReadApiKey,
  setStoredWeReadApiKey,
  syncAllWeReadNotebooks,
} from './weread-client'

type WeReadSyncDialogProps = {
  isOpen: boolean
  onClose: () => void
  onSyncComplete?: () => void
}

export default function WeReadSyncDialog({
  isOpen,
  onClose,
  onSyncComplete,
}: WeReadSyncDialogProps) {
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [storedKey, setStoredKey] = useState('')
  const [isEditingKey, setIsEditingKey] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [syncSuccessSummary, setSyncSuccessSummary] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState('')

  useEffect(() => {
    if (isOpen) {
      const key = getStoredWeReadApiKey()
      setStoredKey(key)
      setApiKeyInput(key)
      setIsEditingKey(!key)
      setLastSyncedAt(getStoredWeReadLastSyncedAt())
      setErrorMessage(null)
      setSyncSuccessSummary(null)
      setProgressText('')
      setIsSyncing(false)
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const handleStartSync = async () => {
    const keyToUse = (isEditingKey ? apiKeyInput : storedKey).trim()
    if (!keyToUse) {
      setErrorMessage('请输入微信读书 API Key (wrk- 开头)。')
      return
    }

    setIsSyncing(true)
    setErrorMessage(null)
    setSyncSuccessSummary(null)
    setProgressText('正在准备连接微信读书…')

    try {
      setStoredWeReadApiKey(keyToUse)
      setStoredKey(keyToUse)
      setIsEditingKey(false)

      const result = await syncAllWeReadNotebooks(keyToUse, (msg) => {
        setProgressText(msg)
      })

      setLastSyncedAt(new Date().toISOString())
      setSyncSuccessSummary(`已成功同步 ${result.booksCount} 本书、共 ${result.annotationsCount} 条划线与想法！`)
      onSyncComplete?.()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '同步微信读书失败。')
    } finally {
      setIsSyncing(false)
      setProgressText('')
    }
  }

  const formatLastSyncTime = (iso: string) => {
    if (!iso) return '尚未同步'
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="confirm-dialog__overlay" onClick={isSyncing ? undefined : onClose}>
      <div
        className="confirm-dialog weread-sync-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weread-sync-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <div className="weread-sync-dialog__header">
          <div style={{ flex: 1 }}>
            <p className="weread-sync-dialog__eyebrow">读书笔记导入</p>
            <h3 id="weread-sync-title" className="weread-sync-dialog__title">
              同步微信读书划线与想法
            </h3>
          </div>
          <button
            type="button"
            className="material-organizer-dialog__close"
            aria-label="关闭"
            disabled={isSyncing}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="weread-sync-dialog__body" style={{ marginTop: 12 }}>
          <div
            style={{
              background: 'var(--admin-surface)',
              border: '1px solid var(--admin-line)',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--admin-muted)',
              marginBottom: 16,
            }}
          >
            <p style={{ margin: '0 0 6px', color: 'var(--admin-text)', fontWeight: 600 }}>
              💡 如何获取专属 API Key？
            </p>
            <p style={{ margin: 0 }}>
              微信扫码打开{' '}
              <a
                href="https://weread.qq.com/r/weread-skills"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--admin-accent)', textDecoration: 'underline', fontWeight: 500 }}
              >
                weread.qq.com/r/weread-skills
              </a>{' '}
              复制你的 <code style={{ fontSize: 12 }}>wrk-</code> 开头密钥填入下方。密钥仅保存在本机浏览器。
            </p>
          </div>

          {isEditingKey ? (
            <div style={{ marginBottom: 14 }}>
              <label
                htmlFor="weread-api-key-input"
                style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-text)', marginBottom: 6 }}
              >
                微信读书 API Key
              </label>
              <input
                id="weread-api-key-input"
                type="text"
                placeholder="例如 wrk-1a2b3c4d5e6f..."
                value={apiKeyInput}
                disabled={isSyncing}
                onChange={(e) => setApiKeyInput(e.target.value)}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--admin-line)',
                  background: 'var(--admin-bg)',
                  color: 'var(--admin-text)',
                  fontSize: 13,
                  fontFamily: 'monospace',
                }}
              />
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--admin-surface)',
                border: '1px solid var(--admin-line)',
                marginBottom: 14,
              }}
            >
              <div>
                <span style={{ fontSize: 12, color: 'var(--admin-muted)', display: 'block' }}>已绑定 API Key</span>
                <span style={{ fontSize: 13, fontFamily: 'monospace', color: 'var(--admin-text)', fontWeight: 600 }}>
                  {maskWeReadApiKey(storedKey)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--admin-muted)', marginLeft: 10 }}>
                  上次同步：{formatLastSyncTime(lastSyncedAt)}
                </span>
              </div>
              <button
                type="button"
                className="material-organizer-dialog__text-btn"
                disabled={isSyncing}
                onClick={() => setIsEditingKey(true)}
                style={{ fontSize: 12 }}
              >
                修改密钥
              </button>
            </div>
          )}

          {isSyncing ? (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 6,
                background: 'var(--admin-accent-soft, #f4eee6)',
                color: 'var(--admin-text)',
                fontSize: 13,
                marginBottom: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
              <span>{progressText || '正在同步中…'}</span>
            </div>
          ) : null}

          {syncSuccessSummary ? (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'rgba(46, 125, 50, 0.1)',
                border: '1px solid rgba(46, 125, 50, 0.3)',
                color: '#2e7d32',
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              ✓ {syncSuccessSummary}
            </div>
          ) : null}

          {errorMessage ? (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'rgba(211, 47, 47, 0.1)',
                border: '1px solid rgba(211, 47, 47, 0.3)',
                color: '#d32f2f',
                fontSize: 13,
                marginBottom: 14,
              }}
            >
              ⚠️ {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="confirm-dialog__actions" style={{ marginTop: 18 }}>
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--cancel"
            disabled={isSyncing}
            onClick={onClose}
          >
            {syncSuccessSummary ? '完成' : '取消'}
          </button>
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--confirm"
            disabled={isSyncing || (isEditingKey && !apiKeyInput.trim())}
            onClick={() => { void handleStartSync() }}
          >
            {isSyncing ? '同步中…' : isEditingKey ? '保存并立即同步' : '立即同步'}
          </button>
        </div>
      </div>
    </div>
  )
}
