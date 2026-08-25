import { useEffect, useRef, useState } from 'react'
import type { PostIndexItem } from '../posts/post-types'
import type { DiaryCalendarCell } from './diary-view-types'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

interface DiaryCalendarGridProps {
  cells: DiaryCalendarCell[]
  onOpenPost: (post: PostIndexItem) => void
  onNewPostForDate: (dateStr: string) => void
  onDeletePost: (post: PostIndexItem) => void
}

function BookmarkRibbon() {
  return (
    <svg
      className="diary-grid__bookmark-icon"
      width="14"
      height="18"
      viewBox="0 0 14 18"
      fill="#8d714d"
      aria-hidden="true"
    >
      <path d="M0 0H14V18L7 13.5L0 18V0Z" />
    </svg>
  )
}

export default function DiaryCalendarGrid({
  cells,
  onOpenPost,
  onNewPostForDate,
  onDeletePost,
}: DiaryCalendarGridProps) {
  const [actionPath, setActionPath] = useState<string | null>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!actionPath) return

    const handleDocumentClick = (event: MouseEvent | TouchEvent) => {
      if (actionsRef.current && actionsRef.current.contains(event.target as Node)) {
        return
      }
      setActionPath(null)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActionPath(null)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('touchstart', handleDocumentClick)
    window.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('touchstart', handleDocumentClick)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [actionPath])

  return (
    <div className="diary-grid-wrapper" aria-label="日记月历视图">
      <div className="diary-grid__weekdays-row" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <div key={w} className="diary-grid__weekday-col">
            {w}
          </div>
        ))}
      </div>

      <div className="diary-grid__matrix">
        {cells.map((cell) => {
          const hasPost = Boolean(cell.post)
          const cellClassNames = [
            'diary-grid__cell',
            cell.isCurrentMonth ? 'diary-grid__cell--current-month' : 'diary-grid__cell--other-month',
            cell.isToday ? 'diary-grid__cell--today' : '',
            hasPost ? 'diary-grid__cell--recorded' : 'diary-grid__cell--empty',
            cell.isSearchHit ? 'diary-grid__cell--search-hit' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const cellStyle = hasPost
            ? { backgroundColor: cell.bgColor }
            : undefined

          const ariaLabel = hasPost
            ? `${cell.dateStr} 日记 (${cell.wordCount} 字)${cell.isPinned ? ' 置顶' : ''}`
            : `${cell.dateStr} 无记录，点击补写日记`

          return (
            <div
              key={cell.dateStr}
              className={cellClassNames}
              style={cellStyle}
            >
              <button
                type="button"
                className="diary-grid__open-cell"
                aria-label={ariaLabel}
                onClick={() => {
                  if (cell.post) {
                    onOpenPost(cell.post)
                  } else {
                    onNewPostForDate(cell.dateStr)
                  }
                }}
              />
              <div className="diary-grid__cell-top">
                <span className="diary-grid__date-number">{cell.dayNumber}</span>
                {cell.isPinned ? <BookmarkRibbon /> : null}
              </div>

              {hasPost ? (
                <div className="diary-grid__cell-bottom">
                  <span className="diary-grid__word-count">{cell.wordCount.toLocaleString()} 字</span>
                </div>
              ) : (
                <div className="diary-grid__cell-empty-action" aria-hidden="true">
                  <span className="diary-grid__add-plus">+</span>
                </div>
              )}
              {hasPost ? (
                <div
                  ref={actionPath === cell.post?.path ? actionsRef : undefined}
                  className={`diary-grid__actions${actionPath === cell.post?.path ? ' is-open' : ''}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    className="diary-grid__actions-trigger"
                    aria-label={`日记 ${cell.dateStr} 的更多操作`}
                    aria-expanded={actionPath === cell.post?.path}
                    onClick={() => setActionPath((current) => current === cell.post?.path ? null : cell.post?.path || null)}
                  >
                    ⋯
                  </button>
                  {actionPath === cell.post?.path ? (
                    <div className="diary-grid__actions-menu" role="menu">
                      <button
                        type="button"
                        className="diary-grid__delete-action"
                        onClick={() => {
                          setActionPath(null)
                          onDeletePost(cell.post!)
                        }}
                      >
                        删除日记
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="diary-grid__legend-bar">
        <div className="diary-grid__legend-colors">
          <span style={{ backgroundColor: '#ebd9c6' }} />
          <span style={{ backgroundColor: '#e2b8a6' }} />
          <span style={{ backgroundColor: '#bac7bd' }} />
          <span style={{ backgroundColor: '#f3d8ae' }} />
          <span className="diary-grid__legend-text">有记录</span>
        </div>
        <span className="diary-grid__legend-hint">点击日期打开或补写日记</span>
      </div>
    </div>
  )
}
