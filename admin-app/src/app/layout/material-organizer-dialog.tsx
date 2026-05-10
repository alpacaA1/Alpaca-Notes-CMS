import { useEffect, useState } from 'react'
import type { PostIndexItem } from '../posts/post-types'

type MaterialSourceType = 'diary' | 'read-later'
type MaterialSelectionState = Record<MaterialSourceType, string[]>
type MaterialDateFilter = {
  year: string
  month: string
  day: string
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

function getDateParts(value: string): MaterialDateFilter | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) {
    return null
  }

  return {
    year: match[1],
    month: match[2],
    day: match[3],
  }
}

function collectDateOptions(posts: PostIndexItem[], field: keyof MaterialDateFilter, filter: Partial<MaterialDateFilter> = {}) {
  const values = new Set<string>()

  posts.forEach((post) => {
    const parts = getDateParts(post.date)
    if (!parts) {
      return
    }
    if (filter.year && parts.year !== filter.year) {
      return
    }
    if (filter.month && parts.month !== filter.month) {
      return
    }

    values.add(parts[field])
  })

  return Array.from(values).sort((left, right) => right.localeCompare(left, 'zh-CN'))
}

function matchesDateFilter(post: PostIndexItem, filter: MaterialDateFilter) {
  if (!filter.year && !filter.month && !filter.day) {
    return true
  }

  const parts = getDateParts(post.date)
  if (!parts) {
    return false
  }

  if (filter.year && parts.year !== filter.year) {
    return false
  }
  if (filter.month && parts.month !== filter.month) {
    return false
  }
  if (filter.day && parts.day !== filter.day) {
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
  const selectedPathSet = new Set(selectedPaths)
  const visiblePaths = posts.map((post) => post.path)
  const visiblePathSet = new Set(visiblePaths)
  const visibleSelectedCount = posts.filter((post) => selectedPathSet.has(post.path)).length
  const hasVisibleSelected = visibleSelectedCount > 0

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

      <div className="material-organizer-dialog__list">
        {isLoading ? (
          <p className="material-organizer-dialog__empty">正在加载待读列表…</p>
        ) : posts.length === 0 ? (
          <p className="material-organizer-dialog__empty">
            {hasActiveDateFilter
              ? (type === 'diary' ? '当前日期下还没有可整理的日记。' : '当前日期下还没有可整理的待读。')
              : (type === 'diary' ? '还没有可整理的日记。' : '还没有可整理的待读。')}
          </p>
        ) : (
          posts.map((post) => {
            const checked = selectedPathSet.has(post.path)

            return (
              <label
                key={post.path}
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
          })
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
    year: '',
    month: '',
    day: '',
  })
  const hasSelectedMaterials =
    selectedMaterialPaths.diary.length > 0 || selectedMaterialPaths['read-later'].length > 0
  const allPosts = [...diaryPosts, ...readLaterPosts]
  const yearOptions = collectDateOptions(allPosts, 'year')
  const monthOptions = dateFilter.year
    ? collectDateOptions(allPosts, 'month', { year: dateFilter.year })
    : []
  const dayOptions = dateFilter.year && dateFilter.month
    ? collectDateOptions(allPosts, 'day', { year: dateFilter.year, month: dateFilter.month })
    : []
  const hasActiveDateFilter = Boolean(dateFilter.year || dateFilter.month || dateFilter.day)
  const filteredDiaryPosts = diaryPosts.filter((post) => matchesDateFilter(post, dateFilter))
  const filteredReadLaterPosts = readLaterPosts.filter((post) => matchesDateFilter(post, dateFilter))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isProcessing) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isProcessing, onCancel])

  useEffect(() => {
    if (dateFilter.year && !yearOptions.includes(dateFilter.year)) {
      setDateFilter({ year: '', month: '', day: '' })
      return
    }

    if (dateFilter.month && !monthOptions.includes(dateFilter.month)) {
      setDateFilter((current) => ({ ...current, month: '', day: '' }))
      return
    }

    if (dateFilter.day && !dayOptions.includes(dateFilter.day)) {
      setDateFilter((current) => ({ ...current, day: '' }))
    }
  }, [dateFilter.day, dateFilter.month, dateFilter.year, dayOptions, monthOptions, yearOptions])

  return (
    <div className="confirm-dialog__overlay material-organizer-dialog__overlay" onClick={isProcessing ? undefined : onCancel}>
      <div
        className="confirm-dialog material-organizer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-organizer-dialog-title"
        aria-describedby="material-organizer-dialog-description"
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

        <p id="material-organizer-dialog-description" className="confirm-dialog__message material-organizer-dialog__message">
          勾选要纳入本次总结的日记和待读。待读会自动带上我的总结、我的评论和有评论批注。
        </p>

        <div className="material-organizer-dialog__filters" aria-label="日期筛选">
          <div className="material-organizer-dialog__filter-block">
            <span className="post-dashboard__filter-label">日期筛选</span>
            <div className="material-organizer-dialog__filter-controls">
              <label className="material-organizer-dialog__filter-field">
                <span>年</span>
                <select
                  aria-label="筛选年份"
                  value={dateFilter.year}
                  disabled={isProcessing}
                  onChange={(event) => {
                    setDateFilter({
                      year: event.target.value,
                      month: '',
                      day: '',
                    })
                  }}
                >
                  <option value="">全部年份</option>
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year} 年
                    </option>
                  ))}
                </select>
              </label>
              <label className="material-organizer-dialog__filter-field">
                <span>月</span>
                <select
                  aria-label="筛选月份"
                  value={dateFilter.month}
                  disabled={!dateFilter.year || isProcessing}
                  onChange={(event) => {
                    setDateFilter((current) => ({
                      ...current,
                      month: event.target.value,
                      day: '',
                    }))
                  }}
                >
                  <option value="">全部月份</option>
                  {monthOptions.map((month) => (
                    <option key={month} value={month}>
                      {month} 月
                    </option>
                  ))}
                </select>
              </label>
              <label className="material-organizer-dialog__filter-field">
                <span>日</span>
                <select
                  aria-label="筛选日期"
                  value={dateFilter.day}
                  disabled={!dateFilter.year || !dateFilter.month || isProcessing}
                  onChange={(event) => {
                    setDateFilter((current) => ({
                      ...current,
                      day: event.target.value,
                    }))
                  }}
                >
                  <option value="">全部日期</option>
                  {dayOptions.map((day) => (
                    <option key={day} value={day}>
                      {day} 日
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="material-organizer-dialog__filter-summary">
            <span>当前显示 {filteredDiaryPosts.length} 篇日记 · {filteredReadLaterPosts.length} 条待读</span>
            {hasActiveDateFilter ? (
              <button
                type="button"
                className="material-organizer-dialog__text-btn"
                disabled={isProcessing}
                onClick={() => setDateFilter({ year: '', month: '', day: '' })}
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
