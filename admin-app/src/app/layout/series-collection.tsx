import { useMemo, useState } from 'react'
import { sortPostIndex } from '../posts/index-posts'
import type { ContentType, PostIndexItem } from '../posts/post-types'

type SeriesCollectionProps = {
  posts: PostIndexItem[]
  contentType: ContentType
  onOpenPost: (post: PostIndexItem) => void
  onBack: () => void
}

type SeriesGroup = {
  name: string
  posts: PostIndexItem[]
}

function groupPostsBySeries(posts: PostIndexItem[]): SeriesGroup[] {
  const grouped = new Map<string, PostIndexItem[]>()

  posts.forEach((post) => {
    const series = post.series
    if (!series) {
      return
    }

    grouped.set(series, [...(grouped.get(series) || []), post])
  })

  return Array.from(grouped.entries())
    .map(([name, seriesPosts]) => ({
      name,
      posts: sortPostIndex(seriesPosts, 'date-desc'),
    }))
    .sort((left, right) => right.posts.length - left.posts.length)
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{
        transition: 'transform 200ms ease',
        transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
      }}
    >
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function SeriesCollection({ posts, contentType, onOpenPost, onBack }: SeriesCollectionProps) {
  const [expandedSeries, setExpandedSeries] = useState<Set<string>>(() => new Set())

  const seriesGroups = useMemo(() => groupPostsBySeries(posts), [posts])

  const toggleSeries = (name: string) => {
    setExpandedSeries((current) => {
      const next = new Set(current)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedSeries(new Set(seriesGroups.map((group) => group.name)))
  }

  const collapseAll = () => {
    setExpandedSeries(new Set())
  }

  return (
    <section className="series-collection">
      <div className="series-collection__header">
        <button type="button" className="series-collection__back" onClick={onBack}>
          ← 返回文章
        </button>
        <h2 className="series-collection__title">合集</h2>
        <div className="series-collection__actions">
          <button type="button" className="series-collection__action-btn" onClick={expandAll}>
            全部展开
          </button>
          <button type="button" className="series-collection__action-btn" onClick={collapseAll}>
            全部收起
          </button>
        </div>
      </div>

      {seriesGroups.length === 0 ? (
        <div className="series-collection__empty">
          <p className="series-collection__empty-title">还没有合集</p>
          <p className="series-collection__empty-desc">
            在文章设置面板中填写「系列」字段，同一系列名称的文章会自动归到这里。
          </p>
        </div>
      ) : (
        <div className="series-collection__list">
          {seriesGroups.map((group) => {
            const isExpanded = expandedSeries.has(group.name)

            return (
              <div key={group.name} className={`series-collection__group${isExpanded ? ' is-expanded' : ''}`}>
                <button
                  type="button"
                  className="series-collection__group-header"
                  onClick={() => toggleSeries(group.name)}
                  aria-expanded={isExpanded}
                >
                  <span className="series-collection__group-chevron">
                    <ChevronIcon expanded={isExpanded} />
                  </span>
                  <span className="series-collection__group-name">{group.name}</span>
                  <span className="series-collection__group-count">{group.posts.length} 篇</span>
                </button>

                {isExpanded ? (
                  <div className="series-collection__group-items">
                    {group.posts.map((post) => {
                      const isDeleting = false

                      return (
                        <button
                          key={post.path}
                          type="button"
                          className="series-collection__item"
                          onClick={() => onOpenPost(post)}
                        >
                          <span className="series-collection__item-date">
                            {post.date ? post.date.slice(0, 10) : '—'}
                          </span>
                          <span className="series-collection__item-main">
                            <strong>{post.title}</strong>
                            {post.desc ? <span className="series-collection__item-desc">{post.desc}</span> : null}
                          </span>
                          <span className="series-collection__item-meta">
                            <span className={`post-status-badge post-status-badge--${post.published ? 'published' : 'draft'}`}>
                              {post.published ? '已发布' : '草稿'}
                            </span>
                            <span>{post.categories[0] || '未分类'}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}