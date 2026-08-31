import { useEffect, useMemo, useState } from 'react'
import type { PostIndexItem } from '../posts/post-types'
import FilterSelect from '../layout/filter-select'
import DiaryCalendarGrid from './diary-calendar-grid'
import DiaryTimelinePreview from './diary-timeline-preview'
import { buildMonthCalendarGrid, extractDateStrFromPost } from './diary-calendar-utils'
import type { DiaryViewMode } from './diary-view-types'

interface DiaryDashboardViewProps {
  posts: PostIndexItem[]
  search: string
  availableTags?: string[]
  selectedTag?: string | null
  onSelectTag?: (tag: string | null) => void
  onOpenPost: (post: PostIndexItem) => void
  onNewPost: () => void
  onNewPostForDate?: (dateStr: string) => void
  onOrganizeMaterials?: () => void
  onDeletePost: (post: PostIndexItem) => void
}

function CalendarGridIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11" y="3.5" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.5" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
      <rect x="11" y="11" width="5.5" height="5.5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function FocusFrameIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 7.5V4.5a1 1 0 0 1 1-1h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3.5h3a1 1 0 0 1 1 1v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 12.5v3a1 1 0 0 1-1 1h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 16.5H5a1 1 0 0 1-1-1v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.5 3.5h7.1l7.9 7.9-6 6-7.9-7.9V3.5Z" stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" />
      <circle cx="6.7" cy="6.7" r="1.15" fill="currentColor" />
    </svg>
  )
}

function TidyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m3.2 16.8 8.2-8.2 2.4 2.4-8.2 8.2-2.7.3.3-2.7Z" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" />
      <path d="m12.7 3.1.45 1.45 1.45.45-1.45.45-.45 1.45-.45-1.45-1.45-.45 1.45-.45.45-1.45ZM16.4 7.2l.3.95.95.3-.95.3-.3.95-.3-.95-.95-.3.95-.3.3-.95Z" fill="currentColor" />
    </svg>
  )
}

function ChevronDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m5.5 7.5 4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function DiaryDashboardView({
  posts,
  search,
  availableTags = [],
  selectedTag = null,
  onSelectTag,
  onOpenPost,
  onNewPost,
  onNewPostForDate,
  onOrganizeMaterials,
  onDeletePost,
}: DiaryDashboardViewProps) {
  // Always default to 🔒 calendar (lock) mode on mount / refresh
  const [viewMode, setViewMode] = useState<DiaryViewMode>('calendar')

  // Selected Year & Month state: defaults to current month if has posts or newest post's month
  const initialYearMonth = useMemo(() => {
    const now = new Date()
    const nowYear = now.getFullYear()
    const nowMonth = now.getMonth() + 1
    const nowPrefix = `${nowYear}-${String(nowMonth).padStart(2, '0')}`

    const hasPostThisMonth = posts.some((p) => extractDateStrFromPost(p).startsWith(nowPrefix))
    if (hasPostThisMonth || posts.length === 0) {
      return { year: nowYear, month: nowMonth }
    }

    for (const p of posts) {
      const d = extractDateStrFromPost(p)
      if (d) {
        const [y, m] = d.split('-').map(Number)
        if (y && m) {
          return { year: y, month: m }
        }
      }
    }
    return { year: nowYear, month: nowMonth }
  }, [posts])

  const [currentYear, setCurrentYear] = useState(() => initialYearMonth.year)
  const [currentMonth, setCurrentMonth] = useState(() => initialYearMonth.month)

  useEffect(() => {
    setCurrentYear(initialYearMonth.year)
    setCurrentMonth(initialYearMonth.month)
  }, [initialYearMonth])

  const tagOptions = useMemo(() => [
    { value: '', label: '全部标签' },
    ...availableTags.map((tag) => ({ value: tag, label: tag })),
  ], [availableTags])

  // Filter posts by tag & search
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      const matchTag = !selectedTag || (post.tags && post.tags.includes(selectedTag))
      const matchSearch = !search || (post.title && post.title.includes(search)) || (post.desc && post.desc.includes(search))
      return matchTag && matchSearch
    })
  }, [posts, selectedTag, search])

  // Filter posts belonging to the currently selected month
  const monthTargetPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`
  const monthFilteredPosts = useMemo(() => {
    return filteredPosts.filter((post) => {
      const d = extractDateStrFromPost(post)
      return d.startsWith(monthTargetPrefix)
    })
  }, [filteredPosts, monthTargetPrefix])

  // Compute month calendar data
  const calendarData = useMemo(() => {
    return buildMonthCalendarGrid(currentYear, currentMonth, filteredPosts, search)
  }, [currentYear, currentMonth, filteredPosts, search])

  // Month navigation handlers
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear((y) => y - 1)
      setCurrentMonth(12)
    } else {
      setCurrentMonth((m) => m - 1)
    }
  }

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear((y) => y + 1)
      setCurrentMonth(1)
    } else {
      setCurrentMonth((m) => m + 1)
    }
  }

  const handleTodayMonth = () => {
    const today = new Date()
    setCurrentYear(today.getFullYear())
    setCurrentMonth(today.getMonth() + 1)
  }

  const handleBackfillDate = (dateStr: string) => {
    if (onNewPostForDate) {
      onNewPostForDate(dateStr)
    } else {
      onNewPost()
    }
  }

  return (
    <section className="diary-dashboard" aria-label="日记管理">
      {/* Top Filter Bar */}
      <div className="diary-dashboard__toolbar">
        <div className="diary-dashboard__toolbar-left">
          {/* Tag filter */}
          <div className="diary-dashboard__tag-filter">
            <FilterSelect
              label="标签"
              value={selectedTag || ''}
              options={tagOptions}
              onChange={(value) => onSelectTag?.(value ? value : null)}
              placeholder="全部标签"
              triggerAriaLabel="标签筛选"
              searchable={availableTags.length > 8}
            />
          </div>

          {/* Quick Organize Materials */}
          {onOrganizeMaterials ? (
            <button
              type="button"
              className="diary-dashboard__filter-btn diary-dashboard__filter-btn--organize"
              onClick={onOrganizeMaterials}
              title="整理周报/月报素材"
            >
              <TidyIcon />
              <span>整理素材</span>
            </button>
          ) : null}

          <span className="diary-dashboard__total-counter">
            共 {posts.length} 篇日记
            {filteredPosts.length !== posts.length ? ` · 筛选后 ${filteredPosts.length} 篇` : ''}
          </span>
        </div>

        {/* Right Icon Mode Tabs: 网格 (Calendar) vs 聚焦框 (Timeline / Preview) */}
        <div className="diary-dashboard__mode-tabs" role="tablist" aria-label="视图模式切换">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'calendar'}
            aria-label="月历模式 (日历网格)"
            title="月历模式 (日历网格)"
            className={`diary-dashboard__mode-tab${viewMode === 'calendar' ? ' is-active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            <CalendarGridIcon />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'timeline'}
            aria-label="时间线模式 (内容预览)"
            title="时间线模式 (内容预览)"
            className={`diary-dashboard__mode-tab${viewMode === 'timeline' ? ' is-active' : ''}`}
            onClick={() => setViewMode('timeline')}
          >
            <FocusFrameIcon />
          </button>
        </div>
      </div>

      {/* Main Content Card with Month Header */}
      <div className="diary-dashboard__card">
        <div className="diary-dashboard__month-header">
          <div className="diary-dashboard__month-controls">
            <h2 className="diary-dashboard__month-title">
              {currentYear} 年 {currentMonth} 月
            </h2>
            <div className="diary-dashboard__month-nav-btns">
              <button
                type="button"
                className="diary-dashboard__nav-btn"
                onClick={handlePrevMonth}
                aria-label="上一月"
                title="上一月"
              >
                ‹
              </button>
              <button
                type="button"
                className="diary-dashboard__nav-btn diary-dashboard__nav-btn--today"
                onClick={handleTodayMonth}
              >
                今天
              </button>
              <button
                type="button"
                className="diary-dashboard__nav-btn"
                onClick={handleNextMonth}
                aria-label="下一月"
                title="下一月"
              >
                ›
              </button>
            </div>
          </div>

          <div className="diary-dashboard__month-stats">
            <span>{calendarData.stats.diaryCount} 篇日记</span>
            <span>·</span>
            <span>{calendarData.stats.totalWords.toLocaleString()} 字</span>
            <span>·</span>
            <span>连续 {calendarData.stats.streakDays} 天</span>
          </div>
        </div>

        {/* View Mode Switch */}
        {viewMode === 'calendar' ? (
          <DiaryCalendarGrid
            cells={calendarData.cells}
            onOpenPost={onOpenPost}
            onNewPostForDate={handleBackfillDate}
            onDeletePost={onDeletePost}
          />
        ) : (
          <DiaryTimelinePreview
            posts={monthFilteredPosts}
            onOpenPost={onOpenPost}
            onDeletePost={onDeletePost}
          />
        )}
      </div>
    </section>
  )
}
