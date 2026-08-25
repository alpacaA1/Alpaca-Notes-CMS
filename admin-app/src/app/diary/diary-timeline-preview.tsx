import { useMemo, useState } from 'react'
import type { PostIndexItem } from '../posts/post-types'
import { parseDiarySummaryFromMarkdown } from './diary-content-parser'
import { extractDateStrFromPost } from './diary-calendar-utils'

interface DiaryTimelinePreviewProps {
  posts: PostIndexItem[]
  onOpenPost: (post: PostIndexItem) => void
  onDeletePost: (post: PostIndexItem) => void
}

function formatWeekday(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) {
    return ''
  }
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return days[d.getDay()] || ''
}

function formatDayNumber(dateStr: string): string {
  const match = dateStr.match(/\d{4}-\d{2}-(\d{2})/)
  return match ? match[1] : dateStr.slice(-2)
}

export default function DiaryTimelinePreview({
  posts,
  onOpenPost,
  onDeletePost,
}: DiaryTimelinePreviewProps) {
  // Parse structured summaries for each post
  const itemsWithSummaries = useMemo(() => {
    return posts.map((post) => {
      const dateStr = extractDateStrFromPost(post)
      const content = post.body || post.desc || ''
      const summary = parseDiarySummaryFromMarkdown(content, post.desc || '')
      return {
        post,
        dateStr,
        dayNumber: formatDayNumber(dateStr),
        weekday: formatWeekday(dateStr),
        summary,
      }
    })
  }, [posts])

  // All entries start expanded; users may collapse individual dates to scan faster.
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set())
  const [actionPath, setActionPath] = useState<string | null>(null)

  return (
    <div className="diary-timeline" aria-label="日记时间线预览">
      {posts.length === 0 ? (
        <div className="diary-timeline__empty">
          <p>本月暂无日记记录</p>
        </div>
      ) : (
        itemsWithSummaries.map(({ post, dateStr, dayNumber, weekday, summary }) => {
          const isExpanded = !collapsedPaths.has(post.path)

          return (
          <div key={post.path} className={`diary-timeline__item${isExpanded ? ' is-expanded' : ''}`}>
            {/* Left date column & timeline track */}
            <div className="diary-timeline__date-col">
              <div className="diary-timeline__date-badge">
                <span className="diary-timeline__day-num">{dayNumber}</span>
                <span className="diary-timeline__weekday">{weekday}</span>
              </div>
              <div className="diary-timeline__track">
                <span className="diary-timeline__dot" />
                <span className="diary-timeline__line" />
              </div>
            </div>

            {/* Right card */}
            <div className="diary-timeline__card">
              {isExpanded ? (
                <div className="diary-timeline__card-expanded">
                  {/* Action Menu / Time Range */}
                  <div className="diary-timeline__card-header">
                    {summary.timeRangeStr ? (
                      <span className="diary-timeline__time-range">{summary.timeRangeStr}</span>
                    ) : <span />}
                    <DiaryActionMenu
                      post={post}
                      isOpen={actionPath === post.path}
                      onToggle={() => setActionPath((current) => current === post.path ? null : post.path)}
                      onDelete={() => {
                        setActionPath(null)
                        onDeletePost(post)
                      }}
                    />
                  </div>

                  {/* Structured Sections */}
                  <div className="diary-timeline__sections">
                    {summary.sections.map((sec, idx) => {
                      if (sec.type === 'emotion') {
                        return (
                          <div key={idx} className="diary-timeline__sec diary-timeline__sec--emotion">
                            <div className="diary-timeline__sec-icon">🔖</div>
                            <div className="diary-timeline__sec-body">
                              <div className="diary-timeline__sec-meta">
                                {sec.timeStr ? <span>{sec.timeStr} · </span> : null}
                                <span style={{ fontWeight: 600 }}>{sec.title}</span>
                                {sec.emotions?.map((emo) => (
                                  <span key={emo} className="diary-timeline__emotion-badge">
                                    {emo}
                                  </span>
                                ))}
                              </div>
                              <p className="diary-timeline__sec-text">{sec.event}</p>
                            </div>
                          </div>
                        )
                      }

                      if (sec.type === 'read-later') {
                        return (
                          <div key={idx} className="diary-timeline__sec diary-timeline__sec--quote">
                            <div className="diary-timeline__sec-icon">📄</div>
                            <div className="diary-timeline__sec-body">
                              <div className="diary-timeline__sec-meta">
                                {sec.timeStr ? <span>{sec.timeStr} · </span> : null}
                                <span style={{ fontWeight: 600 }}>待读摘录</span>
                              </div>
                              <blockquote className="diary-timeline__quote-text">{sec.quote}</blockquote>
                              {sec.source ? (
                                <p className="diary-timeline__quote-source">来源: {sec.source}</p>
                              ) : null}
                            </div>
                          </div>
                        )
                      }

                      return (
                        <div key={idx} className="diary-timeline__sec diary-timeline__sec--notes">
                          <div className="diary-timeline__sec-icon">✏️</div>
                          <div className="diary-timeline__sec-body">
                            <div className="diary-timeline__sec-meta">
                              <span style={{ fontWeight: 600 }}>{sec.title}</span>
                            </div>
                            <ul className="diary-timeline__notes-list">
                              {sec.items?.map((item, itemIdx) => (
                                <li key={itemIdx}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Actions */}
                  <div className="diary-timeline__card-footer">
                    <button
                      type="button"
                      className="diary-timeline__open-btn"
                      onClick={() => onOpenPost(post)}
                    >
                      查看完整日记 →
                    </button>
                    <button
                      type="button"
                      className="diary-timeline__collapse-btn"
                      onClick={() => setCollapsedPaths((current) => new Set(current).add(post.path))}
                    >
                      收起
                    </button>
                  </div>
                </div>
              ) : (
                /* Collapsed compact row */
                <div
                  className="diary-timeline__card-collapsed"
                  onClick={() => setExpandedPath(post.path)}
                >
                  <div className="diary-timeline__collapsed-left">
                    <p className="diary-timeline__collapsed-desc">
                      {post.title || post.desc || '日常记录'}
                    </p>
                  </div>
                  <div className="diary-timeline__collapsed-actions" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="diary-timeline__expand-btn"
                      onClick={() => setCollapsedPaths((current) => {
                        const next = new Set(current)
                        next.delete(post.path)
                        return next
                      })}
                    >
                      查看详情 →
                    </button>
                    <DiaryActionMenu
                      post={post}
                      isOpen={actionPath === post.path}
                      onToggle={() => setActionPath((current) => current === post.path ? null : post.path)}
                      onDelete={() => {
                        setActionPath(null)
                        onDeletePost(post)
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      }))}
    </div>
  )
}

function DiaryActionMenu({
  post,
  isOpen,
  onToggle,
  onDelete,
}: {
  post: PostIndexItem
  isOpen: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className="diary-timeline__actions">
      <button
        type="button"
        className="diary-timeline__actions-trigger"
        aria-label={`日记 ${post.title} 的更多操作`}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        ⋯
      </button>
      {isOpen ? (
        <div className="diary-timeline__actions-menu" role="menu">
          <button type="button" className="diary-timeline__delete-action" onClick={onDelete}>
            删除日记
          </button>
        </div>
      ) : null}
    </div>
  )
}
