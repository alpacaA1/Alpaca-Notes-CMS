import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { collectPostIndexFacets, filterPostIndex, sortPostIndex } from '../posts/index-posts'
import type { PostIndexItem, PostPublishState, PostSort } from '../posts/post-types'

type DashboardViewMode = 'grid' | 'list'

type PostDashboardProps = {
  posts: PostIndexItem[]
  search: string
  isIndexing: boolean
  onOpenPost: (post: PostIndexItem) => void
  onNewPost: () => void
  onSearchFocus?: () => void
}

const PUBLISH_STATE_OPTIONS: { value: PostPublishState; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'published', label: '已发布' },
  { value: 'draft', label: '草稿' },
]

const SORT_OPTIONS: { value: PostSort; label: string }[] = [
  { value: 'date-desc', label: '最新发布' },
  { value: 'date-asc', label: '最早发布' },
  { value: 'title-asc', label: '标题 A→Z' },
  { value: 'title-desc', label: '标题 Z→A' },
]

const VIEW_MODE_STORAGE_KEY = 'alpaca-dashboard-view-mode'

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

export default function PostDashboard({
  posts,
  search,
  isIndexing,
  onOpenPost,
  onNewPost,
  onSearchFocus,
}: PostDashboardProps) {
  const [publishState, setPublishState] = useState<PostPublishState>('all')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [sort, setSort] = useState<PostSort>('date-desc')
  const [viewMode, setViewMode] = useState<DashboardViewMode>(readStoredViewMode)
  const dashboardRef = useRef<HTMLElement>(null)

  const { categories, tags: availableTags } = useMemo(() => collectPostIndexFacets(posts), [posts])

  const filteredPosts = useMemo(() => {
    const filtered = filterPostIndex(posts, {
      query: search,
      publishState,
      category: selectedCategory,
      tag: selectedTag,
      sort,
    })
    return sortPostIndex(filtered, sort)
  }, [posts, search, publishState, selectedCategory, selectedTag, sort])

  const publishedCount = useMemo(() => posts.filter((p) => p.published).length, [posts])
  const draftCount = useMemo(() => posts.filter((p) => !p.published).length, [posts])

  const toggleViewMode = useCallback(() => {
    setViewMode((current) => {
      const next = current === 'grid' ? 'list' : 'grid'
      try {
        localStorage.setItem(VIEW_MODE_STORAGE_KEY, next)
      } catch {
        // Ignore storage errors
      }
      return next
    })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore when typing in inputs
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
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onNewPost, onSearchFocus, toggleViewMode])

  const isFiltered = publishState !== 'all' || selectedCategory !== null || selectedTag !== null || search.trim().length > 0

  return (
    <section className="post-dashboard" ref={dashboardRef}>
      {/* Stats overview */}
      <div className="post-dashboard__stats">
        <button
          type="button"
          className={`post-dashboard__stat-card${publishState === 'all' ? ' post-dashboard__stat-card--active' : ''}`}
          onClick={() => { setPublishState('all'); setSelectedCategory(null); setSelectedTag(null) }}
        >
          <span className="post-dashboard__stat-value">{posts.length}</span>
          <span className="post-dashboard__stat-label">全部文章</span>
        </button>
        <button
          type="button"
          className={`post-dashboard__stat-card post-dashboard__stat-card--published${publishState === 'published' ? ' post-dashboard__stat-card--active' : ''}`}
          onClick={() => setPublishState(publishState === 'published' ? 'all' : 'published')}
        >
          <span className="post-dashboard__stat-value">{publishedCount}</span>
          <span className="post-dashboard__stat-label">已发布</span>
        </button>
        <button
          type="button"
          className={`post-dashboard__stat-card post-dashboard__stat-card--draft${publishState === 'draft' ? ' post-dashboard__stat-card--active' : ''}`}
          onClick={() => setPublishState(publishState === 'draft' ? 'all' : 'draft')}
        >
          <span className="post-dashboard__stat-value">{draftCount}</span>
          <span className="post-dashboard__stat-label">草稿</span>
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="post-dashboard__toolbar">
        <div className="post-dashboard__filter-group">
          <span className="post-dashboard__filter-label">状态</span>
          <div className="post-dashboard__toggle-group">
            {PUBLISH_STATE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`post-dashboard__toggle-btn${publishState === option.value ? ' is-active' : ''}`}
                onClick={() => setPublishState(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="post-dashboard__filter-group">
          <span className="post-dashboard__filter-label">分类</span>
          <select
            className="post-dashboard__select"
            value={selectedCategory ?? ''}
            onChange={(event) => setSelectedCategory(event.target.value || null)}
          >
            <option value="">全部分类</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

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
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="post-dashboard__toolbar-right">
          <div className="post-dashboard__view-toggle">
            <button
              type="button"
              className={`post-dashboard__view-btn${viewMode === 'grid' ? ' is-active' : ''}`}
              onClick={() => { setViewMode('grid'); try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, 'grid') } catch {} }}
              aria-label="网格视图"
              title="网格视图 (G)"
            >
              <GridIcon />
            </button>
            <button
              type="button"
              className={`post-dashboard__view-btn${viewMode === 'list' ? ' is-active' : ''}`}
              onClick={() => { setViewMode('list'); try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, 'list') } catch {} }}
              aria-label="列表视图"
              title="列表视图 (G)"
            >
              <ListIcon />
            </button>
          </div>
          <button type="button" className="post-dashboard__new-btn" onClick={onNewPost} title="新建文章 (N)">
            + 新建文章
          </button>
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="post-dashboard__kbd-hints">
        <span><kbd>N</kbd> 新建</span>
        <span><kbd>/</kbd> 搜索</span>
        <span><kbd>G</kbd> 切换视图</span>
      </div>

      {/* Article content */}
      {isIndexing ? (
        <div className="post-dashboard__loading">
          <div className="post-dashboard__skeleton-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="post-dashboard__skeleton-card">
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
              <p className="post-dashboard__empty-title">没有找到匹配的文章</p>
              <p className="post-dashboard__empty-desc">试试调整筛选条件，或清除搜索内容。</p>
              <button
                type="button"
                className="post-dashboard__empty-action"
                onClick={() => { setPublishState('all'); setSelectedCategory(null); setSelectedTag(null) }}
              >
                清除所有筛选
              </button>
            </>
          ) : (
            <>
              <p className="post-dashboard__empty-title">还没有文章</p>
              <p className="post-dashboard__empty-desc">点击下方按钮创建你的第一篇草稿。</p>
              <button type="button" className="post-dashboard__empty-action" onClick={onNewPost}>
                + 新建文章
              </button>
            </>
          )}
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid view */
        <div className="post-dashboard__grid">
          {filteredPosts.map((post) => (
            <button
              key={post.path}
              type="button"
              className="post-dashboard__card"
              onClick={() => onOpenPost(post)}
            >
              <div className="post-dashboard__card-top">
                <span
                  className={`post-status-badge post-status-badge--${post.published ? 'published' : 'draft'}`}
                >
                  {post.published ? '已发布' : '草稿'}
                </span>
                <span className="post-dashboard__card-date">{post.date || '无日期'}</span>
              </div>
              <h3 className="post-dashboard__card-title">{post.title}</h3>
              <p className="post-dashboard__card-desc">{post.desc || '暂无摘要'}</p>
              {post.tags.length > 0 ? (
                <div className="post-dashboard__card-tags">
                  {post.tags.slice(0, 4).map((tag) => (
                    <TagBadge key={tag} tag={tag} />
                  ))}
                  {post.tags.length > 4 ? (
                    <span className="post-dashboard__tag-more">+{post.tags.length - 4}</span>
                  ) : null}
                </div>
              ) : null}
              <div className="post-dashboard__card-footer">
                <span className="post-dashboard__card-category">
                  {post.categories[0] || '未分类'}
                </span>
                {post.permalink ? (
                  <span className="post-dashboard__card-link">{post.permalink}</span>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* List view */
        <div className="post-dashboard__list">
          <div className="post-dashboard__list-header">
            <span className="post-dashboard__list-col post-dashboard__list-col--status">状态</span>
            <span className="post-dashboard__list-col post-dashboard__list-col--title">标题</span>
            <span className="post-dashboard__list-col post-dashboard__list-col--category">分类</span>
            <span className="post-dashboard__list-col post-dashboard__list-col--tags">标签</span>
            <span className="post-dashboard__list-col post-dashboard__list-col--date">日期</span>
            <span className="post-dashboard__list-col post-dashboard__list-col--link">链接</span>
          </div>
          {filteredPosts.map((post) => (
            <button
              key={post.path}
              type="button"
              className="post-dashboard__list-row"
              onClick={() => onOpenPost(post)}
            >
              <span className="post-dashboard__list-col post-dashboard__list-col--status">
                <span
                  className={`post-status-dot post-status-dot--${post.published ? 'published' : 'draft'}`}
                  title={post.published ? '已发布' : '草稿'}
                />
                <span className="post-dashboard__list-status-text">
                  {post.published ? '已发布' : '草稿'}
                </span>
              </span>
              <span className="post-dashboard__list-col post-dashboard__list-col--title">
                <strong>{post.title}</strong>
                {post.desc ? <span className="post-dashboard__list-desc">{post.desc}</span> : null}
              </span>
              <span className="post-dashboard__list-col post-dashboard__list-col--category">
                <span className="post-dashboard__card-category">{post.categories[0] || '未分类'}</span>
              </span>
              <span className="post-dashboard__list-col post-dashboard__list-col--tags">
                {post.tags.length > 0 ? (
                  <span className="post-dashboard__list-tags">
                    {post.tags.slice(0, 3).map((tag) => (
                      <TagBadge key={tag} tag={tag} />
                    ))}
                    {post.tags.length > 3 ? (
                      <span className="post-dashboard__tag-more">+{post.tags.length - 3}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="post-dashboard__list-no-tags">—</span>
                )}
              </span>
              <span className="post-dashboard__list-col post-dashboard__list-col--date">
                {post.date ? post.date.slice(0, 10) : '—'}
              </span>
              <span className="post-dashboard__list-col post-dashboard__list-col--link">
                {post.permalink || '—'}
              </span>
            </button>
          ))}
        </div>
      )}

      {!isIndexing && filteredPosts.length > 0 ? (
        <p className="post-dashboard__count-note">
          共 {filteredPosts.length} 篇{filteredPosts.length !== posts.length ? `（全部 ${posts.length} 篇）` : ''}
        </p>
      ) : null}
    </section>
  )
}
