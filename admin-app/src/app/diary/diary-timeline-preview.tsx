import { useMemo, useState } from 'react'
import type { PostIndexItem } from '../posts/post-types'
import { parseDiarySummaryFromMarkdown } from './diary-content-parser'
import { extractDateStrFromPost } from './diary-calendar-utils'
import type { DiaryReadLaterSourceGroup, DiaryStructuredSection } from './diary-view-types'

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

function renderTimelineInline(text: string) {
  const nodes: (string | JSX.Element)[] = []
  const pattern = /==([^=]+)==/g
  let lastIndex = 0
  let matchIndex = 0

  for (const match of text.matchAll(pattern)) {
    const [fullMatch, highlightText] = match
    const start = match.index || 0
    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start))
    }
    nodes.push(
      <mark key={`hl-${matchIndex++}`} className="preview-content__markdown-highlight">
        {highlightText}
      </mark>,
    )
    lastIndex = start + fullMatch.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : text
}

export function computeTimelineQuoteDisplay(
  groups: DiaryReadLaterSourceGroup[],
  isExpandedAll: boolean,
): {
  displayGroups: DiaryReadLaterSourceGroup[]
  hiddenQuotesCount: number
} {
  const totalQuotes = groups.reduce((acc, g) => acc + g.items.length, 0)
  if (isExpandedAll || groups.length === 0) {
    return {
      displayGroups: groups,
      hiddenQuotesCount: 0,
    }
  }

  const sourceCount = groups.length
  let displayGroups: DiaryReadLaterSourceGroup[] = []

  if (sourceCount === 1) {
    // 1 个来源：最多展示 4 条
    displayGroups = [{ ...groups[0], items: groups[0].items.slice(0, 4) }]
  } else if (sourceCount === 2) {
    // 2 个来源：每个最多展示 2 条
    displayGroups = groups.map((g) => ({ ...g, items: g.items.slice(0, 2) }))
  } else if (sourceCount === 3 || sourceCount === 4) {
    // 3–4 个来源：每个至少展示 1 条
    displayGroups = groups.map((g) => ({ ...g, items: g.items.slice(0, 1) }))
  } else {
    // 超过 4 个来源：先展示前 4 个来源（各 1 条）
    displayGroups = groups.slice(0, 4).map((g) => ({ ...g, items: g.items.slice(0, 1) }))
  }

  const visibleQuotes = displayGroups.reduce((acc, g) => acc + g.items.length, 0)
  const hiddenQuotesCount = Math.max(0, totalQuotes - visibleQuotes)

  return {
    displayGroups,
    hiddenQuotesCount,
  }
}

function groupTimelineSections(sections: DiaryStructuredSection[]): DiaryStructuredSection[][] {
  return sections.reduce<DiaryStructuredSection[][]>((groups, section) => {
    const previousGroup = groups.at(-1)
    if (section.type === 'read-later' && previousGroup?.[0]?.type === 'read-later') {
      previousGroup.push(section)
      return groups
    }

    groups.push([section])
    return groups
  }, [])
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

  // Card summary collapsed states
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set())
  // Read-later quote module internal expand/collapse states
  const [expandedQuotesPosts, setExpandedQuotesPosts] = useState<Set<string>>(() => new Set())
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
          const isQuotesExpanded = expandedQuotesPosts.has(post.path)

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
                    {/* Floating Action Menu (top right) */}
                    <div className="diary-timeline__actions-top">
                      <DiaryActionMenu
                        post={post}
                        isOpen={actionPath === post.path}
                        onToggle={() => setActionPath((current) => (current === post.path ? null : post.path))}
                        onDelete={() => {
                          setActionPath(null)
                          onDeletePost(post)
                        }}
                      />
                    </div>

                    {summary.timeRangeStr ? (
                      <div className="diary-timeline__time-range-badge">
                        <span>{summary.timeRangeStr}</span>
                      </div>
                    ) : null}

                    {/* Structured Sections */}
                    <div className="diary-timeline__sections">
                      {groupTimelineSections(summary.sections).map((sectionGroup, idx) => {
                        const sec = sectionGroup[0]
                        if (sec.type === 'emotion') {
                          return (
                            <div key={idx} className="diary-timeline__sec diary-timeline__sec--emotion">
                              <div className="diary-timeline__sec-icon">🔖</div>
                              <div className="diary-timeline__sec-body">
                                <div className="diary-timeline__sec-meta">
                                  <span className="diary-timeline__sec-title">{sec.title}</span>
                                  {sec.timeStr ? <span className="diary-timeline__sec-time">{sec.timeStr}</span> : null}
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
                          const allGroups = sec.groups && sec.groups.length > 0 ? sec.groups : (
                            sec.quote ? [{
                              sourceTitle: sec.source || '待读收录',
                              items: [{ id: 'q-1', quote: sec.quote, sourceTitle: sec.source || '待读收录', order: 1 }]
                            }] : []
                          )

                          const { displayGroups, hiddenQuotesCount } = computeTimelineQuoteDisplay(
                            allGroups,
                            isQuotesExpanded,
                          )

                          return (
                            <div key={idx} className="diary-timeline__sec diary-timeline__sec--quote">
                              <div className="diary-timeline__sec-icon">📄</div>
                              <div className="diary-timeline__sec-body">
                                <div className="diary-timeline__sec-meta">
                                  <span className="diary-timeline__sec-title">待读摘录</span>
                                  {sec.timeStr ? <span className="diary-timeline__sec-time">{sec.timeStr}</span> : null}
                                </div>
                                <div className="diary-timeline__quote-groups">
                                  {displayGroups.map((group, groupIdx) => (
                                    <div key={groupIdx} className="diary-timeline__quote-group">
                                      <div className="diary-timeline__quote-group-title">
                                        《{group.sourceTitle}》 · {group.items.length} 条
                                      </div>
                                      <div className="diary-timeline__quote-group-items">
                                        {group.items.map((item) => (
                                          <div key={item.id} className="diary-timeline__quote-item">
                                            <p
                                              className={`diary-timeline__quote-text${
                                                isQuotesExpanded ? ' diary-timeline__quote-text--full' : ''
                                              }`}
                                            >
                                              {renderTimelineInline(item.quote)}
                                            </p>
                                            {item.note ? (
                                              <div className="diary-timeline__quote-note">
                                                <span className="diary-timeline__quote-note-tag">💭 我的思考</span>
                                                <p className="diary-timeline__quote-note-text">
                                                  {renderTimelineInline(item.note)}
                                                </p>
                                              </div>
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                  {hiddenQuotesCount > 0 && !isQuotesExpanded ? (
                                    <button
                                      type="button"
                                      className="diary-timeline__quote-expand-btn"
                                      onClick={() =>
                                        setExpandedQuotesPosts((prev) => new Set(prev).add(post.path))
                                      }
                                    >
                                      还有 {hiddenQuotesCount} 条摘录 · 展开全部
                                    </button>
                                  ) : isQuotesExpanded && allGroups.reduce((a, g) => a + g.items.length, 0) > 2 ? (
                                    <button
                                      type="button"
                                      className="diary-timeline__quote-collapse-btn"
                                      onClick={() =>
                                        setExpandedQuotesPosts((prev) => {
                                          const next = new Set(prev)
                                          next.delete(post.path)
                                          return next
                                        })
                                      }
                                    >
                                      收起摘录
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div key={idx} className="diary-timeline__sec diary-timeline__sec--notes">
                            <div className="diary-timeline__sec-icon">✏️</div>
                            <div className="diary-timeline__sec-body">
                              <div className="diary-timeline__sec-meta">
                                <span className="diary-timeline__sec-title">{sec.title}</span>
                                {sec.timeStr ? <span className="diary-timeline__sec-time">{sec.timeStr}</span> : null}
                              </div>
                              <ul className="diary-timeline__notes-list">
                                {sec.items?.map((item, itemIdx) => (
                                  <li key={itemIdx}>{renderTimelineInline(item)}</li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    {/* Actions: 打开日记 → 与 折叠摘要 */}
                    <div className="diary-timeline__card-footer">
                      <button
                        type="button"
                        className="diary-timeline__open-btn"
                        onClick={() => onOpenPost(post)}
                      >
                        打开日记 →
                      </button>
                      <button
                        type="button"
                        className="diary-timeline__collapse-btn"
                        onClick={() => setCollapsedPaths((current) => new Set(current).add(post.path))}
                      >
                        折叠摘要
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Collapsed compact row */
                  <div
                    className="diary-timeline__card-collapsed"
                    onClick={() =>
                      setCollapsedPaths((current) => {
                        const next = new Set(current)
                        next.delete(post.path)
                        return next
                      })
                    }
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
                        onClick={() =>
                          setCollapsedPaths((current) => {
                            const next = new Set(current)
                            next.delete(post.path)
                            return next
                          })
                        }
                      >
                        展开摘要
                      </button>
                      <DiaryActionMenu
                        post={post}
                        isOpen={actionPath === post.path}
                        onToggle={() => setActionPath((current) => (current === post.path ? null : post.path))}
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
        })
      )}
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
    <div className="diary-timeline__actions" onClick={(e) => e.stopPropagation()}>
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
