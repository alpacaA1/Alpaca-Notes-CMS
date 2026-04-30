import { useEffect, useMemo, useState } from 'react'
import type { ReadLaterAnnotationIndexItem } from '../read-later/annotation-index'

type ReadLaterAnnotationsViewProps = {
  annotations: ReadLaterAnnotationIndexItem[]
  isLoading: boolean
  search: string
  onOpenAnnotation: (annotation: ReadLaterAnnotationIndexItem) => void
}

const ALL_SOURCES = '__all_sources__'
const ALL_TAGS = '__all_tags__'

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

export default function ReadLaterAnnotationsView({
  annotations,
  isLoading,
  search,
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

  return (
    <section className="annotation-dashboard">
      <header className="annotation-dashboard__hero">
        <div className="annotation-dashboard__hero-copy">
          <p className="annotation-dashboard__eyebrow">批注视图</p>
          <h1>先整理素材，再决定写什么。</h1>
        </div>
        <div className="annotation-dashboard__stats" aria-label="批注统计">
          <article className="annotation-dashboard__stat-card">
            <span>批注</span>
            <strong>{annotations.length}</strong>
          </article>
          <article className="annotation-dashboard__stat-card">
            <span>评论</span>
            <strong>{notedCount}</strong>
          </article>
          <article className="annotation-dashboard__stat-card">
            <span>来源</span>
            <strong>{annotatedSourceCount}</strong>
          </article>
        </div>
      </header>

      <section className="annotation-dashboard__toolbar" aria-label="批注筛选工具栏">
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

        <div className="annotation-dashboard__toolbar-meta">
          <span>当前结果 {filteredAnnotations.length} 条</span>
          {hasActiveFilters ? (
            <button
              type="button"
              className="annotation-dashboard__clear-btn"
              onClick={() => {
                setSelectedSourcePath(ALL_SOURCES)
                setSelectedTag(ALL_TAGS)
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
        <div className="annotation-dashboard__list" aria-label="批注列表">
          {filteredAnnotations.map((annotation) => (
            <article key={annotation.id} className="annotation-dashboard__card">
              <div className="annotation-dashboard__card-top">
                <div className="annotation-dashboard__meta-row">
                  <span className="annotation-dashboard__section-pill">{annotation.sectionLabel}</span>
                  <span className="annotation-dashboard__time">
                    {formatAnnotationDateTime(annotation.updatedAt || annotation.createdAt, annotation.postDate)}
                  </span>
                </div>
                <button
                  type="button"
                  className="annotation-dashboard__open-btn"
                  onClick={() => onOpenAnnotation(annotation)}
                >
                  跳回原文
                </button>
              </div>

              <blockquote className="annotation-dashboard__quote">
                {annotation.quote.trim() || '未命名高亮'}
              </blockquote>

              <section className="annotation-dashboard__note-block" aria-label="我的评论">
                <span className="annotation-dashboard__label">我的评论</span>
                <p>{annotation.note.trim() || '暂未写评论'}</p>
              </section>

              <section className="annotation-dashboard__source-block">
                <div>
                  <span className="annotation-dashboard__label">来源文章</span>
                  <strong>{annotation.postTitle}</strong>
                </div>
                {annotation.sourceName ? (
                  <span className="annotation-dashboard__source-name">{annotation.sourceName}</span>
                ) : null}
              </section>

              {annotation.tags.length > 0 ? (
                <div className="annotation-dashboard__tags" aria-label="标签">
                  {annotation.tags.map((tag) => (
                    <span key={`${annotation.id}-${tag}`} className="annotation-dashboard__tag">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}
