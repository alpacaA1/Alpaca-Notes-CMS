import { useEffect, useMemo, useState } from 'react'
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

export default function ReadLaterAnnotationsView({
  annotations,
  isLoading,
  search,
  onSearchChange,
  onOpenAnnotation,
}: ReadLaterAnnotationsViewProps) {
  const [selectedSourcePath, setSelectedSourcePath] = useState(ALL_SOURCES)
  const [selectedTag, setSelectedTag] = useState(ALL_TAGS)

  const sourceOptions = useMemo(() => {
    const deduped = new Map<string, { value: string; label: string }>()

    annotations.forEach((annotation) => {
      if (!deduped.has(annotation.postPath)) {
        deduped.set(annotation.postPath, {
          value: annotation.postPath,
          label: annotation.postTitle,
        })
      }
    })

    return Array.from(deduped.values()).sort((left, right) => left.label.localeCompare(right.label, 'zh-Hans-CN'))
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
        </div>

        <div className="annotation-dashboard__toolbar-meta">
          <span>当前结果 {filteredAnnotations.length} 条</span>
          {searchSummary ? <span title={searchSummary}>搜索：{searchSummary}</span> : null}
          {selectedSourcePath !== ALL_SOURCES ? <span>已筛来源</span> : null}
          {selectedTag !== ALL_TAGS ? <span>已筛标签</span> : null}
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

      {!isLoading && annotations.length > 0 && filteredAnnotations.length === 0 ? (
        <section className="annotation-dashboard__empty">
          <p className="annotation-dashboard__empty-title">没有匹配的批注</p>
          <p className="annotation-dashboard__empty-desc">可以换个关键词，或者清空来源文章与标签筛选。</p>
        </section>
      ) : null}

      {filteredAnnotations.length > 0 ? (
        <section className="annotation-dashboard__list-shell" aria-label="批注列表区">
          <div className="annotation-dashboard__list" aria-label="批注列表">
            {filteredAnnotations.map((annotation) => {
              const visibleTags = annotation.tags.slice(0, MAX_VISIBLE_TAGS)
              const hiddenTagCount = Math.max(0, annotation.tags.length - visibleTags.length)

              return (
                <article key={annotation.id} className="annotation-dashboard__card">
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

                      <button
                        type="button"
                        className="annotation-dashboard__open-btn"
                        onClick={() => onOpenAnnotation(annotation)}
                      >
                        跳回原文
                      </button>
                    </div>
                  </header>

                  <section className="annotation-dashboard__quote-block" aria-label="原文摘录">
                    <span className="annotation-dashboard__label">原文摘录</span>
                    <blockquote className="annotation-dashboard__quote-text">
                      {annotation.quote.trim() || '未命名高亮'}
                    </blockquote>
                  </section>

                  <section className="annotation-dashboard__note-block" aria-label="我的评论">
                    <span className="annotation-dashboard__label">我的评论</span>
                    <p className={!annotation.note.trim() ? 'annotation-dashboard__note-text annotation-dashboard__note-text--empty' : 'annotation-dashboard__note-text'}>
                      {annotation.note.trim() || '暂未写评论'}
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
                    <p className="annotation-dashboard__source-meta">{annotation.sourceName?.trim() || '作者未记录'}</p>
                  </footer>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}
    </section>
  )
}
