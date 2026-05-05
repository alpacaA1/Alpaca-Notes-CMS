import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KNOWLEDGE_RANDOM_CATEGORY } from '../knowledge/constants'
import { collectPostIndexFacets, filterPostIndex, sortPostIndex } from '../posts/index-posts'
import type { ReadingStatus } from '../posts/parse-post'
import type { ContentType, PostIndexItem, PostPublishState, PostSort } from '../posts/post-types'

type DashboardViewMode = 'grid' | 'list'
type DashboardStatusFilter = 'all' | 'published' | 'draft' | ReadingStatus
type StatusTone = Exclude<DashboardStatusFilter, 'all'>

type RecoverableDraft = {
  path: string
  title: string
  updatedAt: string
  hasSavedBaseline: boolean
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
  onOpenPost: (post: PostIndexItem) => void
  onOpenRecoveredDraft?: (path: string) => void
  onNewPost: () => void
  onQuickCaptureUrlChange?: (value: string) => void
  onQuickCapture?: () => void
  onDeletePost: (post: PostIndexItem) => void
  onTogglePinned: (post: PostIndexItem) => void
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
const DEFAULT_KNOWLEDGE_CARD_LINE_CLAMP = 8

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

function getKnowledgeCardContent(post: PostIndexItem) {
  return post.title.trim() || post.desc.trim() || '未命名知识点'
}

function KnowledgeCard({
  post,
  onOpenPost,
}: {
  post: PostIndexItem
  onOpenPost: (post: PostIndexItem) => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLParagraphElement>(null)
  const [lineClamp, setLineClamp] = useState(DEFAULT_KNOWLEDGE_CARD_LINE_CLAMP)

  useEffect(() => {
    const bodyElement = bodyRef.current
    if (!bodyElement) {
      return
    }

    const updateLineClamp = () => {
      const nextBodyElement = bodyRef.current
      if (!nextBodyElement) {
        return
      }

      const contentElement = contentRef.current
      const styles = window.getComputedStyle(contentElement || nextBodyElement)
      const fontSize = Number.parseFloat(styles.fontSize) || 16
      const lineHeight = Number.parseFloat(styles.lineHeight) || fontSize * 1.8
      const availableHeight = nextBodyElement.clientHeight

      if (availableHeight <= 0 || lineHeight <= 0) {
        setLineClamp(DEFAULT_KNOWLEDGE_CARD_LINE_CLAMP)
        return
      }

      setLineClamp(Math.max(1, Math.floor(availableHeight / lineHeight)))
    }

    updateLineClamp()

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        updateLineClamp()
      })
      resizeObserver.observe(bodyElement)

      return () => {
        resizeObserver.disconnect()
      }
    }

    window.addEventListener('resize', updateLineClamp)
    return () => {
      window.removeEventListener('resize', updateLineClamp)
    }
  }, [post.path])

  return (
    <button
      type="button"
      className={`post-dashboard__card post-dashboard__card--knowledge${post.pinned ? ' post-dashboard__card--pinned' : ''}`}
      onClick={() => onOpenPost(post)}
    >
      <span className="post-dashboard__knowledge-card-date">{formatKnowledgeCardDate(post.date)}</span>
      <div className="post-dashboard__knowledge-card-body" ref={bodyRef}>
        <p ref={contentRef} className="post-dashboard__knowledge-card-content" style={{ WebkitLineClamp: lineClamp }}>
          {getKnowledgeCardContent(post)}
        </p>
      </div>
    </button>
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
  onOpenPost,
  onOpenRecoveredDraft,
  onNewPost,
  onQuickCaptureUrlChange,
  onQuickCapture,
  onDeletePost,
  onTogglePinned,
  onSearchFocus,
}: PostDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<DashboardStatusFilter>('all')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [sort, setSort] = useState<PostSort>('date-desc')
  const [viewMode, setViewMode] = useState<DashboardViewMode>(readStoredViewMode)
  const dashboardRef = useRef<HTMLElement>(null)
  const isReadLater = contentType === 'read-later'
  const isDiary = contentType === 'diary'
  const isKnowledge = contentType === 'knowledge'
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
  }, [posts, search, isReadLater, statusFilter, selectedCategory, selectedTag, sort])

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
  const statCards = isReadLater
    ? [
        { value: 'all' as const, label: '全部', count: posts.length },
        { value: 'unread' as const, label: '未读', count: unreadCount, tone: 'unread' as const },
        { value: 'reading' as const, label: '在读', count: readingCount, tone: 'reading' as const },
        { value: 'done' as const, label: '已读', count: doneCount, tone: 'done' as const },
      ]
    : isDiary
      ? [
          { value: 'all' as const, label: '全部日记', count: posts.length },
        ]
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
    if (isKnowledge) {
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
  }, [isKnowledge])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
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

  const clearFilters = () => {
    setStatusFilter('all')
    setSelectedCategory(null)
    setSelectedTag(null)
  }

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
          {!isKnowledge ? <span><kbd>G</kbd> 切换视图</span> : null}
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
            <select
              className="post-dashboard__select"
              value={selectedCategory ?? ''}
              onChange={(event) => setSelectedCategory(event.target.value || null)}
            >
              <option value="">全部分类</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="post-dashboard__filter-group">
          <span className="post-dashboard__filter-label">标签</span>
          <select
            className="post-dashboard__select"
            value={selectedTag ?? ''}
            onChange={(event) => setSelectedTag(event.target.value || null)}
          >
            <option value="">全部标签</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </div>

        <div className="post-dashboard__filter-group">
          <span className="post-dashboard__filter-label">排序</span>
          <select
            className="post-dashboard__select"
            value={sort}
            onChange={(event) => setSort(event.target.value as PostSort)}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="post-dashboard__toolbar-right">
          {!isKnowledge ? (
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
      ) : resolvedViewMode === 'grid' ? (
        <div className="post-dashboard__grid">
          {filteredPosts.map((post) => {
            if (isKnowledge) {
              return (
                <KnowledgeCard key={post.path} post={post} onOpenPost={onOpenPost} />
              )
            }

            const statusTone = getStatusTone(post, contentType)
            const statusLabel = getStatusLabel(post, contentType)
            const primaryMeta = isReadLater
              ? post.sourceName || '未填写来源'
              : isDiary
                ? post.tags[0] || '内部记录'
                : isKnowledge
                  ? post.sourceTitle || (post.sourceType === 'read-later' ? '来自待读' : post.sourceType === 'post' ? '来自文章' : '手动新增')
                  : post.categories[0] || '未分类'
            const secondaryMeta = isReadLater
              ? post.externalUrl || '未填写原文链接'
              : isDiary
                ? post.path.replace(/^source\/diary\//, '')
                : isKnowledge
                  ? post.sourceUrl || post.sourcePath || '内部知识库'
                  : post.permalink || '—'

            return (
              <button
                key={post.path}
                type="button"
                className={`post-dashboard__card${post.pinned ? ' post-dashboard__card--pinned' : ''}`}
                onClick={() => onOpenPost(post)}
              >
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
                <p className="post-dashboard__card-desc">{post.desc || '暂无摘要'}</p>
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
              </button>
            )
          })}
        </div>
      ) : (
        <div className="post-dashboard__list">
          <div className={`post-dashboard__list-header${showQuickActions ? ' post-dashboard__list-header--with-actions' : ''}`}>
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
            const isDeletingThisPost = deletingPostPath === post.path
            const isTogglingPinnedThisPost = togglingPinnedPostPath === post.path
            const isPinnedToggleDisabled = isDeleting || isTogglingPinned

            return (
              <div
                key={post.path}
                className={`post-dashboard__list-row${showQuickActions ? ' post-dashboard__list-row--with-actions' : ''}${post.pinned ? ' post-dashboard__list-row--pinned' : ''}`}
              >
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
                            ? post.sourceTitle || (post.sourceType === 'read-later' ? '来自待读' : post.sourceType === 'post' ? '来自文章' : '手动新增')
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
                      aria-label={contentType === 'read-later' ? '删除待读条目' : contentType === 'diary' ? '删除日记' : contentType === 'knowledge' ? '删除知识点' : '删除文章'}
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
