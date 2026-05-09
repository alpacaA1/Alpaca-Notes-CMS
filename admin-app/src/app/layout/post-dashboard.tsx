import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { renderContentBlocks } from '../editor/preview-pane'
import { KNOWLEDGE_RANDOM_CATEGORY } from '../knowledge/constants'
import { collectPostIndexFacets, filterPostIndex, sortPostIndex } from '../posts/index-posts'
import type { ReadingStatus } from '../posts/parse-post'
import type { ContentType, PostIndexItem, PostPublishState, PostSort } from '../posts/post-types'
import FilterSelect from './filter-select'

type DashboardViewMode = 'grid' | 'list'
type DashboardStatusFilter = 'all' | 'published' | 'draft' | ReadingStatus
type StatusTone = Exclude<DashboardStatusFilter, 'all'>
type DashboardStatCard = {
  value: DashboardStatusFilter
  label: string
  count: number
  tone?: StatusTone
}

type RecoverableDraft = {
  path: string
  title: string
  updatedAt: string
  hasSavedBaseline: boolean
}

type SelectedMaterialCounts = {
  diary: number
  'read-later': number
}

type PostDashboardProps = {
  posts: PostIndexItem[]
  search: string
  isIndexing: boolean
  contentType: ContentType
  recoverableDrafts?: RecoverableDraft[]
  quickCaptureUrl?: string
  isQuickCapturing?: boolean
  isDeleting?: boolean
  deletingPostPath?: string | null
  isTogglingPinned?: boolean
  togglingPinnedPostPath?: string | null
  selectedMaterialPaths?: string[]
  selectedMaterialCounts?: SelectedMaterialCounts
  isOrganizingMaterials?: boolean
  materialResult?: string | null
  onOpenPost: (post: PostIndexItem) => void
  onOpenRecoveredDraft?: (path: string) => void
  onNewPost: () => void
  onQuickCaptureUrlChange?: (value: string) => void
  onQuickCapture?: () => void
  onDeletePost: (post: PostIndexItem) => void
  onTogglePinned: (post: PostIndexItem) => void
  onSelectedMaterialPathsChange?: (paths: string[]) => void
  onClearSelectedMaterials?: () => void
  onOrganizeMaterials?: () => void
  onSearchFocus?: () => void
}

const POST_STATUS_OPTIONS: { value: PostPublishState; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
]

const READ_LATER_STATUS_OPTIONS: { value: DashboardStatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'reading', label: '在读' },
  { value: 'done', label: '已读' },
]

const POST_SORT_OPTIONS: { value: PostSort; label: string }[] = [
  { value: 'date-desc', label: '最新发布' },
  { value: 'date-asc', label: '最早发布' },
  { value: 'title-asc', label: '标题 A→Z' },
  { value: 'title-desc', label: '标题 Z→A' },
]

const READ_LATER_SORT_OPTIONS: { value: PostSort; label: string }[] = [
  { value: 'date-desc', label: '最新收录' },
  { value: 'date-asc', label: '最早收录' },
  { value: 'title-asc', label: '标题 A→Z' },
  { value: 'title-desc', label: '标题 Z→A' },
]

const VIEW_MODE_STORAGE_KEY = 'alpaca-dashboard-view-mode'
const DIARY_ALL_MONTHS_KEY = 'all-months'

function readStoredViewMode(): DashboardViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (stored === 'grid' || stored === 'list') {
      return stored
    }
  } catch {
    // Ignore storage errors
  }
  return 'list'
}

function normalizeReadLaterStatus(status?: ReadingStatus): ReadingStatus {
  return status === 'reading' || status === 'done' ? status : 'unread'
}

function getStatusTone(post: PostIndexItem, contentType: ContentType): StatusTone {
  if (contentType === 'read-later') {
    return normalizeReadLaterStatus(post.readingStatus)
  }

  if (contentType === 'knowledge') {
    return 'draft'
  }

  return post.published ? 'published' : 'draft'
}

function getStatusLabel(post: PostIndexItem, contentType: ContentType) {
  if (contentType === 'read-later') {
    const status = normalizeReadLaterStatus(post.readingStatus)
    return status === 'done' ? '已读' : status === 'reading' ? '在读' : '未读'
  }

  if (contentType === 'diary') {
    return '日记'
  }

  if (contentType === 'knowledge') {
    return '知识点'
  }

  return post.published ? '已发布' : '草稿'
}

function getPinActionLabel(contentType: ContentType, pinned?: boolean) {
  if (contentType === 'read-later') {
    return pinned ? '取消置顶待读' : '置顶待读'
  }

  if (contentType === 'diary') {
    return pinned ? '取消置顶日记' : '置顶日记'
  }

  if (contentType === 'knowledge') {
    return pinned ? '取消置顶知识点' : '置顶知识点'
  }

  return pinned ? '取消置顶文章' : '置顶文章'
}

function getDeleteActionLabel(contentType: ContentType) {
  if (contentType === 'read-later') {
    return '删除待读条目'
  }

  if (contentType === 'diary') {
    return '删除日记'
  }

  if (contentType === 'knowledge') {
    return '删除知识点'
  }

  return '删除文章'
}

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="2" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="7" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1" y="12" width="14" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 4h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M6 2.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5 6.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 6.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11 6.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 4l.45 7.2A1.5 1.5 0 0 0 5.95 12.6h4.1a1.5 1.5 0 0 0 1.5-1.4L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EmptyIllustration() {
  return (
    <svg className="post-dashboard__empty-svg" width="120" height="100" viewBox="0 0 120 100" fill="none" aria-hidden="true">
      <rect x="10" y="20" width="100" height="70" rx="12" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.3" />
      <rect x="24" y="36" width="72" height="6" rx="3" fill="currentColor" opacity="0.12" />
      <rect x="24" y="48" width="52" height="4" rx="2" fill="currentColor" opacity="0.08" />
      <rect x="24" y="58" width="60" height="4" rx="2" fill="currentColor" opacity="0.08" />
      <circle cx="60" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.2" />
      <path d="M56 14l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.25" />
    </svg>
  )
}

function TagBadge({ tag }: { tag: string }) {
  return <span className="post-dashboard__tag-badge">{tag}</span>
}

function formatRecoveredDraftTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚保存'
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatKnowledgeCardDate(value: string) {
  return value ? value.slice(0, 10) : '无日期'
}

function formatSelectedMaterialSummary(counts: SelectedMaterialCounts) {
  const parts: string[] = []
  if (counts.diary > 0) {
    parts.push(`${counts.diary} 篇日记`)
  }
  if (counts['read-later'] > 0) {
    parts.push(`${counts['read-later']} 条待读`)
  }

  return parts.join(' · ') || '0 条素材'
}

function getDiaryMonthKey(post: PostIndexItem) {
  const dateMatch = post.date.match(/^(\d{4})-(\d{2})/)
  if (dateMatch) {
    return `${dateMatch[1]}-${dateMatch[2]}`
  }

  const pathMatch = post.path.match(/(\d{4})(\d{2})\d{8}/)
  return pathMatch ? `${pathMatch[1]}-${pathMatch[2]}` : 'undated'
}

function getDiaryMonthLabel(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/)
  if (!match) {
    return '未标日期'
  }

  return `${match[1]} 年 ${match[2]} 月`
}

function groupDiaryPostsByMonth(posts: PostIndexItem[]) {
  const grouped = new Map<string, PostIndexItem[]>()

  posts.forEach((post) => {
    const monthKey = getDiaryMonthKey(post)
    grouped.set(monthKey, [...(grouped.get(monthKey) || []), post])
  })

  return Array.from(grouped.entries())
    .sort(([leftMonthKey], [rightMonthKey]) => {
      if (leftMonthKey === 'undated') {
        return 1
      }

      if (rightMonthKey === 'undated') {
        return -1
      }

      return rightMonthKey.localeCompare(leftMonthKey, 'zh-CN')
    })
    .map(([monthKey, monthPosts]) => ({
      monthKey,
      label: getDiaryMonthLabel(monthKey),
      posts: monthPosts,
    }))
}

function getKnowledgeCardContent(post: PostIndexItem) {
  return post.desc.trim() || post.title.trim() || '未命名知识点'
}

function KnowledgeCard({
  post,
  isActive,
  isDeleting,
  onOpenPost,
  onDeletePost,
}: {
  post: PostIndexItem
  isActive: boolean
  isDeleting: boolean
  onOpenPost: (post: PostIndexItem) => void
  onDeletePost: (post: PostIndexItem) => void
}) {
  return (
    <article
      className={`post-dashboard__card post-dashboard__card--knowledge${post.pinned ? ' post-dashboard__card--pinned' : ''}${isActive ? ' is-active' : ''}`}
    >
      <button
        type="button"
        className="post-dashboard__knowledge-card-main"
        onClick={() => onOpenPost(post)}
      >
        <span className="post-dashboard__knowledge-card-date">{formatKnowledgeCardDate(post.date)}</span>
        <div className="post-dashboard__knowledge-card-body">
          <div className="post-dashboard__knowledge-card-content">
            {renderContentBlocks(getKnowledgeCardContent(post), 'markdown')}
          </div>
        </div>
      </button>
      <button
        type="button"
        className={`post-dashboard__knowledge-card-delete${isDeleting ? ' is-loading' : ''}`}
        onClick={() => onDeletePost(post)}
        disabled={isDeleting}
        aria-label={getDeleteActionLabel('knowledge')}
        title={isDeleting ? `正在删除《${post.title}》` : `删除《${post.title}》`}
      >
        <DeleteIcon />
      </button>
    </article>
  )
}

export default function PostDashboard({
  posts,
  search,
  isIndexing,
  contentType,
  recoverableDrafts = [],
  quickCaptureUrl = '',
  isQuickCapturing = false,
  isDeleting = false,
  deletingPostPath = null,
  isTogglingPinned = false,
  togglingPinnedPostPath = null,
  selectedMaterialPaths = [],
  selectedMaterialCounts = { diary: 0, 'read-later': 0 },
  isOrganizingMaterials = false,
  materialResult = null,
  onOpenPost,
  onOpenRecoveredDraft,
  onNewPost,
  onQuickCaptureUrlChange,
  onQuickCapture,
  onDeletePost,
  onTogglePinned,
  onSelectedMaterialPathsChange,
  onClearSelectedMaterials,
  onOrganizeMaterials,
  onSearchFocus,
}: PostDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<DashboardStatusFilter>('all')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [sort, setSort] = useState<PostSort>('date-desc')
  const [viewMode, setViewMode] = useState<DashboardViewMode>(readStoredViewMode)
  const [activeKnowledgeIndex, setActiveKnowledgeIndex] = useState(0)
  const [activeDiaryMonthKey, setActiveDiaryMonthKey] = useState(DIARY_ALL_MONTHS_KEY)
  const dashboardRef = useRef<HTMLElement>(null)
  const isReadLater = contentType === 'read-later'
  const isDiary = contentType === 'diary'
  const isKnowledge = contentType === 'knowledge'
  const isMaterialSelectable = isDiary || isReadLater
  const showQuickActions = true

  const { categories, tags: availableTags } = useMemo(() => {
    const facets = collectPostIndexFacets(posts)
    if (!isKnowledge || facets.categories.includes(KNOWLEDGE_RANDOM_CATEGORY)) {
      return facets
    }

    return {
      ...facets,
      categories: [KNOWLEDGE_RANDOM_CATEGORY, ...facets.categories].sort((left, right) =>
        left.localeCompare(right, 'zh-CN'),
      ),
    }
  }, [isKnowledge, posts])

  useEffect(() => {
    setStatusFilter('all')
    setSelectedCategory(null)
    setSelectedTag(null)
    setSort('date-desc')
    setActiveDiaryMonthKey(DIARY_ALL_MONTHS_KEY)
  }, [contentType])

  const filteredPosts = useMemo(() => {
    const basePosts = filterPostIndex(posts, {
      query: search,
      publishState: isReadLater || isDiary || isKnowledge ? 'all' : (statusFilter as PostPublishState),
      category: isReadLater || isDiary ? null : selectedCategory,
      tag: selectedTag,
      sort,
    })

    const statusFilteredPosts =
      isReadLater && statusFilter !== 'all'
        ? basePosts.filter((post) => normalizeReadLaterStatus(post.readingStatus) === statusFilter)
        : basePosts

    return sortPostIndex(statusFilteredPosts, sort)
  }, [posts, search, isDiary, isKnowledge, isReadLater, statusFilter, selectedCategory, selectedTag, sort])

  const diaryMonthGroups = useMemo(
    () => (isDiary ? groupDiaryPostsByMonth(filteredPosts) : []),
    [filteredPosts, isDiary],
  )
  const visibleDiaryMonthGroups = useMemo(() => {
    if (!isDiary) {
      return []
    }

    if (activeDiaryMonthKey === DIARY_ALL_MONTHS_KEY) {
      return diaryMonthGroups
    }

    return diaryMonthGroups.filter((group) => group.monthKey === activeDiaryMonthKey)
  }, [activeDiaryMonthKey, diaryMonthGroups, isDiary])
  const visibleDiaryPosts = useMemo(
    () => visibleDiaryMonthGroups.flatMap((group) => group.posts),
    [visibleDiaryMonthGroups],
  )
  const selectedMaterialPathSet = useMemo(
    () => new Set(selectedMaterialPaths),
    [selectedMaterialPaths],
  )
  const activeDiaryMonthLabel = useMemo(() => {
    if (activeDiaryMonthKey === DIARY_ALL_MONTHS_KEY) {
      return '全部月份'
    }

    return diaryMonthGroups.find((group) => group.monthKey === activeDiaryMonthKey)?.label || '全部月份'
  }, [activeDiaryMonthKey, diaryMonthGroups])
  const visibleSelectablePosts = useMemo(
    () => (isDiary ? visibleDiaryPosts : isReadLater ? filteredPosts : []),
    [filteredPosts, isDiary, isReadLater, visibleDiaryPosts],
  )
  const selectedVisiblePosts = useMemo(
    () => visibleSelectablePosts.filter((post) => selectedMaterialPathSet.has(post.path)),
    [selectedMaterialPathSet, visibleSelectablePosts],
  )
  const areAllVisibleMaterialsSelected =
    isMaterialSelectable &&
    visibleSelectablePosts.length > 0 &&
    visibleSelectablePosts.every((post) => selectedMaterialPathSet.has(post.path))

  useEffect(() => {
    if (!isDiary || activeDiaryMonthKey === DIARY_ALL_MONTHS_KEY) {
      return
    }

    const hasActiveMonth = diaryMonthGroups.some((group) => group.monthKey === activeDiaryMonthKey)
    if (!hasActiveMonth) {
      setActiveDiaryMonthKey(DIARY_ALL_MONTHS_KEY)
    }
  }, [activeDiaryMonthKey, diaryMonthGroups, isDiary])

  const publishedCount = useMemo(() => posts.filter((post) => post.published).length, [posts])
  const draftCount = useMemo(() => posts.filter((post) => !post.published).length, [posts])
  const unreadCount = useMemo(
    () => posts.filter((post) => normalizeReadLaterStatus(post.readingStatus) === 'unread').length,
    [posts],
  )
  const readingCount = useMemo(
    () => posts.filter((post) => normalizeReadLaterStatus(post.readingStatus) === 'reading').length,
    [posts],
  )
  const doneCount = useMemo(
    () => posts.filter((post) => normalizeReadLaterStatus(post.readingStatus) === 'done').length,
    [posts],
  )

  const statusOptions = isReadLater ? READ_LATER_STATUS_OPTIONS : isDiary || isKnowledge ? [{ value: 'all' as const, label: '全部' }] : POST_STATUS_OPTIONS
  const sortOptions = isReadLater ? READ_LATER_SORT_OPTIONS : POST_SORT_OPTIONS
  const categoryFilterOptions = useMemo(
    () => [{ value: '', label: '全部分类' }, ...categories.map((category) => ({ value: category, label: category }))],
    [categories],
  )
  const tagFilterOptions = useMemo(
    () => [{ value: '', label: '全部标签' }, ...availableTags.map((tag) => ({ value: tag, label: tag }))],
    [availableTags],
  )
  const sortFilterOptions = useMemo(
    () => sortOptions.map((option) => ({ value: option.value, label: option.label })),
    [sortOptions],
  )
  const statCards: DashboardStatCard[] = isReadLater
    ? [
        { value: 'all' as const, label: '全部', count: posts.length },
        { value: 'unread' as const, label: '未读', count: unreadCount, tone: 'unread' as const },
        { value: 'reading' as const, label: '在读', count: readingCount, tone: 'reading' as const },
        { value: 'done' as const, label: '已读', count: doneCount, tone: 'done' as const },
      ]
    : isDiary
      ? []
      : isKnowledge
        ? [
            { value: 'all' as const, label: '全部知识点', count: posts.length },
          ]
    : [
        { value: 'all' as const, label: '全部文章', count: posts.length },
        { value: 'published' as const, label: '已发布', count: publishedCount, tone: 'published' as const },
        { value: 'draft' as const, label: '草稿', count: draftCount, tone: 'draft' as const },
      ]

  const resolvedViewMode: DashboardViewMode = isKnowledge ? 'grid' : viewMode

  const toggleViewMode = useCallback(() => {
    if (isKnowledge || isDiary) {
      return
    }

    setViewMode((current) => {
      const next = current === 'grid' ? 'list' : 'grid'
      try {
        localStorage.setItem(VIEW_MODE_STORAGE_KEY, next)
      } catch {
        // Ignore storage errors
      }
      return next
    })
  }, [isDiary, isKnowledge])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return
      }

      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.closest('.filter-select') ||
        target.closest('.taxonomy-multi-select')
      ) {
        return
      }

      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        onNewPost()
        return
      }

      if (event.key === '/') {
        event.preventDefault()
        onSearchFocus?.()
        return
      }

      if (event.key === 'g' || event.key === 'G') {
        event.preventDefault()
        toggleViewMode()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onNewPost, onSearchFocus, toggleViewMode])

  const isFiltered =
    statusFilter !== 'all' ||
    (!isReadLater && !isDiary && selectedCategory !== null) ||
    selectedTag !== null ||
    search.trim().length > 0
  const filteredKnowledgeKey = useMemo(
    () => (isKnowledge ? filteredPosts.map((post) => post.path).join('|') : ''),
    [filteredPosts, isKnowledge],
  )

  useEffect(() => {
    setActiveKnowledgeIndex(0)
  }, [filteredKnowledgeKey, isKnowledge])

  const handleShowPreviousKnowledge = useCallback(() => {
    if (filteredPosts.length <= 1) {
      return
    }

    setActiveKnowledgeIndex((current) => (current - 1 + filteredPosts.length) % filteredPosts.length)
  }, [filteredPosts.length])

  const handleShowNextKnowledge = useCallback(() => {
    if (filteredPosts.length <= 1) {
      return
    }

    setActiveKnowledgeIndex((current) => (current + 1) % filteredPosts.length)
  }, [filteredPosts.length])

  const clearFilters = () => {
    setStatusFilter('all')
    setSelectedCategory(null)
    setSelectedTag(null)
  }

  const setMaterialSelection = (paths: string[], shouldSelect: boolean) => {
    const next = new Set(selectedMaterialPathSet)
    paths.forEach((path) => {
      if (shouldSelect) {
        next.add(path)
        return
      }

      next.delete(path)
    })
    onSelectedMaterialPathsChange?.(Array.from(next))
  }

  const toggleMaterialSelection = (post: PostIndexItem) => {
    setMaterialSelection([post.path], !selectedMaterialPathSet.has(post.path))
  }

  const toggleAllVisibleMaterialSelection = () => {
    setMaterialSelection(
      visibleSelectablePosts.map((post) => post.path),
      !areAllVisibleMaterialsSelected,
    )
  }

  const helperSelectionSummary = formatSelectedMaterialSummary(selectedMaterialCounts)

  return (
    <section className="post-dashboard" ref={dashboardRef}>
      {recoverableDrafts.length > 0 ? (
        <section className="post-dashboard__recovery" aria-label="本地草稿恢复">
          <div className="post-dashboard__recovery-header">
            <div>
              <p className="post-dashboard__filter-label">本地草稿</p>
              <strong>检测到 {recoverableDrafts.length} 条未恢复的本地草稿</strong>
            </div>
            <span className="post-dashboard__recovery-note">浏览器异常关闭或登录失效后可从这里继续。</span>
          </div>
          <div className="post-dashboard__recovery-list">
            {recoverableDrafts.slice(0, 4).map((draft) => (
              <button
                key={draft.path}
                type="button"
                className="post-dashboard__recovery-item"
                onClick={() => onOpenRecoveredDraft?.(draft.path)}
              >
                <strong>{draft.title}</strong>
                <span>{draft.hasSavedBaseline ? '继续未保存修改' : '恢复未发布新稿'}</span>
                <span>{formatRecoveredDraftTime(draft.updatedAt)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {isReadLater ? (
        <section className="post-dashboard__quick-capture" aria-label="快速收录">
          <div className="post-dashboard__quick-capture-copy">
            <p className="post-dashboard__filter-label">快速收录</p>
            <strong>粘贴链接后直接导入为新的待读草稿</strong>
          </div>
          <div className="post-dashboard__quick-capture-controls">
            <input
              aria-label="快速收录链接"
              className="post-dashboard__quick-capture-input"
              placeholder="https://example.com/article"
              value={quickCaptureUrl}
              onChange={(event) => onQuickCaptureUrlChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onQuickCapture?.()
                }
              }}
            />
            <button
              type="button"
              className="post-dashboard__quick-capture-btn"
              onClick={onQuickCapture}
              disabled={isQuickCapturing}
            >
              {isQuickCapturing ? '导入中…' : '快速收录'}
            </button>
          </div>
        </section>
      ) : null}

      {isDiary || isReadLater ? (
        <section className="post-dashboard__diary-ai" aria-label="月报素材整理助手">
          <div className="post-dashboard__diary-ai-header">
            <div>
              <p className="post-dashboard__filter-label">月报素材</p>
              <strong>可同时整理日记与待读笔记</strong>
              <span className="post-dashboard__diary-ai-count">
                当前已选 {helperSelectionSummary}
              </span>
              {isReadLater ? (
                <span className="post-dashboard__diary-ai-count">
                  待读会提取我的总结、我的评论和有评论的批注。
                </span>
              ) : null}
            </div>
            <div className="post-dashboard__diary-ai-actions">
              <button
                type="button"
                className="post-dashboard__diary-ai-secondary-btn"
                onClick={onClearSelectedMaterials}
                disabled={(selectedMaterialCounts.diary === 0 && selectedMaterialCounts['read-later'] === 0) || isOrganizingMaterials}
              >
                清空已选
              </button>
              <button
                type="button"
                className="post-dashboard__diary-ai-primary-btn"
                onClick={onOrganizeMaterials}
                disabled={(selectedMaterialCounts.diary === 0 && selectedMaterialCounts['read-later'] === 0) || isOrganizingMaterials}
              >
                {isOrganizingMaterials ? '整理中…' : '整理已选素材'}
              </button>
            </div>
          </div>
          {materialResult ? (
            <div className="post-dashboard__diary-ai-result">
              <div className="post-dashboard__diary-ai-result-header">
                <span>整理结果</span>
              </div>
              <pre>{materialResult}</pre>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="post-dashboard__stats-bar">
        <div className="post-dashboard__stats">
          {statCards.map((card) => (
            <button
              key={card.value}
              type="button"
              className={`post-dashboard__stat-card${card.tone ? ` post-dashboard__stat-card--${card.tone}` : ''}${statusFilter === card.value ? ' post-dashboard__stat-card--active' : ''}`}
              onClick={() => {
                setStatusFilter(statusFilter === card.value && card.value !== 'all' ? 'all' : card.value)
                if (card.value === 'all') {
                  setSelectedCategory(null)
                  setSelectedTag(null)
                }
              }}
            >
              <span className="post-dashboard__stat-value">{card.count}</span>
              <span className="post-dashboard__stat-label">{card.label}</span>
            </button>
          ))}
        </div>

        <div className="post-dashboard__kbd-hints" aria-label="快捷键">
          <span><kbd>N</kbd> 新建</span>
          <span><kbd>/</kbd> 搜索</span>
          {!isKnowledge && !isDiary ? <span><kbd>G</kbd> 切换视图</span> : null}
        </div>
      </div>

      <div className="post-dashboard__toolbar">
        <div className="post-dashboard__filter-group">
          <span className="post-dashboard__filter-label">状态</span>
          <div className="post-dashboard__toggle-group">
            {statusOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`post-dashboard__toggle-btn${statusFilter === option.value ? ' is-active' : ''}`}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {!isReadLater && !isDiary ? (
          <div className="post-dashboard__filter-group">
            <span className="post-dashboard__filter-label">分类</span>
            <FilterSelect
              label="分类"
              value={selectedCategory ?? ''}
              options={categoryFilterOptions}
              searchable
              onChange={(nextValue) => setSelectedCategory(nextValue || null)}
            />
          </div>
        ) : null}

        <div className="post-dashboard__filter-group">
          <span className="post-dashboard__filter-label">标签</span>
          <FilterSelect
            label="标签"
            value={selectedTag ?? ''}
            options={tagFilterOptions}
            searchable
            onChange={(nextValue) => setSelectedTag(nextValue || null)}
          />
        </div>

        <div className="post-dashboard__filter-group">
          <span className="post-dashboard__filter-label">排序</span>
          <FilterSelect
            label="排序"
            value={sort}
            options={sortFilterOptions}
            onChange={(nextValue) => setSort(nextValue as PostSort)}
          />
        </div>

        <div className="post-dashboard__toolbar-right">
          {!isKnowledge && !isDiary ? (
            <div className="post-dashboard__view-toggle">
              <button
                type="button"
                className={`post-dashboard__view-btn${viewMode === 'grid' ? ' is-active' : ''}`}
                onClick={() => {
                  setViewMode('grid')
                  try {
                    localStorage.setItem(VIEW_MODE_STORAGE_KEY, 'grid')
                  } catch {
                    // Ignore storage errors
                  }
                }}
                aria-label="网格视图"
                title="网格视图 (G)"
              >
                <GridIcon />
              </button>
              <button
                type="button"
                className={`post-dashboard__view-btn${viewMode === 'list' ? ' is-active' : ''}`}
                onClick={() => {
                  setViewMode('list')
                  try {
                    localStorage.setItem(VIEW_MODE_STORAGE_KEY, 'list')
                  } catch {
                    // Ignore storage errors
                  }
                }}
                aria-label="列表视图"
                title="列表视图 (G)"
              >
                <ListIcon />
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="post-dashboard__new-btn"
            onClick={onNewPost}
            title={isReadLater ? '新建待读 (N)' : isDiary ? '新建日记 (N)' : isKnowledge ? '新建知识点 (N)' : '新建文章 (N)'}
          >
            {isReadLater ? '+ 新建待读' : isDiary ? '+ 新建日记' : isKnowledge ? '+ 新建知识点' : '+ 新建文章'}
          </button>
        </div>
      </div>

      {isReadLater && filteredPosts.length > 0 ? (
        <div className="post-dashboard__diary-selection-bar post-dashboard__diary-selection-bar--reader">
          <label className="post-dashboard__diary-check">
            <input
              type="checkbox"
              aria-label="选择全部可见待读"
              checked={areAllVisibleMaterialsSelected}
              onChange={toggleAllVisibleMaterialSelection}
            />
            <span>选择全部当前结果</span>
          </label>
          <span>
            {selectedVisiblePosts.length > 0
              ? `当前页已选 ${selectedVisiblePosts.length} 条待读`
              : `当前显示 ${filteredPosts.length} 条待读`}
          </span>
        </div>
      ) : null}

      {isIndexing ? (
        <div className="post-dashboard__loading">
          <div className="post-dashboard__skeleton-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="post-dashboard__skeleton-card">
                <div className="post-dashboard__skeleton-line post-dashboard__skeleton-line--short" />
                <div className="post-dashboard__skeleton-line post-dashboard__skeleton-line--title" />
                <div className="post-dashboard__skeleton-line" />
                <div className="post-dashboard__skeleton-line post-dashboard__skeleton-line--medium" />
              </div>
            ))}
          </div>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="post-dashboard__empty">
          <EmptyIllustration />
          {isFiltered ? (
            <>
              <p className="post-dashboard__empty-title">没有找到匹配的{isReadLater ? '待读' : isDiary ? '日记' : isKnowledge ? '知识点' : '文章'}</p>
              <p className="post-dashboard__empty-desc">试试调整筛选条件，或清除搜索内容。</p>
              <button type="button" className="post-dashboard__empty-action" onClick={clearFilters}>
                清除所有筛选
              </button>
            </>
          ) : (
            <>
              <p className="post-dashboard__empty-title">还没有{isReadLater ? '待读' : isDiary ? '日记' : isKnowledge ? '知识点' : '文章'}</p>
              <p className="post-dashboard__empty-desc">
                {isReadLater ? '点击下方按钮保存第一条待读。' : isDiary ? '点击下方按钮写下第一则日记。' : isKnowledge ? '点击下方按钮沉淀第一条知识点。' : '点击下方按钮创建你的第一篇草稿。'}
              </p>
              <button type="button" className="post-dashboard__empty-action" onClick={onNewPost}>
                {isReadLater ? '+ 新建待读' : isDiary ? '+ 新建日记' : isKnowledge ? '+ 新建知识点' : '+ 新建文章'}
              </button>
            </>
          )}
        </div>
      ) : isDiary ? (
        <div className="post-dashboard__diary-months">
          <section className="post-dashboard__diary-month-nav" aria-label="日记月份筛选">
            <div className="post-dashboard__diary-month-nav-header">
              <div>
                <p className="post-dashboard__filter-label">月份视图</p>
              </div>
            </div>
            <div className="post-dashboard__diary-month-pills">
              <button
                type="button"
                aria-label="查看全部月份"
                className={`post-dashboard__diary-month-chip${activeDiaryMonthKey === DIARY_ALL_MONTHS_KEY ? ' is-active' : ''}`}
                onClick={() => setActiveDiaryMonthKey(DIARY_ALL_MONTHS_KEY)}
              >
                <span className="post-dashboard__diary-month-chip-label">全部月份</span>
                <span className="post-dashboard__diary-month-chip-meta">
                  <span className="post-dashboard__diary-month-chip-count">{filteredPosts.length}</span>
                </span>
              </button>
              {diaryMonthGroups.map((group) => {
                const selectedInMonth = group.posts.filter((post) => selectedMaterialPathSet.has(post.path)).length

                return (
                  <button
                    key={group.monthKey}
                    type="button"
                    aria-label={`筛选 ${group.label}`}
                    className={`post-dashboard__diary-month-chip${activeDiaryMonthKey === group.monthKey ? ' is-active' : ''}`}
                    onClick={() => setActiveDiaryMonthKey(group.monthKey)}
                  >
                    <span className="post-dashboard__diary-month-chip-label">{group.label}</span>
                    <span className="post-dashboard__diary-month-chip-meta">
                      <span className="post-dashboard__diary-month-chip-count">{group.posts.length}</span>
                      {selectedInMonth > 0 ? (
                        <span className="post-dashboard__diary-month-chip-selected">已选 {selectedInMonth}</span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
            <div className="post-dashboard__diary-main-column">
              <div className="post-dashboard__diary-selection-bar">
                <label className="post-dashboard__diary-check">
                  <input
                    type="checkbox"
                    aria-label="选择全部可见日记"
                    checked={areAllVisibleMaterialsSelected}
                    onChange={toggleAllVisibleMaterialSelection}
                  />
                  <span>选择全部可见日记</span>
                </label>
                <span>
                {selectedVisiblePosts.length > 0
                  ? `已选择 ${selectedVisiblePosts.length} 篇 · ${activeDiaryMonthLabel}`
                  : `当前显示 ${activeDiaryMonthLabel}`}
                </span>
              </div>
            {visibleDiaryMonthGroups.map((group) => {
              const selectedInMonth = group.posts.filter((post) => selectedMaterialPathSet.has(post.path)).length

              return (
                <section key={group.monthKey} className="post-dashboard__diary-month">
                  <div className="post-dashboard__diary-month-header">
                    <div className="post-dashboard__diary-month-meta">
                      <h3>{group.label}</h3>
                      <span>{group.posts.length} 篇日记{selectedInMonth > 0 ? ` · 已选 ${selectedInMonth} 篇` : ''}</span>
                    </div>
                  </div>
                  <div className="post-dashboard__diary-month-content">
                    <div className="post-dashboard__diary-list">
                      {group.posts.map((post) => {
                        const isSelected = selectedMaterialPathSet.has(post.path)
                        const isDeletingThisPost = deletingPostPath === post.path
                        const isTogglingPinnedThisPost = togglingPinnedPostPath === post.path
                        const isPinnedToggleDisabled = isDeleting || isTogglingPinned

                        return (
                          <div
                            key={post.path}
                            className={`post-dashboard__diary-row${post.pinned ? ' post-dashboard__diary-row--pinned' : ''}${isSelected ? ' is-selected' : ''}`}
                          >
                            <label className="post-dashboard__diary-row-check">
                              <input
                                type="checkbox"
                                aria-label={`选择日记 ${post.title}`}
                                checked={isSelected}
                                onChange={() => toggleMaterialSelection(post)}
                              />
                            </label>
                            <button
                              type="button"
                              className="post-dashboard__diary-main"
                              onClick={() => onOpenPost(post)}
                            >
                              <span className="post-dashboard__diary-date">{post.date ? post.date.slice(0, 10) : '无日期'}</span>
                              <span className="post-dashboard__diary-title">
                                <strong>{post.title}</strong>
                                {post.pinned ? <span className="post-dashboard__pin-mark post-dashboard__pin-mark--inline">置顶</span> : null}
                              </span>
                              <span className="post-dashboard__diary-file">{post.path.replace(/^source\/diary\//, '')}</span>
                            </button>
                            <div className="post-dashboard__list-actions">
                              <button
                                type="button"
                                className={`post-list-item__pin-btn${post.pinned ? ' is-active' : ''}`}
                                onClick={() => onTogglePinned(post)}
                                disabled={isPinnedToggleDisabled}
                                aria-label={getPinActionLabel(contentType, post.pinned)}
                                title={post.pinned ? `取消《${post.title}》的置顶` : `置顶《${post.title}》`}
                              >
                                {isTogglingPinnedThisPost ? '处理中…' : post.pinned ? '已置顶' : '置顶'}
                              </button>
                              <button
                                type="button"
                                className="post-list-item__delete-btn"
                                onClick={() => onDeletePost(post)}
                                disabled={isDeleting}
                                aria-label={getDeleteActionLabel(contentType)}
                                title={`删除《${post.title}》`}
                              >
                                {isDeletingThisPost ? '删除中…' : '删除'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      ) : resolvedViewMode === 'grid' ? (
        isKnowledge ? (
          <div
            className="post-dashboard__knowledge-carousel"
            style={{ '--knowledge-active-index': activeKnowledgeIndex } as CSSProperties}
          >
            <div className="post-dashboard__knowledge-viewport">
              <div className="post-dashboard__knowledge-track">
                {filteredPosts.map((post, index) => (
                  <KnowledgeCard
                    key={post.path}
                    post={post}
                    isActive={index === activeKnowledgeIndex}
                    isDeleting={deletingPostPath === post.path}
                    onOpenPost={onOpenPost}
                    onDeletePost={onDeletePost}
                  />
                ))}
              </div>
            </div>
            {filteredPosts.length > 1 ? (
              <div className="post-dashboard__knowledge-pager" aria-label="知识点翻页">
                <button
                  type="button"
                  className="post-dashboard__knowledge-nav-btn"
                  onClick={handleShowPreviousKnowledge}
                  aria-label="上一条知识点"
                >
                  {'<'}
                </button>
                <span className="post-dashboard__knowledge-page-indicator" aria-live="polite">
                  {activeKnowledgeIndex + 1}/{filteredPosts.length}
                </span>
                <button
                  type="button"
                  className="post-dashboard__knowledge-nav-btn"
                  onClick={handleShowNextKnowledge}
                  aria-label="下一条知识点"
                >
                  {'>'}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="post-dashboard__grid">
            {filteredPosts.map((post) => {
              const statusTone = getStatusTone(post, contentType)
              const statusLabel = getStatusLabel(post, contentType)
              const isSelected = selectedMaterialPathSet.has(post.path)
              const primaryMeta = isReadLater
                ? post.sourceName || '未填写来源'
                : isDiary
                  ? post.tags[0] || '内部记录'
                  : isKnowledge
                    ? post.sourceTitle || (post.sourceType === 'read-later' ? '来自待读' : post.sourceType === 'post' ? '来自文章' : post.sourceType === 'diary' ? '来自日记' : '手动新增')
                    : post.categories[0] || '未分类'
              const secondaryMeta = isReadLater
                ? post.externalUrl || '未填写原文链接'
                : isDiary
                  ? post.path.replace(/^source\/diary\//, '')
                  : isKnowledge
                    ? post.sourceUrl || post.sourcePath || '内部知识库'
                    : post.permalink || '—'

              const cardContent = (
                <>
                  {post.cover ? (
                    <div className="post-dashboard__card-cover" style={{ backgroundImage: `url(${post.cover})` }} />
                  ) : null}
                  <div className="post-dashboard__card-top">
                    <div className="post-dashboard__card-badges">
                      <span className={`post-status-badge post-status-badge--${statusTone}`}>
                        {statusLabel}
                      </span>
                      {post.pinned ? <span className="post-dashboard__pin-mark">置顶</span> : null}
                    </div>
                    <span className="post-dashboard__card-date">{post.date || '无日期'}</span>
                  </div>
                  <h3 className="post-dashboard__card-title">{post.title}</h3>
                  {contentType !== 'diary' ? <p className="post-dashboard__card-desc">{post.desc || '暂无摘要'}</p> : null}
                  {post.tags.length > 0 ? (
                    <div className="post-dashboard__card-tags">
                      {post.tags.slice(0, 4).map((tag) => (
                        <TagBadge key={tag} tag={tag} />
                      ))}
                      {post.tags.length > 4 ? <span className="post-dashboard__tag-more">+{post.tags.length - 4}</span> : null}
                    </div>
                  ) : null}
                  <div className="post-dashboard__card-footer">
                    <span className="post-dashboard__card-category">{primaryMeta}</span>
                    <span className="post-dashboard__card-link">{secondaryMeta}</span>
                  </div>
                </>
              )

              if (isReadLater) {
                return (
                  <article
                    key={post.path}
                    className={`post-dashboard__card-shell${isSelected ? ' is-selected' : ''}`}
                  >
                    <label className="post-dashboard__card-check">
                      <input
                        type="checkbox"
                        aria-label={`选择待读 ${post.title}`}
                        checked={isSelected}
                        onChange={() => toggleMaterialSelection(post)}
                      />
                    </label>
                    <button
                      type="button"
                      className={`post-dashboard__card${post.pinned ? ' post-dashboard__card--pinned' : ''}${isSelected ? ' is-selected' : ''}`}
                      onClick={() => onOpenPost(post)}
                    >
                      {cardContent}
                    </button>
                  </article>
                )
              }

              return (
                <button
                  key={post.path}
                  type="button"
                  className={`post-dashboard__card${post.pinned ? ' post-dashboard__card--pinned' : ''}`}
                  onClick={() => onOpenPost(post)}
                >
                  {cardContent}
                </button>
              )
            })}
          </div>
        )
      ) : (
        <div className="post-dashboard__list">
          <div className={`post-dashboard__list-header${showQuickActions ? ' post-dashboard__list-header--with-actions' : ''}${isReadLater ? ' post-dashboard__list-header--selectable' : ''}`}>
            {isReadLater ? <span className="post-dashboard__list-col post-dashboard__list-col--check" aria-hidden="true" /> : null}
            <div className="post-dashboard__list-header-main">
              <span className="post-dashboard__list-col post-dashboard__list-col--status">状态</span>
              <span className="post-dashboard__list-col post-dashboard__list-col--title">标题</span>
              <span className="post-dashboard__list-col post-dashboard__list-col--category">{isReadLater ? '来源' : isDiary ? '标记' : isKnowledge ? '来源内容' : '分类'}</span>
              <span className="post-dashboard__list-col post-dashboard__list-col--tags">标签</span>
              <span className="post-dashboard__list-col post-dashboard__list-col--date">日期</span>
              <span className="post-dashboard__list-col post-dashboard__list-col--link">{isReadLater ? '原文链接' : isDiary ? '文件' : isKnowledge ? '来源定位' : '链接'}</span>
            </div>
            {showQuickActions ? <span className="post-dashboard__list-col post-dashboard__list-col--actions">操作</span> : null}
          </div>
          {filteredPosts.map((post) => {
            const statusTone = getStatusTone(post, contentType)
            const statusLabel = getStatusLabel(post, contentType)
            const isSelected = selectedMaterialPathSet.has(post.path)
            const isDeletingThisPost = deletingPostPath === post.path
            const isTogglingPinnedThisPost = togglingPinnedPostPath === post.path
            const isPinnedToggleDisabled = isDeleting || isTogglingPinned

            return (
              <div
                key={post.path}
                className={`post-dashboard__list-row${showQuickActions ? ' post-dashboard__list-row--with-actions' : ''}${isReadLater ? ' post-dashboard__list-row--selectable' : ''}${post.pinned ? ' post-dashboard__list-row--pinned' : ''}${isReadLater && isSelected ? ' is-selected' : ''}`}
              >
                {isReadLater ? (
                  <label className="post-dashboard__diary-row-check post-dashboard__list-row-check">
                    <input
                      type="checkbox"
                      aria-label={`选择待读 ${post.title}`}
                      checked={isSelected}
                      onChange={() => toggleMaterialSelection(post)}
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  className="post-dashboard__list-main"
                  onClick={() => onOpenPost(post)}
                >
                  <span className="post-dashboard__list-col post-dashboard__list-col--status">
                    <span className={`post-status-dot post-status-dot--${statusTone}`} title={statusLabel} />
                    <span className="post-dashboard__list-status-text">{statusLabel}</span>
                  </span>
                  <span className="post-dashboard__list-col post-dashboard__list-col--title">
                    <span className="post-dashboard__list-title-line">
                      <strong>{post.title}</strong>
                      {post.pinned ? <span className="post-dashboard__pin-mark post-dashboard__pin-mark--inline">置顶</span> : null}
                    </span>
                    {post.desc ? <span className="post-dashboard__list-desc">{post.desc}</span> : null}
                  </span>
                  <span className="post-dashboard__list-col post-dashboard__list-col--category">
                    <span className="post-dashboard__card-category">
                      {isReadLater
                        ? post.sourceName || '未填写来源'
                        : isDiary
                          ? post.tags[0] || '内部记录'
                          : isKnowledge
                            ? post.sourceTitle || (post.sourceType === 'read-later' ? '来自待读' : post.sourceType === 'post' ? '来自文章' : post.sourceType === 'diary' ? '来自日记' : '手动新增')
                          : post.categories[0] || '未分类'}
                    </span>
                  </span>
                  <span className="post-dashboard__list-col post-dashboard__list-col--tags">
                    {post.tags.length > 0 ? (
                      <span className="post-dashboard__list-tags">
                        {post.tags.slice(0, 3).map((tag) => (
                          <TagBadge key={tag} tag={tag} />
                        ))}
                        {post.tags.length > 3 ? <span className="post-dashboard__tag-more">+{post.tags.length - 3}</span> : null}
                      </span>
                    ) : (
                      <span className="post-dashboard__list-no-tags">—</span>
                    )}
                  </span>
                  <span className="post-dashboard__list-col post-dashboard__list-col--date">
                    {post.date ? post.date.slice(0, 10) : '—'}
                  </span>
                  <span className="post-dashboard__list-col post-dashboard__list-col--link">
                    {isReadLater ? post.externalUrl || '未填写原文链接' : isDiary ? post.path.replace(/^source\/diary\//, '') : isKnowledge ? post.sourceUrl || post.sourcePath || '内部知识库' : post.permalink || '—'}
                  </span>
                </button>
                {showQuickActions ? (
                  <div className="post-dashboard__list-actions">
                    <button
                      type="button"
                      className={`post-list-item__pin-btn${post.pinned ? ' is-active' : ''}`}
                      onClick={() => onTogglePinned(post)}
                      disabled={isPinnedToggleDisabled}
                      aria-label={getPinActionLabel(contentType, post.pinned)}
                      title={post.pinned ? `取消《${post.title}》的置顶` : `置顶《${post.title}》`}
                    >
                      {isTogglingPinnedThisPost ? '处理中…' : post.pinned ? '已置顶' : '置顶'}
                    </button>
                    <button
                      type="button"
                      className="post-list-item__delete-btn"
                      onClick={() => onDeletePost(post)}
                      disabled={isDeleting}
                      aria-label={getDeleteActionLabel(contentType)}
                      title={`删除《${post.title}》`}
                    >
                      {isDeletingThisPost ? '删除中…' : '删除'}
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {!isIndexing && filteredPosts.length > 0 ? (
        <p className="post-dashboard__count-note">
          共 {filteredPosts.length} {isReadLater ? '条待读' : isDiary ? '篇日记' : isKnowledge ? '条知识点' : '篇文章'}
          {filteredPosts.length !== posts.length ? `（全部 ${posts.length} ${isReadLater || isKnowledge ? '条' : '篇'}）` : ''}
        </p>
      ) : null}
    </section>
  )
}
