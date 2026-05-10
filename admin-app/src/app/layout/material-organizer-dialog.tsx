import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react'
import type { PostIndexItem } from '../posts/post-types'

type MaterialSourceType = 'diary' | 'read-later'
type MaterialSelectionState = Record<MaterialSourceType, string[]>
type MaterialDateFilter = {
  start: string
  end: string
}

type MaterialOrganizerDialogProps = {
  diaryPosts: PostIndexItem[]
  readLaterPosts: PostIndexItem[]
  selectedMaterialPaths: MaterialSelectionState
  isLoadingReadLater?: boolean
  isProcessing?: boolean
  onSelectedMaterialPathsChange: (type: MaterialSourceType, paths: string[]) => void
  onClearSelectedMaterials: () => void
  onConfirm: () => void
  onCancel: () => void
}

const MATERIAL_ORGANIZER_LIST_MAX_HEIGHT = 360
const MATERIAL_ORGANIZER_LIST_ITEM_GAP = 10
const MATERIAL_ORGANIZER_LIST_OVERSCAN = 8
const MATERIAL_ORGANIZER_LIST_ESTIMATED_ROW_SPAN = 92

function formatSelectedMaterialSummary(selection: MaterialSelectionState) {
  const parts: string[] = []
  if (selection.diary.length > 0) {
    parts.push(`${selection.diary.length} 篇日记`)
  }
  if (selection['read-later'].length > 0) {
    parts.push(`${selection['read-later'].length} 条待读`)
  }

  return parts.join(' · ') || '0 条素材'
}

function formatDateLabel(value: string) {
  return value?.slice(0, 10) || '未标日期'
}

function normalizeDateValue(value: string) {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ''
}

function getResolvedDateRange(filter: MaterialDateFilter) {
  if (!filter.start || !filter.end || filter.start <= filter.end) {
    return filter
  }

  return {
    start: filter.end,
    end: filter.start,
  }
}

function matchesDateFilter(post: PostIndexItem, filter: MaterialDateFilter) {
  if (!filter.start && !filter.end) {
    return true
  }

  const postDate = normalizeDateValue(post.date)
  if (!postDate) {
    return false
  }

  const resolvedFilter = getResolvedDateRange(filter)

  if (resolvedFilter.start && postDate < resolvedFilter.start) {
    return false
  }
  if (resolvedFilter.end && postDate > resolvedFilter.end) {
    return false
  }

  return true
}

function MaterialSelectionSection({
  title,
  description,
  posts,
  type,
  selectedPaths,
  hasActiveDateFilter = false,
  isLoading = false,
  isProcessing = false,
  onSelectedMaterialPathsChange,
}: {
  title: string
  description: string
  posts: PostIndexItem[]
  type: MaterialSourceType
  selectedPaths: string[]
  hasActiveDateFilter?: boolean
  isLoading?: boolean
  isProcessing?: boolean
  onSelectedMaterialPathsChange: (type: MaterialSourceType, paths: string[]) => void
}) {
  const listRef = useRef<HTMLDivElement | null>(null)
  const scrollFrameRef = useRef<number | null>(null)
  const pendingScrollTopRef = useRef(0)
  const [scrollTop, setScrollTop] = useState(0)
  const [estimatedRowSpan, setEstimatedRowSpan] = useState(MATERIAL_ORGANIZER_LIST_ESTIMATED_ROW_SPAN)
  const selectedPathSet = useMemo(() => new Set(selectedPaths), [selectedPaths])
  const visiblePaths = useMemo(() => posts.map((post) => post.path), [posts])
  const visiblePathSet = useMemo(() => new Set(visiblePaths), [visiblePaths])
  const visibleSelectedCount = useMemo(
    () => posts.reduce((count, post) => count + (selectedPathSet.has(post.path) ? 1 : 0), 0),
    [posts, selectedPathSet],
  )
  const hasVisibleSelected = visibleSelectedCount > 0
  const startIndex = Math.max(0, Math.floor(scrollTop / estimatedRowSpan) - MATERIAL_ORGANIZER_LIST_OVERSCAN)
  const visibleItemCount =
    Math.ceil(MATERIAL_ORGANIZER_LIST_MAX_HEIGHT / estimatedRowSpan) + MATERIAL_ORGANIZER_LIST_OVERSCAN * 2
  const endIndex = Math.min(posts.length, startIndex + visibleItemCount)
  const renderedPosts = useMemo(() => posts.slice(startIndex, endIndex), [endIndex, posts, startIndex])
  const topSpacerHeight = startIndex * estimatedRowSpan
  const bottomSpacerHeight = Math.max(0, (posts.length - endIndex) * estimatedRowSpan)

  useEffect(() => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current)
      scrollFrameRef.current = null
    }

    pendingScrollTopRef.current = 0
    setScrollTop(0)
    setEstimatedRowSpan(MATERIAL_ORGANIZER_LIST_ESTIMATED_ROW_SPAN)

    if (listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [posts])

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [])

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    pendingScrollTopRef.current = event.currentTarget.scrollTop

    if (scrollFrameRef.current !== null) {
      return
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null
      setScrollTop(pendingScrollTopRef.current)
    })
  }

  const handleMeasurementRef = (node: HTMLLabelElement | null) => {
    if (!node) {
      return
    }

    const measuredHeight = Math.round(node.getBoundingClientRect().height || node.offsetHeight)
    if (measuredHeight <= 0) {
      return
    }

    const nextRowSpan = measuredHeight + MATERIAL_ORGANIZER_LIST_ITEM_GAP
    setEstimatedRowSpan((current) => (Math.abs(current - nextRowSpan) <= 2 ? current : nextRowSpan))
  }

  const toggleItem = (path: string) => {
    const next = new Set(selectedPathSet)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    onSelectedMaterialPathsChange(type, Array.from(next))
  }

  const selectAllVisible = () => {
    const next = new Set(selectedPaths)
    visiblePaths.forEach((path) => next.add(path))
    onSelectedMaterialPathsChange(type, Array.from(next))
  }

  const clearVisible = () => {
    onSelectedMaterialPathsChange(type, selectedPaths.filter((path) => !visiblePathSet.has(path)))
  }

  return (
    <section className="material-organizer-dialog__section" aria-label={title}>
      <div className="material-organizer-dialog__section-header">
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        <div className="material-organizer-dialog__section-actions">
          <button
            type="button"
            className="material-organizer-dialog__text-btn"
            onClick={selectAllVisible}
            disabled={posts.length === 0 || isLoading || isProcessing}
          >
            全选
          </button>
          <button
            type="button"
            className="material-organizer-dialog__text-btn"
            onClick={clearVisible}
            disabled={!hasVisibleSelected || isProcessing}
          >
            清空
          </button>
        </div>
      </div>

      <div className="material-organizer-dialog__section-meta">
        <span>{posts.length} 条可选</span>
        <span>
          {selectedPaths.length !== visibleSelectedCount
            ? `${visibleSelectedCount}/${selectedPaths.length} 条当前已显示`
            : `${selectedPaths.length} 条已选`}
        </span>
      </div>

      <div className="material-organizer-dialog__list" ref={listRef} onScroll={handleScroll}>
        {isLoading ? (
          <p className="material-organizer-dialog__empty">正在加载待读列表…</p>
        ) : posts.length === 0 ? (
          <p className="material-organizer-dialog__empty">
            {hasActiveDateFilter
              ? (type === 'diary' ? '当前日期下还没有可整理的日记。' : '当前日期下还没有可整理的待读。')
              : (type === 'diary' ? '还没有可整理的日记。' : '还没有可整理的待读。')}
          </p>
        ) : (
          <div
            className="material-organizer-dialog__list-virtual"
            style={{
              paddingTop: topSpacerHeight > 0 ? `${topSpacerHeight}px` : undefined,
              paddingBottom: bottomSpacerHeight > 0 ? `${bottomSpacerHeight}px` : undefined,
            }}
          >
            {renderedPosts.map((post, index) => {
              const checked = selectedPathSet.has(post.path)

              return (
                <label
                  key={post.path}
                  ref={index === 0 ? handleMeasurementRef : undefined}
                  className={`material-organizer-dialog__item${checked ? ' is-active' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={isProcessing}
                    aria-label={type === 'diary' ? `选择日记 ${post.title}` : `选择待读 ${post.title}`}
                    onChange={() => toggleItem(post.path)}
                  />
                  <div className="material-organizer-dialog__item-copy">
                    <div className="material-organizer-dialog__item-title-row">
                      <strong>{post.title || '未命名素材'}</strong>
                      <span>{formatDateLabel(post.date)}</span>
                    </div>
                    <p>
                      {type === 'diary'
                        ? (post.desc?.trim() || '纳入这篇日记的正文内容。')
                        : post.sourceName?.trim()
                          ? `${post.sourceName.trim()} · 自动带上我的总结、我的评论和有评论批注`
                          : '自动带上我的总结、我的评论和有评论批注'}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

export default function MaterialOrganizerDialog({
  diaryPosts,
  readLaterPosts,
  selectedMaterialPaths,
  isLoadingReadLater = false,
  isProcessing = false,
  onSelectedMaterialPathsChange,
  onClearSelectedMaterials,
  onConfirm,
  onCancel,
}: MaterialOrganizerDialogProps) {
  const [dateFilter, setDateFilter] = useState<MaterialDateFilter>({
    start: '',
    end: '',
  })
  const hasSelectedMaterials =
    selectedMaterialPaths.diary.length > 0 || selectedMaterialPaths['read-later'].length > 0
  const hasActiveDateFilter = Boolean(dateFilter.start || dateFilter.end)
  const filteredDiaryPosts = useMemo(
    () => diaryPosts.filter((post) => matchesDateFilter(post, dateFilter)),
    [dateFilter.end, dateFilter.start, diaryPosts],
  )
  const filteredReadLaterPosts = useMemo(
    () => readLaterPosts.filter((post) => matchesDateFilter(post, dateFilter)),
    [dateFilter.end, dateFilter.start, readLaterPosts],
  )

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isProcessing) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isProcessing, onCancel])

  return (
    <div className="confirm-dialog__overlay material-organizer-dialog__overlay" onClick={isProcessing ? undefined : onCancel}>
      <div
        className="confirm-dialog material-organizer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-organizer-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="material-organizer-dialog__header">
          <div>
            <p className="post-dashboard__filter-label">写作素材</p>
            <h3 id="material-organizer-dialog-title" className="confirm-dialog__title material-organizer-dialog__title">整理素材</h3>
          </div>
          <button
            type="button"
            className="material-organizer-dialog__close"
            aria-label="关闭素材整理弹框"
            disabled={isProcessing}
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        <div className="material-organizer-dialog__filters" aria-label="日期筛选">
          <div className="material-organizer-dialog__filter-bar">
            <div className="material-organizer-dialog__date-range">
              <span className="post-dashboard__filter-label">日期范围</span>
              <label className="material-organizer-dialog__date-input">
                <span className="sr-only">开始日期</span>
                <input
                  type="date"
                  aria-label="开始日期"
                  value={dateFilter.start}
                  disabled={isProcessing}
                  onChange={(event) => {
                    setDateFilter((current) => ({
                      ...current,
                      start: event.target.value,
                    }))
                  }}
                />
              </label>
              <span className="material-organizer-dialog__date-separator" aria-hidden="true">
                至
              </span>
              <label className="material-organizer-dialog__date-input">
                <span className="sr-only">结束日期</span>
                <input
                  type="date"
                  aria-label="结束日期"
                  value={dateFilter.end}
                  disabled={isProcessing}
                  onChange={(event) => {
                    setDateFilter((current) => ({
                      ...current,
                      end: event.target.value,
                    }))
                  }}
                />
              </label>
            </div>
            <div className="material-organizer-dialog__filter-summary">
              <span>当前显示 {filteredDiaryPosts.length} 篇日记 · {filteredReadLaterPosts.length} 条待读</span>
            </div>
            {hasActiveDateFilter ? (
              <button
                type="button"
                className="material-organizer-dialog__text-btn"
                disabled={isProcessing}
                onClick={() => setDateFilter({ start: '', end: '' })}
              >
                清空日期筛选
              </button>
            ) : null}
          </div>
        </div>

        <div className="material-organizer-dialog__summary-row">
          <span className="material-organizer-dialog__summary">
            当前已选 {formatSelectedMaterialSummary(selectedMaterialPaths)}
          </span>
          <button
            type="button"
            className="material-organizer-dialog__text-btn"
            disabled={!hasSelectedMaterials || isProcessing}
            onClick={onClearSelectedMaterials}
          >
            清空已选
          </button>
        </div>

        <div className="material-organizer-dialog__sections">
          <MaterialSelectionSection
            title="日记"
            description="勾选本次需要归纳的日记正文。"
            posts={filteredDiaryPosts}
            type="diary"
            selectedPaths={selectedMaterialPaths.diary}
            hasActiveDateFilter={hasActiveDateFilter}
            isProcessing={isProcessing}
            onSelectedMaterialPathsChange={onSelectedMaterialPathsChange}
          />
          <MaterialSelectionSection
            title="待读"
            description="每条会自动提取我的总结、我的评论和有评论批注。"
            posts={filteredReadLaterPosts}
            type="read-later"
            selectedPaths={selectedMaterialPaths['read-later']}
            hasActiveDateFilter={hasActiveDateFilter}
            isLoading={isLoadingReadLater}
            isProcessing={isProcessing}
            onSelectedMaterialPathsChange={onSelectedMaterialPathsChange}
          />
        </div>

        <div className="confirm-dialog__actions material-organizer-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--cancel"
            disabled={isProcessing}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--confirm"
            disabled={!hasSelectedMaterials || isProcessing}
            onClick={onConfirm}
          >
            {isProcessing ? '整理中…' : '开始总结'}
          </button>
        </div>
      </div>
    </div>
  )
}
