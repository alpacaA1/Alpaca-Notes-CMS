import { useEffect, useMemo, useState } from 'react'
import {
  fetchWeReadNotebooks,
  getStoredWeReadApiKey,
  getStoredWeReadLastSyncedAt,
  maskWeReadApiKey,
  setStoredWeReadApiKey,
  syncSelectedWeReadNotebooks,
  type WeReadNotebookItem,
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
  const [notebooks, setNotebooks] = useState<WeReadNotebookItem[]>([])
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set())
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [syncSuccessSummary, setSyncSuccessSummary] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState('')

  const loadNotebookList = async (key: string) => {
    const cleanKey = key.trim()
    if (!cleanKey) return

    setIsLoadingNotebooks(true)
    setErrorMessage(null)
    try {
      const items = await fetchWeReadNotebooks(cleanKey)
      setNotebooks(items)
      // Default to all selected
      const allIds = new Set(items.map((b) => b.bookId || b.book?.bookId || ''))
      allIds.delete('')
      setSelectedBookIds(allIds)
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '获取微信读书书单失败。')
      setNotebooks([])
      setSelectedBookIds(new Set())
    } finally {
      setIsLoadingNotebooks(false)
    }
  }

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
      setSearchQuery('')

      if (key.trim()) {
        void loadNotebookList(key)
      } else {
        setNotebooks([])
        setSelectedBookIds(new Set())
      }
    }
  }, [isOpen])

  const filteredNotebooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return notebooks
    return notebooks.filter((item) => {
      const title = (item.book?.title || '').toLowerCase()
      const author = (item.book?.author || '').toLowerCase()
      return title.includes(q) || author.includes(q)
    })
  }, [notebooks, searchQuery])

  const isAllSelected = useMemo(() => {
    if (filteredNotebooks.length === 0) return false
    return filteredNotebooks.every((item) => selectedBookIds.has(item.bookId || item.book?.bookId || ''))
  }, [filteredNotebooks, selectedBookIds])

  const handleToggleAll = () => {
    const next = new Set(selectedBookIds)
    if (isAllSelected) {
      for (const item of filteredNotebooks) {
        const id = item.bookId || item.book?.bookId || ''
        if (id) next.delete(id)
      }
    } else {
      for (const item of filteredNotebooks) {
        const id = item.bookId || item.book?.bookId || ''
        if (id) next.add(id)
      }
    }
    setSelectedBookIds(next)
  }

  const handleToggleBook = (bookId: string) => {
    if (!bookId) return
    const next = new Set(selectedBookIds)
    if (next.has(bookId)) {
      next.delete(bookId)
    } else {
      next.add(bookId)
    }
    setSelectedBookIds(next)
  }

  const handleSaveKeyAndFetch = async () => {
    const keyToUse = apiKeyInput.trim()
    if (!keyToUse) {
      setErrorMessage('请输入微信读书 API Key (wrk- 开头)。')
      return
    }
    setStoredWeReadApiKey(keyToUse)
    setStoredKey(keyToUse)
    setIsEditingKey(false)
    await loadNotebookList(keyToUse)
  }

  const handleStartSync = async () => {
    const keyToUse = (isEditingKey ? apiKeyInput : storedKey).trim()
    if (!keyToUse) {
      setErrorMessage('请输入微信读书 API Key (wrk- 开头)。')
      return
    }

    const targetNotebooks = notebooks.filter((item) =>
      selectedBookIds.has(item.bookId || item.book?.bookId || ''),
    )

    if (targetNotebooks.length === 0) {
      setErrorMessage('请至少勾选一本要同步的书籍。')
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

      const result = await syncSelectedWeReadNotebooks(keyToUse, targetNotebooks, (msg) => {
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

  if (!isOpen) {
    return null
  }

  return (
    <div className="confirm-dialog__overlay" onClick={isSyncing ? undefined : onClose}>
      <div
        className="confirm-dialog weread-sync-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="weread-sync-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 540 }}
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

        <div className="weread-sync-dialog__body" style={{ marginTop: 10 }}>
          {/* Guide hint */}
          <div
            style={{
              background: 'var(--admin-surface)',
              border: '1px solid var(--admin-line)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12,
              lineHeight: 1.5,
              color: 'var(--admin-muted)',
              marginBottom: 12,
            }}
          >
            💡 微信扫码打开{' '}
            <a
              href="https://weread.qq.com/r/weread-skills"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--admin-accent)', textDecoration: 'underline', fontWeight: 500 }}
            >
              weread.qq.com/r/weread-skills
            </a>{' '}
            复制你的 <code style={{ fontSize: 11 }}>wrk-</code> 密钥。
          </div>

          {/* API Key management */}
          {isEditingKey ? (
            <div style={{ marginBottom: 12 }}>
              <label
                htmlFor="weread-api-key-input"
                style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--admin-text)', marginBottom: 6 }}
              >
                微信读书 API Key
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  id="weread-api-key-input"
                  type="text"
                  placeholder="例如 wrk-1a2b3c4d5e6f..."
                  value={apiKeyInput}
                  disabled={isSyncing || isLoadingNotebooks}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--admin-line)',
                    background: 'var(--admin-bg)',
                    color: 'var(--admin-text)',
                    fontSize: 13,
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  type="button"
                  className="confirm-dialog__btn confirm-dialog__btn--confirm"
                  disabled={!apiKeyInput.trim() || isLoadingNotebooks}
                  onClick={() => { void handleSaveKeyAndFetch() }}
                  style={{ padding: '8px 14px', fontSize: 12 }}
                >
                  {isLoadingNotebooks ? '获取中…' : '获取书单'}
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                borderRadius: 6,
                background: 'var(--admin-surface)',
                border: '1px solid var(--admin-line)',
                marginBottom: 12,
              }}
            >
              <div>
                <span style={{ fontSize: 11, color: 'var(--admin-muted)', display: 'block' }}>已绑定 API Key</span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--admin-text)', fontWeight: 600 }}>
                  {maskWeReadApiKey(storedKey)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--admin-muted)', marginLeft: 8 }}>
                  上次同步：{formatLastSyncTime(lastSyncedAt)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="material-organizer-dialog__text-btn"
                  disabled={isSyncing || isLoadingNotebooks}
                  onClick={() => { void loadNotebookList(storedKey) }}
                  style={{ fontSize: 12 }}
                  title="重新从微信读书拉取书单"
                >
                  {isLoadingNotebooks ? '刷新中…' : '刷新书单'}
                </button>
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
            </div>
          )}

          {/* Book List Selector */}
          {!isEditingKey && (
            <div>
              <div className="weread-sync__toolbar">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--admin-text)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    disabled={isSyncing || isLoadingNotebooks || filteredNotebooks.length === 0}
                    onChange={handleToggleAll}
                  />
                  <span>
                    全选 ({selectedBookIds.size}/{notebooks.length} 本)
                  </span>
                </label>
                {notebooks.length > 5 && (
                  <input
                    type="text"
                    placeholder="🔍 过滤书名或作者…"
                    className="weread-sync__search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ maxWidth: 180 }}
                  />
                )}
              </div>

              {isLoadingNotebooks ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--admin-muted)', fontSize: 13, background: 'var(--admin-surface)', borderRadius: 8, border: '1px solid var(--admin-line)' }}>
                  ⏳ 正在拉取微信读书书单…
                </div>
              ) : notebooks.length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--admin-muted)', fontSize: 13, background: 'var(--admin-surface)', borderRadius: 8, border: '1px solid var(--admin-line)' }}>
                  暂未获取到有划线或想法的书籍
                </div>
              ) : (
                <div className="weread-sync__book-list">
                  {filteredNotebooks.map((item) => {
                    const id = item.bookId || item.book?.bookId || ''
                    const isSelected = selectedBookIds.has(id)
                    const title = item.book?.title || '未命名书籍'
                    const author = item.book?.author || '未知作者'
                    const bookmarkCount = item.bookmarkCount || 0
                    const thoughtCount = item.thoughtCount || 0

                    return (
                      <div
                        key={id || title}
                        className={`weread-sync__book-item${isSelected ? ' is-selected' : ''}`}
                        onClick={() => handleToggleBook(id)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={isSyncing}
                          onChange={() => handleToggleBook(id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="weread-sync__book-info">
                          <p className="weread-sync__book-title" title={title}>{title}</p>
                          <p className="weread-sync__book-author" title={author}>{author}</p>
                        </div>
                        <div className="weread-sync__book-stats">
                          {bookmarkCount > 0 && (
                            <span className="weread-sync__book-tag">{bookmarkCount} 划线</span>
                          )}
                          {thoughtCount > 0 && (
                            <span className="weread-sync__book-tag">{thoughtCount} 想法</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sync Progress */}
          {isSyncing && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'var(--admin-accent-soft, #f4eee6)',
                color: 'var(--admin-text)',
                fontSize: 13,
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
              <span>{progressText || '正在同步中…'}</span>
            </div>
          )}

          {/* Sync Success */}
          {syncSuccessSummary && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'rgba(46, 125, 50, 0.1)',
                border: '1px solid rgba(46, 125, 50, 0.3)',
                color: '#2e7d32',
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              ✓ {syncSuccessSummary}
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 6,
                background: 'rgba(211, 47, 47, 0.1)',
                border: '1px solid rgba(211, 47, 47, 0.3)',
                color: '#d32f2f',
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              ⚠️ {errorMessage}
            </div>
          )}
        </div>

        <div className="confirm-dialog__actions" style={{ marginTop: 14 }}>
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--cancel"
            disabled={isSyncing}
            onClick={onClose}
          >
            {syncSuccessSummary ? '完成' : '取消'}
          </button>
          {!isEditingKey && (
            <button
              type="button"
              className="confirm-dialog__btn confirm-dialog__btn--confirm"
              disabled={isSyncing || selectedBookIds.size === 0 || notebooks.length === 0}
              onClick={() => { void handleStartSync() }}
            >
              {isSyncing
                ? '同步中…'
                : selectedBookIds.size === notebooks.length
                  ? `全部同步 (${notebooks.length} 本)`
                  : `同步所选 (${selectedBookIds.size} 本)`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

