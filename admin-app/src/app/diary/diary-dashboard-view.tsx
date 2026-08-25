import { useEffect, useMemo, useRef, useState } from 'react'
import type { PostIndexItem } from '../posts/post-types'
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

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="4" y="9" width="12" height="9" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="13.5" r="1.2" fill="currentColor" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M2.5 10c2.5-5 12.5-5 15 0-2.5 5-12.5 5-15 0Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.75" stroke="currentColor" strokeWidth="1.6" />
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

  // Tag filter dropdown state
  const [isTagMenuOpen, setIsTagMenuOpen] = useState(false)
  const tagFilterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isTagMenuOpen) {
      return
    }

    const handleDocumentClick = (event: MouseEvent | TouchEvent) => {
      if (tagFilterRef.current && !tagFilterRef.current.contains(event.target as Node)) {
        setIsTagMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsTagMenuOpen(false)
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
  }, [isTagMenuOpen])

  // Filter posts by tag & search
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (selectedTag && (!post.tags || !post.tags.includes(selectedTag))) {
        return false
      }
      return true
    })
  }, [posts, selectedTag])

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
          <div className="diary-dashboard__tag-filter" ref={tagFilterRef}>
            <button
              type="button"
              className={`diary-dashboard__filter-btn${selectedTag ? ' is-active' : ''}`}
              onClick={() => setIsTagMenuOpen((prev) => !prev)}
              aria-expanded={isTagMenuOpen}
            >
              <TagIcon />
              <span>{selectedTag ? `标签: ${selectedTag}` : '全部标签'}</span>
              <ChevronDownIcon />
            </button>
            {isTagMenuOpen ? (
              <div className="diary-dashboard__tag-menu" role="menu">
                <button
                  type="button"
                  className={`diary-dashboard__tag-menu-item${!selectedTag ? ' is-active' : ''}`}
                  onClick={() => {
                    onSelectTag?.(null)
                    setIsTagMenuOpen(false)
                  }}
                >
                  全部标签
                </button>
                {availableTags.length > 0 ? availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`diary-dashboard__tag-menu-item${selectedTag === tag ? ' is-active' : ''}`}
                    onClick={() => {
                      onSelectTag?.(tag)
                      setIsTagMenuOpen(false)
                    }}
                  >
                    {tag}
                  </button>
                )) : <span className="diary-dashboard__tag-menu-empty">暂无可筛选标签</span>}
              </div>
            ) : null}
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

        {/* Right Icon Mode Tabs: 🔒 (Lock) vs 👁️ (Eye) */}
        <div className="diary-dashboard__mode-tabs" role="tablist" aria-label="视图模式切换">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'calendar'}
            aria-label="月历模式 (安全索引)"
            title="月历模式 (安全索引)"
            className={`diary-dashboard__mode-tab${viewMode === 'calendar' ? ' is-active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            <LockIcon />
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'timeline'}
            aria-label="时间线模式 (内容回顾)"
            title="时间线模式 (内容回顾)"
            className={`diary-dashboard__mode-tab${viewMode === 'timeline' ? ' is-active' : ''}`}
            onClick={() => setViewMode('timeline')}
          >
            <EyeIcon />
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
