import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { ReadLaterAnnotationIndexItem } from '../read-later/annotation-index'
import FilterSelect from './filter-select'

export type CommentFilterStatus = 'all' | 'has-note' | 'no-note'
export type AnnotationSortOrder = 'updated-desc' | 'updated-asc' | 'source-asc'

type ReadLaterAnnotationsViewProps = {
  annotations: ReadLaterAnnotationIndexItem[]
  isLoading: boolean
  search: string
  onSearchChange?: (value: string) => void
  onOpenAnnotation: (annotation: ReadLaterAnnotationIndexItem) => void
  onQuoteAnnotationToDiary?: (annotation: ReadLaterAnnotationIndexItem) => void
  onSaveAnnotationComment?: (annotation: ReadLaterAnnotationIndexItem, note: string) => Promise<void> | void
}

const ALL_SOURCES = '__all_sources__'
const STORAGE_KEY_COMMENT_STATUS = 'alpaca-annotations-filter-comment-status'
const STORAGE_KEY_SORT_ORDER = 'alpaca-annotations-sort-order'

const COMMENT_STATUS_OPTIONS = [
  { value: 'all', label: '全部' },
  { value: 'has-note', label: '有评论' },
  { value: 'no-note', label: '无评论' },
]

const SORT_OPTIONS: Array<{ value: AnnotationSortOrder; label: string }> = [
  { value: 'updated-desc', label: '最近批注' },
  { value: 'updated-asc', label: '最早批注' },
  { value: 'source-asc', label: '按来源文章排序' },
]

function readStoredPreference<T extends string>(key: string, fallback: T, validValues: string[]): T {
  try {
    const stored = window.localStorage.getItem(key)
    if (stored && validValues.includes(stored)) {
      return stored as T
    }
  } catch {
    // Ignore localStorage errors
  }
  return fallback
}

function savePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Ignore localStorage errors
  }
}

function normalizeSearchText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function getAnnotationQuoteText(quote: string) {
  return quote.trim() || '未命名高亮'
}

function getAnnotationTimestamp(annotation: ReadLaterAnnotationIndexItem) {
  const candidates = [annotation.updatedAt, annotation.createdAt, annotation.postDate]

  for (const candidate of candidates) {
    const timestamp = Date.parse(candidate)
    if (!Number.isNaN(timestamp)) {
      return timestamp
    }
  }

  return 0
}

export default function ReadLaterAnnotationsView({
  annotations,
  isLoading,
  search,
  onOpenAnnotation,
  onQuoteAnnotationToDiary,
  onSaveAnnotationComment,
}: ReadLaterAnnotationsViewProps) {
  const [selectedSourcePath, setSelectedSourcePath] = useState(ALL_SOURCES)
  const [sourceSearch, setSourceSearch] = useState('')
  const [commentStatus, setCommentStatus] = useState<CommentFilterStatus>(() =>
    readStoredPreference(STORAGE_KEY_COMMENT_STATUS, 'all', ['all', 'has-note', 'no-note']),
  )
  const [sortOrder, setSortOrder] = useState<AnnotationSortOrder>(() =>
    readStoredPreference(STORAGE_KEY_SORT_ORDER, 'updated-desc', ['updated-desc', 'updated-asc', 'source-asc']),
  )
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [isSavingComment, setIsSavingComment] = useState(false)
  const [pendingAnnotationId, setPendingAnnotationId] = useState<string | null>(null)
  const [showUnsavedPrompt, setShowUnsavedPrompt] = useState(false)

  const commentTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Deduplicate and count annotations per source
  const sourceOptions = useMemo(() => {
    const deduped = new Map<string, { value: string; label: string; count: number; latestTimestamp: number }>()

    annotations.forEach((annotation) => {
      if (!deduped.has(annotation.postPath)) {
        deduped.set(annotation.postPath, {
          value: annotation.postPath,
          label: annotation.postTitle,
          count: 0,
          latestTimestamp: 0,
        })
      }

      const current = deduped.get(annotation.postPath)
      if (!current) {
        return
      }

      current.count += 1
      current.latestTimestamp = Math.max(current.latestTimestamp, getAnnotationTimestamp(annotation))
    })

    return Array.from(deduped.values()).sort((left, right) => {
      if (right.latestTimestamp !== left.latestTimestamp) {
        return right.latestTimestamp - left.latestTimestamp
      }

      return left.label.localeCompare(right.label, 'zh-Hans-CN')
    })
  }, [annotations])

  // Filter sources by sourceSearch query
  const filteredSourceOptions = useMemo(() => {
    const query = normalizeSearchText(sourceSearch)
    if (!query) {
      return sourceOptions
    }
    return sourceOptions.filter((option) =>
      option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query),
    )
  }, [sourceOptions, sourceSearch])

  // Reset selected source if invalid
  useEffect(() => {
    if (selectedSourcePath !== ALL_SOURCES && !sourceOptions.some((option) => option.value === selectedSourcePath)) {
      setSelectedSourcePath(ALL_SOURCES)
    }
  }, [selectedSourcePath, sourceOptions])

  const normalizedQuery = useMemo(() => normalizeSearchText(search), [search])

  // Filter annotations
  const filteredAnnotations = useMemo(
    () =>
      annotations.filter((annotation) => {
        if (selectedSourcePath !== ALL_SOURCES && annotation.postPath !== selectedSourcePath) {
          return false
        }

        const hasNote = annotation.note.trim().length > 0
        if (commentStatus === 'has-note' && !hasNote) {
          return false
        }
        if (commentStatus === 'no-note' && hasNote) {
          return false
        }

        if (normalizedQuery && !annotation.searchText.includes(normalizedQuery)) {
          return false
        }

        return true
      }),
    [annotations, commentStatus, normalizedQuery, selectedSourcePath],
  )

  // Sort annotations
  const sortedAnnotations = useMemo(() => {
    const nextAnnotations = [...filteredAnnotations]

    nextAnnotations.sort((left, right) => {
      const leftTimestamp = getAnnotationTimestamp(left)
      const rightTimestamp = getAnnotationTimestamp(right)

      if (sortOrder === 'updated-desc') {
        if (rightTimestamp !== leftTimestamp) {
          return rightTimestamp - leftTimestamp
        }
      } else if (sortOrder === 'updated-asc') {
        if (leftTimestamp !== rightTimestamp) {
          return leftTimestamp - rightTimestamp
        }
      } else if (sortOrder === 'source-asc') {
        const bySource = left.postTitle.localeCompare(right.postTitle, 'zh-Hans-CN')
        if (bySource !== 0) {
          return bySource
        }
        if (rightTimestamp !== leftTimestamp) {
          return rightTimestamp - leftTimestamp
        }
      }

      return left.postTitle.localeCompare(right.postTitle, 'zh-Hans-CN')
    })

    return nextAnnotations
  }, [filteredAnnotations, sortOrder])

  // Find currently selected annotation
  const selectedAnnotation = useMemo(
    () => sortedAnnotations.find((item) => item.id === selectedAnnotationId) || null,
    [selectedAnnotationId, sortedAnnotations],
  )

  // Automatically ensure a selection if none is active or selected was filtered out
  useEffect(() => {
    if (sortedAnnotations.length === 0) {
      if (selectedAnnotationId !== null) {
        setSelectedAnnotationId(null)
      }
      return
    }

    if (!selectedAnnotationId || !sortedAnnotations.some((item) => item.id === selectedAnnotationId)) {
      setSelectedAnnotationId(sortedAnnotations[0].id)
    }
  }, [selectedAnnotationId, sortedAnnotations])

  // Sync note draft whenever selected annotation changes
  useEffect(() => {
    if (selectedAnnotation) {
      setNoteDraft(selectedAnnotation.note || '')
    } else {
      setNoteDraft('')
    }
  }, [selectedAnnotation?.id, selectedAnnotation?.note])

  // Auto resize comment textarea
  useEffect(() => {
    if (commentTextareaRef.current) {
      commentTextareaRef.current.style.height = 'auto'
      const nextHeight = Math.min(Math.max(commentTextareaRef.current.scrollHeight, 76), 220)
      commentTextareaRef.current.style.height = `${nextHeight}px`
    }
  }, [noteDraft])

  // Check if comment is modified
  const isCommentDirty = useMemo(() => {
    if (!selectedAnnotation) return false
    return noteDraft.trim() !== (selectedAnnotation.note || '').trim()
  }, [noteDraft, selectedAnnotation])

  // Handlers for comment filter & sort order
  const handleCommentStatusChange = (status: string) => {
    const nextStatus = status as CommentFilterStatus
    setCommentStatus(nextStatus)
    savePreference(STORAGE_KEY_COMMENT_STATUS, nextStatus)
  }

  const handleSortOrderChange = (order: string) => {
    const nextOrder = order as AnnotationSortOrder
    setSortOrder(nextOrder)
    savePreference(STORAGE_KEY_SORT_ORDER, nextOrder)
  }

  // Safe navigation with unsaved change check
  const requestSelectAnnotation = (targetId: string) => {
    if (targetId === selectedAnnotationId) return

    if (isCommentDirty) {
      setPendingAnnotationId(targetId)
      setShowUnsavedPrompt(true)
      return
    }

    setSelectedAnnotationId(targetId)
  }

  const handleConfirmDiscard = () => {
    setShowUnsavedPrompt(false)
    if (pendingAnnotationId) {
      setSelectedAnnotationId(pendingAnnotationId)
      setPendingAnnotationId(null)
    }
  }

  const handleCancelDiscard = () => {
    setShowUnsavedPrompt(false)
    setPendingAnnotationId(null)
  }

  // Current index in sortedAnnotations
  const currentIndex = useMemo(() => {
    if (!selectedAnnotationId) return -1
    return sortedAnnotations.findIndex((item) => item.id === selectedAnnotationId)
  }, [selectedAnnotationId, sortedAnnotations])

  const handlePrev = () => {
    if (currentIndex > 0) {
      requestSelectAnnotation(sortedAnnotations[currentIndex - 1].id)
    }
  }

  const handleNext = () => {
    if (currentIndex >= 0 && currentIndex < sortedAnnotations.length - 1) {
      requestSelectAnnotation(sortedAnnotations[currentIndex + 1].id)
    }
  }

  // Save comment handler
  const handleSaveComment = async () => {
    if (!selectedAnnotation) return

    setIsSavingComment(true)
    try {
      if (onSaveAnnotationComment) {
        await onSaveAnnotationComment(selectedAnnotation, noteDraft.trim())
      }
      // Update selectedAnnotation in-place
      selectedAnnotation.note = noteDraft.trim()
    } catch {
      // Handled by parent or toast
    } finally {
      setIsSavingComment(false)
    }
  }

  const handleCancelComment = () => {
    if (selectedAnnotation) {
      setNoteDraft(selectedAnnotation.note || '')
    }
  }

  const totalSourcesCount = sourceOptions.length
  const totalAnnotationsCount = annotations.length

  return (
    <div className="annotation-dashboard">
      {/* Top Header */}
      <header className="annotation-dashboard__top-header">
        <h1 className="annotation-dashboard__title">批注管理</h1>
        <span className="annotation-dashboard__title-stats">
          {totalAnnotationsCount} 条批注 · 来自 {totalSourcesCount} 篇文章
        </span>
      </header>

      {/* Main 3-Column Workspace */}
      <div className="annotation-dashboard__layout">
        {/* Left Column: 来源文章 */}
        <aside className="annotation-dashboard__col-sources" aria-label="来源文章列表">
          <div className="annotation-dashboard__sources-header">
            <h2 className="annotation-dashboard__col-title">来源文章</h2>
            <div className="annotation-dashboard__sources-search-wrap">
              <svg className="annotation-dashboard__sources-search-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <circle cx="7" cy="7" r="4.5" strokeWidth="1.5" />
                <line x1="10.5" y1="10.5" x2="14" y2="14" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                className="annotation-dashboard__sources-search-input"
                placeholder="搜索文章"
                value={sourceSearch}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSourceSearch(e.target.value)}
              />
              {sourceSearch ? (
                <button
                  type="button"
                  className="annotation-dashboard__sources-search-clear"
                  onClick={() => setSourceSearch('')}
                  aria-label="清空搜索"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>

          <div className="annotation-dashboard__sources-list">
            <button
              type="button"
              className={`annotation-dashboard__source-row${selectedSourcePath === ALL_SOURCES ? ' is-active' : ''}`}
              onClick={() => setSelectedSourcePath(ALL_SOURCES)}
            >
              <span className="annotation-dashboard__source-icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 2.5h7l3 3V13.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
                  <path d="M10 2.5v3h3" />
                  <line x1="4.5" y1="8" x2="11.5" y2="8" />
                  <line x1="4.5" y1="11" x2="9.5" y2="11" />
                </svg>
              </span>
              <span className="annotation-dashboard__source-name">全部来源</span>
              <span className="annotation-dashboard__source-badge">{totalSourcesCount}</span>
            </button>

            {filteredSourceOptions.map((source) => {
              const isActive = selectedSourcePath === source.value
              return (
                <button
                  key={source.value}
                  type="button"
                  className={`annotation-dashboard__source-row${isActive ? ' is-active' : ''}`}
                  onClick={() => setSelectedSourcePath(source.value)}
                  title={source.label}
                >
                  <span className="annotation-dashboard__source-icon" aria-hidden="true">
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 2.5h7l3 3V13.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
                      <path d="M10 2.5v3h3" />
                      <line x1="4.5" y1="8" x2="11.5" y2="8" />
                      <line x1="4.5" y1="11" x2="9.5" y2="11" />
                    </svg>
                  </span>
                  <span className="annotation-dashboard__source-name">{source.label}</span>
                  <span className="annotation-dashboard__source-badge">{source.count}</span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* Middle Column: 批注列表 */}
        <section className="annotation-dashboard__col-list" aria-label="批注列表区">
          <div className="annotation-dashboard__list-controls">
            <div className="annotation-dashboard__list-filters">
              <div className="annotation-dashboard__select-wrap">
                <span className="annotation-dashboard__select-prefix">评论状态</span>
                <FilterSelect
                  label="评论状态"
                  value={commentStatus}
                  options={COMMENT_STATUS_OPTIONS}
                  onChange={handleCommentStatusChange}
                />
              </div>

              <div className="annotation-dashboard__select-wrap">
                <span className="annotation-dashboard__select-prefix">排序</span>
                <FilterSelect
                  label="排序规则"
                  value={sortOrder}
                  options={SORT_OPTIONS}
                  onChange={handleSortOrderChange}
                />
              </div>
            </div>

            <div className="annotation-dashboard__list-count">
              {sortedAnnotations.length} 条
            </div>
          </div>

          <div className="annotation-dashboard__items-scroll" aria-label="批注列表">
            {isLoading && annotations.length === 0 ? (
              <div className="annotation-dashboard__state-empty">
                <p className="annotation-dashboard__empty-text">正在聚合批注…</p>
              </div>
            ) : sortedAnnotations.length === 0 ? (
              <div className="annotation-dashboard__state-empty">
                <p className="annotation-dashboard__empty-text">没有匹配的批注</p>
                <p className="annotation-dashboard__empty-sub">可以调整筛选条件或搜索关键词</p>
              </div>
            ) : (
              sortedAnnotations.map((annotation) => {
                const isSelected = annotation.id === selectedAnnotationId
                const hasComment = annotation.note.trim().length > 0

                return (
                  <article
                    key={annotation.id}
                    className={`annotation-dashboard__item-card${isSelected ? ' is-selected' : ''}`}
                    onClick={() => requestSelectAnnotation(annotation.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        requestSelectAnnotation(annotation.id)
                      }
                    }}
                  >
                    <div className="annotation-dashboard__item-main">
                      <p className="annotation-dashboard__item-quote">
                        {getAnnotationQuoteText(annotation.quote)}
                      </p>
                      <div className="annotation-dashboard__item-meta">
                        <span className="annotation-dashboard__item-source">{annotation.postTitle}</span>
                        {hasComment ? (
                          <span className="annotation-dashboard__item-has-comment">
                            <svg className="annotation-dashboard__comment-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M2.5 3.5h11a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H5.5l-3 2.5v-9.5a1 1 0 0 1 1-1Z" />
                            </svg>
                            已有评论
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <span className="annotation-dashboard__item-chevron" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M6 3.5l4.5 4.5-4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </article>
                )
              })
            )}
          </div>
        </section>

        {/* Right Column: 批注详情与评论编辑区 */}
        <section className="annotation-dashboard__col-detail" aria-label="批注详情与评论">
          {selectedAnnotation ? (
            <div className="annotation-dashboard__detail-pane">
              {/* Detail Header */}
              <div className="annotation-dashboard__detail-header">
                <h2 className="annotation-dashboard__detail-title">批注详情</h2>
                <div className="annotation-dashboard__detail-actions">
                  {onQuoteAnnotationToDiary ? (
                    <button
                      type="button"
                      className="annotation-dashboard__quote-diary-btn"
                      onClick={() => onQuoteAnnotationToDiary(selectedAnnotation)}
                    >
                      引用到今日日记
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="annotation-dashboard__open-original-btn"
                    onClick={() => onOpenAnnotation(selectedAnnotation)}
                  >
                    <span>打开原文</span>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M6.5 3.5H12.5V9.5" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M12.5 3.5L6 10" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M10.5 9.5V12.5a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h3" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Scrollable Detail Body */}
              <div className="annotation-dashboard__detail-body">
                {/* 完整摘录 */}
                <div className="annotation-dashboard__detail-card">
                  <h3 className="annotation-dashboard__detail-section-title">完整摘录</h3>
                  <div className="annotation-dashboard__detail-quote-box">
                    <p className="annotation-dashboard__detail-quote-text">
                      {getAnnotationQuoteText(selectedAnnotation.quote)}
                    </p>
                  </div>
                </div>

                {/* 我的评论 */}
                <div className="annotation-dashboard__detail-card">
                  <h3 className="annotation-dashboard__detail-section-title">我的评论</h3>
                  <div className="annotation-dashboard__comment-editor">
                    <textarea
                      ref={commentTextareaRef}
                      className="annotation-dashboard__comment-textarea"
                      placeholder="写下你的想法..."
                      value={noteDraft}
                      rows={3}
                      onChange={(e) => setNoteDraft(e.target.value)}
                    />
                    <div className="annotation-dashboard__comment-editor-footer">
                      <span className="annotation-dashboard__comment-counter">
                        {noteDraft.length}/500
                      </span>
                      <div className="annotation-dashboard__comment-actions">
                        <button
                          type="button"
                          className="annotation-dashboard__comment-cancel-btn"
                          onClick={handleCancelComment}
                          disabled={!isCommentDirty || isSavingComment}
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          className="annotation-dashboard__comment-save-btn"
                          onClick={() => { void handleSaveComment() }}
                          disabled={!isCommentDirty || isSavingComment}
                        >
                          {isSavingComment ? '保存中…' : '保存评论'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 上下文：仅在存在 prefix 或 suffix 时展示，只有摘录本身时隐藏整个区块 */}
                {Boolean((selectedAnnotation.prefix && selectedAnnotation.prefix.trim().length > 0) || (selectedAnnotation.suffix && selectedAnnotation.suffix.trim().length > 0)) ? (
                  <div className="annotation-dashboard__detail-card">
                    <h3 className="annotation-dashboard__detail-section-title">上下文</h3>
                    <div className="annotation-dashboard__context-box">
                      <p className="annotation-dashboard__context-content">
                        {selectedAnnotation.prefix ? <span>{selectedAnnotation.prefix}</span> : null}
                        <mark className="annotation-dashboard__context-mark">
                          {getAnnotationQuoteText(selectedAnnotation.quote)}
                        </mark>
                        {selectedAnnotation.suffix ? <span>{selectedAnnotation.suffix}</span> : null}
                      </p>
                      <div className="annotation-dashboard__context-footer">
                        <span className="annotation-dashboard__context-location">
                          {selectedAnnotation.postTitle} · 位置 {selectedAnnotation.sectionLabel || '批注'}
                        </span>
                        <button
                          type="button"
                          className="annotation-dashboard__context-add-note-btn"
                          onClick={() => commentTextareaRef.current?.focus()}
                        >
                          添加笔记 ✎
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Bottom Navigation (连续浏览) */}
              <footer className="annotation-dashboard__detail-nav">
                <button
                  type="button"
                  className="annotation-dashboard__nav-btn"
                  onClick={handlePrev}
                  disabled={currentIndex <= 0}
                >
                  ‹ 上一条
                </button>
                <span className="annotation-dashboard__nav-position">
                  {currentIndex >= 0 ? `${currentIndex + 1} / ${sortedAnnotations.length}` : '0 / 0'}
                </span>
                <button
                  type="button"
                  className="annotation-dashboard__nav-btn"
                  onClick={handleNext}
                  disabled={currentIndex < 0 || currentIndex >= sortedAnnotations.length - 1}
                >
                  下一条 ›
                </button>
              </footer>
            </div>
          ) : (
            <div className="annotation-dashboard__detail-placeholder">
              <p>请在左侧选择一条批注进行查看或评论</p>
            </div>
          )}
        </section>
      </div>

      {/* Unsaved Comment Confirmation Prompt */}
      {showUnsavedPrompt ? (
        <div className="annotation-dashboard__prompt-overlay" role="dialog" aria-modal="true">
          <div className="annotation-dashboard__prompt-dialog">
            <h3 className="annotation-dashboard__prompt-title">评论尚未保存</h3>
            <p className="annotation-dashboard__prompt-desc">切换批注将丢失当前未保存的评论修改，是否放弃修改？</p>
            <div className="annotation-dashboard__prompt-actions">
              <button
                type="button"
                className="annotation-dashboard__prompt-btn annotation-dashboard__prompt-btn--cancel"
                onClick={handleCancelDiscard}
              >
                继续编辑
              </button>
              <button
                type="button"
                className="annotation-dashboard__prompt-btn annotation-dashboard__prompt-btn--danger"
                onClick={handleConfirmDiscard}
              >
                放弃修改
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
