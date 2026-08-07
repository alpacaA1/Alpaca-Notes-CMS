import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { StoredBookMeta } from './book-types'
import { formatBookProgress, getFallbackCoverColor } from './book-utils'

type BookShelfViewProps = {
  books: StoredBookMeta[]
  annotationCounts: Record<string, number>
  isLoading: boolean
  isImporting: boolean
  search: string
  deletingBookId: string | null
  onImportFile: (file: File) => void
  onOpenBook: (book: StoredBookMeta) => void
  onDeleteBook: (book: StoredBookMeta) => void
}

function BookCover({ book }: { book: StoredBookMeta }) {
  const [coverUrl, setCoverUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!book.coverBlob) {
      setCoverUrl(null)
      return
    }
    const url = URL.createObjectURL(book.coverBlob)
    setCoverUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [book.coverBlob])

  if (coverUrl) {
    return <img className="book-shelf__cover-image" src={coverUrl} alt={`《${book.title}》封面`} />
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
  search,
  deletingBookId,
  onImportFile,
  onOpenBook,
  onDeleteBook,
}: BookShelfViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const filteredBooks = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return books
    }
    return books.filter((book) =>
      book.title.toLowerCase().includes(query) || book.creator.toLowerCase().includes(query))
  }, [books, search])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) {
      onImportFile(file)
    }
  }

  const triggerImport = () => fileInputRef.current?.click()

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

      {isLoading ? (
        <div className="book-shelf__empty">
          <p className="book-shelf__empty-title">正在打开书架…</p>
          <p className="book-shelf__empty-desc">书籍文件只保存在本机浏览器，不会上传到仓库。</p>
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
          <p className="book-shelf__empty-desc">导入你的第一本 EPUB 或 PDF，文件仅存本机，不会上传。</p>
          <button
            type="button"
            className="book-shelf__import-btn"
            onClick={triggerImport}
            disabled={isImporting}
          >
            {isImporting ? '正在导入…' : '导入电子书'}
          </button>
        </div>
      ) : (
        <>
          <div className="book-shelf__toolbar">
            <span className="book-shelf__toolbar-meta">
              共 {books.length} 本{filteredBooks.length !== books.length ? ` · 匹配 ${filteredBooks.length} 本` : ''}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="book-shelf__import-btn"
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
                className="book-shelf__import-btn"
                onClick={triggerImport}
                disabled={isImporting}
              >
                {isImporting ? '正在导入…' : '导入电子书'}
              </button>
            </div>
          </div>

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
                return (
                  <article key={book.id} className="book-shelf__card">
                    <button
                      type="button"
                      className="book-shelf__card-trigger"
                      onClick={() => onOpenBook(book)}
                      aria-label={`打开《${book.title}》`}
                    >
                      <div className="book-shelf__cover">
                        <BookCover book={book} />
                        {annotationCount > 0 ? (
                          <span className="book-shelf__annotation-badge" title={`${annotationCount} 条批注`}>
                            {annotationCount}
                          </span>
                        ) : null}
                      </div>
                      <div className="book-shelf__card-body">
                        <h3 className="book-shelf__card-title" title={book.title}>{book.title}</h3>
                        <p className="book-shelf__card-creator" title={book.creator}>{book.creator}</p>
                        <p className="book-shelf__card-format">{(book.format || 'epub').toUpperCase()}</p>
                        <div className="book-shelf__progress" aria-label={`阅读进度 ${formatBookProgress(book.progressFraction)}`}>
                          <div
                            className="book-shelf__progress-fill"
                            style={{ width: formatBookProgress(book.progressFraction) }}
                          />
                        </div>
                        <p className="book-shelf__progress-label">已读 {formatBookProgress(book.progressFraction)}</p>
                      </div>
                    </button>
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
                  </article>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}
