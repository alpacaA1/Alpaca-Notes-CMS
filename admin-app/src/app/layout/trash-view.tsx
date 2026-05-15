import type { TrashEntry } from '../github-client'

type TrashViewProps = {
  entries: TrashEntry[]
  search: string
  isLoading: boolean
  isProcessing: boolean
  processingTrashPath: string | null
  onRestore: (entry: TrashEntry) => void
  onDelete: (entry: TrashEntry) => void
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function getContentTypeLabel(contentType: TrashEntry['contentType']) {
  if (contentType === 'read-later') {
    return '待读'
  }

  if (contentType === 'diary') {
    return '日记'
  }

  if (contentType === 'knowledge') {
    return '知识点'
  }

  return '文章'
}

function getRemainingDays(value: string) {
  const expiresAt = new Date(value)
  if (Number.isNaN(expiresAt.getTime())) {
    return null
  }

  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
}

export default function TrashView({
  entries,
  search,
  isLoading,
  isProcessing,
  processingTrashPath,
  onRestore,
  onDelete,
}: TrashViewProps) {
  const normalizedQuery = search.trim().toLowerCase()
  const visibleEntries = normalizedQuery
    ? entries.filter((entry) =>
        entry.originalTitle.toLowerCase().includes(normalizedQuery) ||
        entry.originalPath.toLowerCase().includes(normalizedQuery) ||
        entry.content.toLowerCase().includes(normalizedQuery),
      )
    : entries
  const expiringSoonCount = entries.filter((entry) => {
    const remainingDays = getRemainingDays(entry.expiresAt)
    return remainingDays !== null && remainingDays <= 7
  }).length

  return (
    <section className="trash-view">
      <div className="trash-view__hero">
        <div className="trash-view__hero-copy">
          <p className="trash-view__eyebrow">30 天内可恢复</p>
          <h2>回收站</h2>
          <p className="trash-view__note">删除的内容会先进入回收站，超过 30 天自动清理。</p>
        </div>
        <div className="trash-view__stats">
          <div className="trash-view__stat-card">
            <strong>{isLoading ? '...' : entries.length}</strong>
            <span>可恢复内容</span>
          </div>
          <div className="trash-view__stat-card trash-view__stat-card--urgent">
            <strong>{isLoading ? '...' : expiringSoonCount}</strong>
            <span>7 天内到期</span>
          </div>
        </div>
      </div>

      {visibleEntries.length === 0 ? (
        <section className="trash-view__empty">
          <strong>{isLoading ? '正在加载回收站…' : '回收站为空'}</strong>
          <p>{normalizedQuery ? '没有匹配的已删除内容。' : '删除后的内容会显示在这里。'}</p>
        </section>
      ) : (
        <ul className="trash-view__list">
          {visibleEntries.map((entry) => {
            const isWorking = isProcessing && processingTrashPath === entry.trashPath
            const remainingDays = getRemainingDays(entry.expiresAt)

            return (
              <li key={entry.trashPath} className="trash-view__item">
                <div className="trash-view__item-main">
                  <div className="trash-view__item-meta">
                    <span className={`trash-view__type trash-view__type--${entry.contentType}`}>{getContentTypeLabel(entry.contentType)}</span>
                    <span>删除于 {formatDateTime(entry.deletedAt)}</span>
                    <span>保留至 {formatDateTime(entry.expiresAt)}</span>
                    {remainingDays !== null ? (
                      <span className={remainingDays <= 7 ? 'trash-view__due trash-view__due--urgent' : 'trash-view__due'}>
                        剩余 {remainingDays} 天
                      </span>
                    ) : null}
                  </div>
                  <strong>{entry.originalTitle}</strong>
                  <code className="trash-view__path">{entry.originalPath}</code>
                </div>
                <div className="trash-view__actions">
                  <button
                    type="button"
                    className="trash-view__btn trash-view__btn--restore"
                    onClick={() => onRestore(entry)}
                    disabled={isWorking}
                  >
                    {isWorking ? '处理中…' : '恢复'}
                  </button>
                  <button
                    type="button"
                    className="trash-view__btn trash-view__btn--delete"
                    onClick={() => onDelete(entry)}
                    disabled={isWorking}
                  >
                    {isWorking ? '处理中…' : '彻底删除'}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
