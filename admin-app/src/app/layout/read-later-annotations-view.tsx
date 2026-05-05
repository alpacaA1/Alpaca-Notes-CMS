import { useEffect, useMemo, useState, type CSSProperties, type WheelEvent } from 'react'
import type { ReadLaterAnnotationIndexItem } from '../read-later/annotation-index'

type ReadLaterAnnotationsViewProps = {
  annotations: ReadLaterAnnotationIndexItem[]
  isLoading: boolean
  search: string
  onSearchChange?: (value: string) => void
  onOpenAnnotation: (annotation: ReadLaterAnnotationIndexItem) => void
}

const ALL_SOURCES = '__all_sources__'
const ALL_TAGS = '__all_tags__'
const MAX_VISIBLE_TAGS = 2
const DEFAULT_SORT = 'updated-desc'

type AnnotationSortOrder = 'updated-desc' | 'updated-asc' | 'source-asc' | 'note-desc'

const SORT_OPTIONS: Array<{ value: AnnotationSortOrder; label: string }> = [
  { value: 'updated-desc', label: '最新批注' },
  { value: 'updated-asc', label: '最早批注' },
  { value: 'source-asc', label: '来源文章 A-Z' },
  { value: 'note-desc', label: '有评论优先' },
]

function normalizeSearchText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function formatAnnotationDateTime(value: string, fallback: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return fallback.trim() || '时间未知'
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function getReadingStatusLabel(status: ReadLaterAnnotationIndexItem['readingStatus']) {
  return status === 'done' ? '已读' : status === 'reading' ? '在读' : '未读'
}

function getAnnotationQuoteText(quote: string) {
  return quote.trim() || '未命名高亮'
}

function getAnnotationNoteText(note: string) {
  return note.trim() || '暂未写评论'
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
  onSearchChange,
  onOpenAnnotation,
}: ReadLaterAnnotationsViewProps) {
  const [selectedSourcePath, setSelectedSourcePath] = useState(ALL_SOURCES)
  const [selectedTag, setSelectedTag] = useState(ALL_TAGS)
  const [sortOrder, setSortOrder] = useState<AnnotationSortOrder>(DEFAULT_SORT)
  const [isSourceRailCollapsed, setIsSourceRailCollapsed] = useState(false)
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null)

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

  const tagOptions = useMemo(
    () => Array.from(new Set(annotations.flatMap((annotation) => annotation.tags))).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
    [annotations],
  )

  useEffect(() => {
    if (selectedSourcePath !== ALL_SOURCES && !sourceOptions.some((option) => option.value === selectedSourcePath)) {
      setSelectedSourcePath(ALL_SOURCES)
    }
  }, [selectedSourcePath, sourceOptions])

  useEffect(() => {
    if (selectedTag !== ALL_TAGS && !tagOptions.includes(selectedTag)) {
      setSelectedTag(ALL_TAGS)
    }
  }, [selectedTag, tagOptions])

  const normalizedQuery = useMemo(() => normalizeSearchText(search), [search])

  const filteredAnnotations = useMemo(
    () =>
      annotations.filter((annotation) => {
        if (selectedSourcePath !== ALL_SOURCES && annotation.postPath !== selectedSourcePath) {
          return false
        }

        if (selectedTag !== ALL_TAGS && !annotation.tags.includes(selectedTag)) {
          return false
        }

        if (normalizedQuery && !annotation.searchText.includes(normalizedQuery)) {
          return false
        }

        return true
      }),
    [annotations, normalizedQuery, selectedSourcePath, selectedTag],
  )

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
      } else if (sortOrder === 'note-desc') {
        const leftHasNote = left.note.trim().length > 0 ? 1 : 0
        const rightHasNote = right.note.trim().length > 0 ? 1 : 0

        if (rightHasNote !== leftHasNote) {
          return rightHasNote - leftHasNote
        }

        if (rightTimestamp !== leftTimestamp) {
          return rightTimestamp - leftTimestamp
        }
      }

      return left.postTitle.localeCompare(right.postTitle, 'zh-Hans-CN')
    })

    return nextAnnotations
  }, [filteredAnnotations, sortOrder])

  useEffect(() => {
    if (selectedAnnotationId && !sortedAnnotations.some((annotation) => annotation.id === selectedAnnotationId)) {
      setSelectedAnnotationId(null)
    }
  }, [selectedAnnotationId, sortedAnnotations])

  useEffect(() => {
    if (!selectedAnnotationId) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedAnnotationId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedAnnotationId])

  const annotatedSourceCount = useMemo(
    () => new Set(annotations.map((annotation) => annotation.postPath)).size,
    [annotations],
  )
  const notedCount = useMemo(
    () => annotations.filter((annotation) => annotation.note.trim().length > 0).length,
    [annotations],
  )
  const hasActiveFilters = selectedSourcePath !== ALL_SOURCES || selectedTag !== ALL_TAGS || normalizedQuery.length > 0
  const searchSummary = search.trim()
  const selectedSourceOption = selectedSourcePath === ALL_SOURCES ? null : sourceOptions.find((option) => option.value === selectedSourcePath) || null
  const selectedAnnotation = sortedAnnotations.find((annotation) => annotation.id === selectedAnnotationId) || null
  const selectedSortLabel = SORT_OPTIONS.find((option) => option.value === sortOrder)?.label || '最新批注'
  const visibleColumnCount = Math.min(4, Math.max(sortedAnnotations.length, 1))
  const listStyle = useMemo<CSSProperties>(
    () => ({
      gridTemplateColumns: `repeat(${visibleColumnCount}, var(--annotation-card-width))`,
      width: `calc(${visibleColumnCount} * var(--annotation-card-width) + ${Math.max(visibleColumnCount - 1, 0)} * var(--annotation-grid-gap))`,
    }),
    [visibleColumnCount],
  )

  function handleListShellWheel(event: WheelEvent<HTMLElement>) {
    const currentTarget = event.currentTarget
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return
    }

    if (currentTarget.scrollWidth <= currentTarget.clientWidth + 1) {
      return
    }

    const maxScrollLeft = currentTarget.scrollWidth - currentTarget.clientWidth
    const nextScrollLeft = Math.max(0, Math.min(currentTarget.scrollLeft + event.deltaY, maxScrollLeft))

    if (nextScrollLeft === currentTarget.scrollLeft) {
      return
    }

    event.preventDefault()
    currentTarget.scrollLeft = nextScrollLeft
  }

  return (
    <section className="annotation-dashboard">
      <header className="annotation-dashboard__hero" aria-label="批注标题区">
        <h1 className="annotation-dashboard__hero-title">批注管理</h1>

        <dl className="annotation-dashboard__hero-stats" aria-label="批注统计">
          <div className="annotation-dashboard__hero-stat">
            <dt>批注</dt>
            <dd>{annotations.length}</dd>
          </div>
          <div className="annotation-dashboard__hero-stat">
            <dt>评论</dt>
            <dd>{notedCount}</dd>
          </div>
          <div className="annotation-dashboard__hero-stat">
            <dt>来源</dt>
            <dd>{annotatedSourceCount}</dd>
          </div>
        </dl>
      </header>

      <section className="annotation-dashboard__toolbar" aria-label="批注筛选工具栏">
        <div className="annotation-dashboard__toolbar-filters">
          <label className="annotation-dashboard__filter">
            <span>来源文章</span>
            <select value={selectedSourcePath} onChange={(event) => setSelectedSourcePath(event.target.value)}>
              <option value={ALL_SOURCES}>全部来源文章</option>
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="annotation-dashboard__filter">
            <span>标签</span>
            <select value={selectedTag} onChange={(event) => setSelectedTag(event.target.value)}>
              <option value={ALL_TAGS}>全部标签</option>
              {tagOptions.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>

          <label className="annotation-dashboard__filter">
            <span>排序规则</span>
            <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as AnnotationSortOrder)}>
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="annotation-dashboard__toolbar-meta">
          <span>当前结果 {sortedAnnotations.length} 条</span>
          {searchSummary ? <span title={searchSummary}>搜索：{searchSummary}</span> : null}
          {selectedSourceOption ? <span title={selectedSourceOption.label}>来源：{selectedSourceOption.label}</span> : null}
          {selectedTag !== ALL_TAGS ? <span>标签：{selectedTag}</span> : null}
          <span>排序：{selectedSortLabel}</span>
          {hasActiveFilters ? (
            <button
              type="button"
              className="annotation-dashboard__clear-btn"
              onClick={() => {
                setSelectedSourcePath(ALL_SOURCES)
                setSelectedTag(ALL_TAGS)
                onSearchChange?.('')
              }}
            >
              清空筛选
            </button>
          ) : null}
        </div>
      </section>

      {isLoading && annotations.length === 0 ? (
        <section className="annotation-dashboard__empty">
          <p className="annotation-dashboard__empty-title">正在聚合批注…</p>
          <p className="annotation-dashboard__empty-desc">会读取所有待读条目的高亮与评论。</p>
        </section>
      ) : null}

      {!isLoading && annotations.length === 0 ? (
        <section className="annotation-dashboard__empty">
          <p className="annotation-dashboard__empty-title">还没有批注</p>
          <p className="annotation-dashboard__empty-desc">先在待读预览里高亮文本并写下评论，这里就会自动聚合出来。</p>
        </section>
      ) : null}

      {!isLoading && annotations.length > 0 ? (
        <div className={`annotation-dashboard__content${isSourceRailCollapsed ? ' annotation-dashboard__content--rail-collapsed' : ''}`}>
          <aside
            className={`annotation-dashboard__source-rail${isSourceRailCollapsed ? ' is-collapsed' : ''}`}
            aria-label="批注文章列表"
          >
            <div className={`annotation-dashboard__source-rail-header${isSourceRailCollapsed ? ' is-collapsed' : ''}`}>
              {!isSourceRailCollapsed ? <span className="annotation-dashboard__source-rail-title">文章</span> : null}
              <button
                type="button"
                className="annotation-dashboard__source-rail-toggle"
                aria-label={isSourceRailCollapsed ? '展开文章栏' : '收起文章栏'}
                aria-expanded={!isSourceRailCollapsed}
                onClick={() => setIsSourceRailCollapsed((current) => !current)}
              >
                <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
                  <path d="M5.75 3.5 10.25 8l-4.5 4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
                </svg>
              </button>
            </div>

            {!isSourceRailCollapsed ? (
              <div className="annotation-dashboard__source-rail-body">
                <button
                  type="button"
                  className={`annotation-dashboard__source-item${selectedSourcePath === ALL_SOURCES ? ' is-active' : ''}`}
                  onClick={() => setSelectedSourcePath(ALL_SOURCES)}
                >
                  <span className="annotation-dashboard__source-item-title">全部文章</span>
                  <span className="annotation-dashboard__source-item-count">{annotatedSourceCount}</span>
                </button>

                <div className="annotation-dashboard__source-item-list">
                  {sourceOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`annotation-dashboard__source-item${selectedSourcePath === option.value ? ' is-active' : ''}`}
                      onClick={() => setSelectedSourcePath(option.value)}
                    >
                      <span className="annotation-dashboard__source-item-title" title={option.label}>
                        {option.label}
                      </span>
                      <span className="annotation-dashboard__source-item-count">{option.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          {sortedAnnotations.length > 0 ? (
            <section
              className="annotation-dashboard__list-shell"
              aria-label="批注列表区"
              onWheel={handleListShellWheel}
            >
              <div className="annotation-dashboard__list" aria-label="批注列表" style={listStyle}>
                {sortedAnnotations.map((annotation) => {
                  const visibleTags = annotation.tags.slice(0, MAX_VISIBLE_TAGS)
                  const hiddenTagCount = Math.max(0, annotation.tags.length - visibleTags.length)
                  const isSelected = annotation.id === selectedAnnotationId

                  return (
                    <article key={annotation.id} className={`annotation-dashboard__card${isSelected ? ' is-active' : ''}`}>
                      <button
                        type="button"
                        className="annotation-dashboard__card-trigger"
                        aria-controls="annotation-dashboard-detail"
                        aria-expanded={isSelected}
                        onClick={() => setSelectedAnnotationId(annotation.id)}
                      >
                        <header className="annotation-dashboard__card-head">
                          <div className="annotation-dashboard__card-head-row">
                            <span className="annotation-dashboard__section-pill">{annotation.sectionLabel}</span>
                            <span className="annotation-dashboard__time">
                              {formatAnnotationDateTime(annotation.updatedAt || annotation.createdAt, annotation.postDate)}
                            </span>
                          </div>

                          <div className="annotation-dashboard__card-head-row annotation-dashboard__card-head-row--actions">
                            <div className="annotation-dashboard__chips" aria-label="标签和状态">
                              <span className={`annotation-dashboard__status annotation-dashboard__status--${annotation.readingStatus}`}>
                                {getReadingStatusLabel(annotation.readingStatus)}
                              </span>
                              {visibleTags.map((tag) => (
                                <span key={`${annotation.id}-${tag}`} className="annotation-dashboard__tag">
                                  #{tag}
                                </span>
                              ))}
                              {hiddenTagCount > 0 ? (
                                <span className="annotation-dashboard__tag annotation-dashboard__tag--overflow">
                                  +{hiddenTagCount}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </header>

                        <section className="annotation-dashboard__quote-block" aria-label="原文摘录">
                          <span className="annotation-dashboard__label">原文摘录</span>
                          <blockquote className="annotation-dashboard__quote-text">
                            {getAnnotationQuoteText(annotation.quote)}
                          </blockquote>
                        </section>

                        <section className="annotation-dashboard__note-block" aria-label="评论内容">
                          <p className={!annotation.note.trim() ? 'annotation-dashboard__note-text annotation-dashboard__note-text--empty' : 'annotation-dashboard__note-text'}>
                            {getAnnotationNoteText(annotation.note)}
                          </p>
                        </section>

                        <footer className="annotation-dashboard__source-block">
                          <div className="annotation-dashboard__source-header">
                            <span className="annotation-dashboard__source-icon" aria-hidden="true">
                              <svg viewBox="0 0 16 16" focusable="false">
                                <path d="M4.5 6.5C4.5 4.82 5.46 3.46 7.38 2.4l.62.82c-1.1.71-1.68 1.48-1.76 2.32h1.84v3.7H4.5V6.5Zm5.3 0c0-1.68.96-3.04 2.88-4.1l.62.82c-1.1.71-1.69 1.48-1.76 2.32h1.84v3.7H9.8V6.5Z" fill="currentColor" />
                              </svg>
                            </span>
                            <span className="annotation-dashboard__label">来源文章</span>
                          </div>
                          <p className="annotation-dashboard__source-title">{annotation.postTitle}</p>
                        </footer>
                      </button>

                      <button
                        type="button"
                        className="annotation-dashboard__icon-btn"
                        aria-label={`打开原文：${annotation.postTitle}`}
                        title="打开原文"
                        onClick={() => {
                          setSelectedAnnotationId(annotation.id)
                          onOpenAnnotation(annotation)
                        }}
                      >
                        <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
                          <path d="M9.5 3H13v3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                          <path d="M12.75 3.25 7.5 8.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                          <path d="M11.5 8.5v3a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                        </svg>
                      </button>
                    </article>
                  )
                })}
              </div>
            </section>
          ) : (
            <section className="annotation-dashboard__empty annotation-dashboard__empty--inline">
              <p className="annotation-dashboard__empty-title">没有匹配的批注</p>
              <p className="annotation-dashboard__empty-desc">可以换个关键词，或者清空来源文章与标签筛选。</p>
            </section>
          )}

          {selectedAnnotation ? (
            <div className="annotation-dashboard__detail-layer">
              <button
                type="button"
                className="annotation-dashboard__detail-backdrop"
                aria-label="关闭批注详情"
                onClick={() => setSelectedAnnotationId(null)}
              />

              <aside
                id="annotation-dashboard-detail"
                className="annotation-dashboard__detail"
                role="dialog"
                aria-label="批注详情"
                aria-modal="false"
              >
                <header className="annotation-dashboard__detail-head">
                  <div className="annotation-dashboard__detail-head-main">
                    <p className="annotation-dashboard__detail-kicker">批注详情</p>
                    <h2 className="annotation-dashboard__detail-title">{selectedAnnotation.postTitle}</h2>
                    <p className="annotation-dashboard__detail-meta">
                      {selectedAnnotation.sectionLabel} · {getReadingStatusLabel(selectedAnnotation.readingStatus)} · {formatAnnotationDateTime(selectedAnnotation.updatedAt || selectedAnnotation.createdAt, selectedAnnotation.postDate)}
                    </p>
                  </div>

                  <div className="annotation-dashboard__detail-head-actions">
                    <button
                      type="button"
                      className="annotation-dashboard__open-btn"
                      onClick={() => onOpenAnnotation(selectedAnnotation)}
                    >
                      打开原文
                    </button>

                    <button
                      type="button"
                      className="annotation-dashboard__detail-close-btn"
                      aria-label="关闭详情"
                      onClick={() => setSelectedAnnotationId(null)}
                    >
                      <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
                        <path d="M4 4 12 12M12 4 4 12" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
                      </svg>
                    </button>
                  </div>
                </header>

                <div className="annotation-dashboard__detail-body">
                  <section className="annotation-dashboard__detail-section" aria-label="完整摘录">
                    <span className="annotation-dashboard__label">完整摘录</span>
                    <blockquote className="annotation-dashboard__detail-quote">
                      {getAnnotationQuoteText(selectedAnnotation.quote)}
                    </blockquote>
                  </section>

                  <section className="annotation-dashboard__detail-section" aria-label="完整评论">
                    <span className="annotation-dashboard__label">完整评论</span>
                    <p className={!selectedAnnotation.note.trim() ? 'annotation-dashboard__detail-text annotation-dashboard__detail-text--empty' : 'annotation-dashboard__detail-text'}>
                      {getAnnotationNoteText(selectedAnnotation.note)}
                    </p>
                  </section>

                  <section className="annotation-dashboard__detail-section" aria-label="来源文章">
                    <span className="annotation-dashboard__label">来源文章</span>
                    <p className="annotation-dashboard__detail-source-title">{selectedAnnotation.postTitle}</p>
                    {selectedAnnotation.sourceName ? (
                      <p className="annotation-dashboard__detail-source-meta">{selectedAnnotation.sourceName}</p>
                    ) : null}
                  </section>

                  <section className="annotation-dashboard__detail-section" aria-label="上下文片段">
                    <span className="annotation-dashboard__label">上下文片段</span>
                    <p className="annotation-dashboard__detail-context">
                      {selectedAnnotation.prefix}
                      <mark className="annotation-dashboard__detail-context-highlight">
                        {getAnnotationQuoteText(selectedAnnotation.quote)}
                      </mark>
                      {selectedAnnotation.suffix}
                    </p>
                  </section>
                </div>
              </aside>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
