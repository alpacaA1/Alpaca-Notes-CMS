import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { StoredBookMeta } from './book-types'
import { formatBookProgress, getFallbackCoverColor } from './book-utils'
import WeReadSyncDialog from './weread-sync-dialog'

type BookShelfViewProps = {
  books: StoredBookMeta[]
  annotationCounts: Record<string, number>
  isLoading: boolean
  isImporting: boolean
  isSyncing?: boolean
  search: string
  deletingBookId: string | null
  localFilesStatus?: Record<string, boolean>
  onImportFile: (file: File) => void
  onRelinkFile?: (book: StoredBookMeta, file: File) => void
  onOpenBook: (book: StoredBookMeta) => void
  onDeleteBook: (book: StoredBookMeta) => void
  onDeleteMultipleBooks?: (books: StoredBookMeta[]) => void
  onSyncBooks?: () => void
  onRestoreSuccess?: (message?: string) => void
  onRestoreError?: (message: string) => void
}

function BookCover({ book }: { book: StoredBookMeta }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (!book.coverBlob) {
      setBlobUrl(null)
      return
    }
    const url = URL.createObjectURL(book.coverBlob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [book.coverBlob])

  const displaySrc = blobUrl || (!imgError && book.coverUrl ? book.coverUrl : null)

  if (displaySrc) {
    return (
      <img
        className="book-shelf__cover-image"
        src={displaySrc}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        alt={`《${book.title}》封面`}
      />
    )
  }

  return (
    <div
      className="book-shelf__cover-fallback"
      style={{ backgroundColor: getFallbackCoverColor(book.coverSeed) }}
      aria-hidden="true"
    >
      <span>{book.title.slice(0, 1) || '书'}</span>
    </div>
  )
}

export default function BookShelfView({
  books,
  annotationCounts,
  isLoading,
  isImporting,
  isSyncing = false,
  search,
  deletingBookId,
  localFilesStatus = {},
  onImportFile,
  onRelinkFile,
  onOpenBook,
  onDeleteBook,
  onDeleteMultipleBooks,
  onSyncBooks,
  onWeReadSyncSuccess,
  onRestoreSuccess,
}: BookShelfViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const relinkFileInputRef = useRef<HTMLInputElement | null>(null)
  const restoreFileInputRef = useRef<HTMLInputElement | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isWeReadSyncOpen, setIsWeReadSyncOpen] = useState(false)
  const [targetRelinkBook, setTargetRelinkBook] = useState<StoredBookMeta | null>(null)
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [selectedBookIds, setSelectedBookIds] = useState<Set<string>>(new Set())

  const filteredBooks = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return books
    }
    return books.filter((book) =>
      book.title.toLowerCase().includes(query) || book.creator.toLowerCase().includes(query))
  }, [books, search])

  const isAllSelected = useMemo(() => {
    if (filteredBooks.length === 0) return false
    return filteredBooks.every((book) => selectedBookIds.has(book.id))
  }, [filteredBooks, selectedBookIds])

  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedBookIds(new Set())
    } else {
      setSelectedBookIds(new Set(filteredBooks.map((b) => b.id)))
    }
  }

  const handleToggleBook = (bookId: string) => {
    const next = new Set(selectedBookIds)
    if (next.has(bookId)) {
      next.delete(bookId)
    } else {
      next.add(bookId)
    }
    setSelectedBookIds(next)
  }

  const handleBatchDelete = () => {
    const targetBooks = books.filter((b) => selectedBookIds.has(b.id))
    if (targetBooks.length === 0) return
    onDeleteMultipleBooks?.(targetBooks)
    setSelectedBookIds(new Set())
    setIsBatchMode(false)
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) {
      onImportFile(file)
    }
  }

  const triggerImport = () => fileInputRef.current?.click()

  const handleRelinkFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file && targetRelinkBook && onRelinkFile) {
      onRelinkFile(targetRelinkBook, file)
      setTargetRelinkBook(null)
    }
  }

  const triggerRelink = (book: StoredBookMeta) => {
    setTargetRelinkBook(book)
    relinkFileInputRef.current?.click()
  }

  const handleRestoreFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setIsRestoring(true)
    try {
      const text = await file.text()
      const json = JSON.parse(text)
      const { importBookLibraryBackup } = await import('./book-store')
      const count = await importBookLibraryBackup(json)
      onRestoreSuccess?.(`已恢复 ${count} 本电子书的备份。`)
    } catch (err) {
      onRestoreError?.(err instanceof Error ? err.message : '备份格式有误，恢复失败。')
    } finally {
      setIsRestoring(false)
    }
  }

  const triggerRestore = () => restoreFileInputRef.current?.click()

  return (
    <section className="book-shelf" aria-label="电子书书架">
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub,.pdf,application/epub+zip,application/pdf"
        className="book-shelf__file-input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleFileChange}
      />
      <input
        ref={relinkFileInputRef}
        type="file"
        accept=".epub,.pdf,application/epub+zip,application/pdf"
        className="book-shelf__file-input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleRelinkFileChange}
      />
      <input
        ref={restoreFileInputRef}
        type="file"
        accept=".json,application/json"
        className="book-shelf__file-input"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleRestoreFileChange}
      />

      {isLoading ? (
        <div className="book-shelf__loading">
          <p>正在读取书架…</p>
        </div>
      ) : books.length === 0 ? (
        <div className="book-shelf__empty">
          <svg className="book-shelf__empty-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
            <path
              d="M32 14c-4.5-3.4-10.4-4.6-18-4v38c7.6-.6 13.5.6 18 4 4.5-3.4 10.4-4.6 18-4V10c-7.6-.6-13.5.6-18 4Z"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinejoin="round"
            />
            <path d="M32 14v38" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
          <p className="book-shelf__empty-title">书架还是空的</p>
          <p className="book-shelf__empty-desc">导入你的第一本 EPUB/PDF，或一键同步微信读书划线与想法。</p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="book-shelf__import-btn"
              onClick={triggerImport}
              disabled={isImporting}
            >
              {isImporting ? '正在导入…' : '导入电子书'}
            </button>
            <button
              type="button"
              className="book-shelf__import-btn book-shelf__import-btn--secondary"
              onClick={() => setIsWeReadSyncOpen(true)}
              title="通过微信读书官方 API 同步划线与想法"
            >
              微信读书
            </button>
            {onSyncBooks ? (
              <button
                type="button"
                className="book-shelf__import-btn book-shelf__import-btn--secondary"
                onClick={onSyncBooks}
                disabled={isSyncing}
              >
                {isSyncing ? '正在同步…' : '云端同步'}
              </button>
            ) : null}
            <button
              type="button"
              className="book-shelf__import-btn book-shelf__import-btn--secondary"
              onClick={triggerRestore}
            >
              恢复备份
            </button>
          </div>
        </div>
      ) : (
        <>
          {isBatchMode ? (
            <div className="book-shelf__toolbar book-shelf__toolbar--batch">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, color: 'var(--admin-text)' }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  disabled={filteredBooks.length === 0}
                  onChange={handleToggleSelectAll}
                />
                <span>全选 (已选 {selectedBookIds.size}/{filteredBooks.length} 本)</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="book-shelf__import-btn book-shelf__import-btn--danger"
                  disabled={selectedBookIds.size === 0}
                  onClick={handleBatchDelete}
                  title="批量删除所选的书籍及本地文件"
                >
                  批量删除 ({selectedBookIds.size})
                </button>
                <button
                  type="button"
                  className="book-shelf__import-btn book-shelf__import-btn--secondary"
                  onClick={() => {
                    setIsBatchMode(false)
                    setSelectedBookIds(new Set())
                  }}
                >
                  退出管理
                </button>
              </div>
            </div>
          ) : (
            <div className="book-shelf__toolbar">
              <span className="book-shelf__toolbar-meta">
                共 {books.length} 本{filteredBooks.length !== books.length ? ` · 匹配 ${filteredBooks.length} 本` : ''}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="book-shelf__import-btn book-shelf__import-btn--secondary"
                  onClick={() => setIsWeReadSyncOpen(true)}
                  title="通过微信读书官方 API 同步划线与想法"
                >
                  微信读书
                </button>
                {onSyncBooks ? (
                  <button
                    type="button"
                    className="book-shelf__import-btn book-shelf__import-btn--secondary"
                    onClick={onSyncBooks}
                    disabled={isSyncing}
                    title="与 GitHub 仓库同步最新书架元数据与批注"
                  >
                    {isSyncing ? '正在同步…' : '云端同步'}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="book-shelf__import-btn book-shelf__import-btn--secondary"
                  onClick={() => setIsBatchMode(true)}
                  title="批量选择并删除书架上的电子书"
                >
                  批量管理
                </button>
                <button
                  type="button"
                  className="book-shelf__import-btn book-shelf__import-btn--secondary"
                  onClick={async () => {
                    const { exportBookLibraryBackup } = await import('./book-store')
                    const data = await exportBookLibraryBackup()
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
                    const url = URL.createObjectURL(blob)
                    const link = document.createElement('a')
                    link.href = url
                    link.download = `alpaca-books-backup-${new Date().toISOString().slice(0, 10)}.json`
                    link.click()
                    URL.revokeObjectURL(url)
                  }}
                  title="导出所有电子书元数据与批注备份为 JSON 文件"
                >
                  备份书库
                </button>
                <button
                  type="button"
                  className="book-shelf__import-btn book-shelf__import-btn--secondary"
                  onClick={triggerRestore}
                  title="选择先前备份的 JSON 文件恢复书架元数据与批注"
                >
                  恢复备份
                </button>
                <button
                  type="button"
                  className="book-shelf__import-btn"
                  onClick={triggerImport}
                  disabled={isImporting}
                >
                  {isImporting ? '正在导入…' : '导入电子书'}
                </button>
              </div>
            </div>
          )}

          {filteredBooks.length === 0 ? (
            <div className="book-shelf__empty">
              <p className="book-shelf__empty-title">没有匹配的书</p>
              <p className="book-shelf__empty-desc">换个书名或作者关键词试试。</p>
            </div>
          ) : (
            <div className="book-shelf__grid">
              {filteredBooks.map((book) => {
                const annotationCount = annotationCounts[book.id] ?? 0
                const isDeleting = deletingBookId === book.id
                const isWeReadBook = book.id.startsWith('weread-')
                const hasLocalFile = localFilesStatus[book.id] !== false
                const isSelected = selectedBookIds.has(book.id)

                return (
                  <article
                    key={book.id}
                    className={`book-shelf__card${isBatchMode ? ' is-batch-mode' : ''}${isSelected ? ' is-selected' : ''}`}
                  >
                    <button
                      type="button"
                      className="book-shelf__card-trigger"
                      onClick={() => {
                        if (isBatchMode) {
                          handleToggleBook(book.id)
                        } else if (!hasLocalFile) {
                          triggerRelink(book)
                        } else {
                          onOpenBook(book)
                        }
                      }}
                      aria-label={
                        isBatchMode
                          ? `${isSelected ? '取消选择' : '选择'}《${book.title}》`
                          : hasLocalFile
                            ? `打开《${book.title}》`
                            : `关联《${book.title}》的本地文件`
                      }
                    >
                      <div className="book-shelf__cover">
                        <BookCover book={book} />
                        {isBatchMode && (
                          <div className={`book-shelf__select-badge${isSelected ? ' is-checked' : ''}`}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              tabIndex={-1}
                              aria-hidden="true"
                            />
                          </div>
                        )}
                        {!isBatchMode && annotationCount > 0 ? (
                          <span className="book-shelf__annotation-badge" title={`${annotationCount} 条批注`}>
                            {annotationCount}
                          </span>
                        ) : null}
                        {!isBatchMode && !hasLocalFile ? (
                          <span
                            className="book-shelf__missing-badge"
                            title={isWeReadBook ? '微信读书导入，点击可选择本地文件关联阅读' : '当前设备未载入该书文件，点击选择本地文件关联'}
                          >
                            {isWeReadBook ? '微信读书笔记' : '需载入文件'}
                          </span>
                        ) : null}
                      </div>
                      <div className="book-shelf__card-body">
                        <h3 className="book-shelf__card-title" title={book.title}>{book.title}</h3>
                        <p className="book-shelf__card-creator" title={book.creator}>{book.creator}</p>
                        <p className="book-shelf__card-format">
                          {isWeReadBook ? '微信读书' : (book.format || 'epub').toUpperCase()}
                        </p>
                        <div className="book-shelf__progress" aria-label={`阅读进度 ${formatBookProgress(book.progressFraction)}`}>
                          <div
                            className="book-shelf__progress-fill"
                            style={{ width: formatBookProgress(book.progressFraction) }}
                          />
                        </div>
                        <p className="book-shelf__progress-label">
                          {annotationCount > 0 ? `${annotationCount} 条笔记` : `已读 ${formatBookProgress(book.progressFraction)}`}
                        </p>
                      </div>
                    </button>
                    {!isBatchMode && (
                      <button
                        type="button"
                        className="book-shelf__delete-btn"
                        aria-label={`删除《${book.title}》`}
                        title="删除"
                        disabled={isDeleting}
                        onClick={() => onDeleteBook(book)}
                      >
                        {isDeleting ? '…' : '×'}
                      </button>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}

      <WeReadSyncDialog
        isOpen={isWeReadSyncOpen}
        onClose={() => setIsWeReadSyncOpen(false)}
        onSyncComplete={() => {
          if (onWeReadSyncSuccess) {
            onWeReadSyncSuccess()
          } else if (onRestoreSuccess) {
            onRestoreSuccess()
          }
        }}
      />
    </section>
  )
}
