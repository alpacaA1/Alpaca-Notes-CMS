import { useMemo } from 'react'
import type { SharedFeedCategory, SharedFeedSource } from '../read-later/feed-directory-client'
import type { ImportedFeed, ImportedFeedItem } from '../read-later/feed-import-client'
import type { FeedSubscription } from '../rss/feed-subscriptions'

type FeedDashboardProps = {
  search: string
  manualFeedUrl: string
  isLoading: boolean
  isSavingFeed: boolean
  subscriptions: FeedSubscription[]
  selectedSubscriptionUrl: string | null
  previewFeed: ImportedFeed | null
  isPreviewLoading: boolean
  previewImportingItemUrl: string | null
  directoryCategories: SharedFeedCategory[]
  isDirectoryVisible: boolean
  isDirectoryLoading: boolean
  directoryPendingFeedUrl: string | null
  onManualFeedUrlChange: (value: string) => void
  onAddManualFeed: () => void
  onToggleDirectory: () => void
  onOpenDirectoryFeed: (feed: SharedFeedSource) => void
  onSelectSubscription: (subscription: FeedSubscription) => void
  onRemoveSubscription: (subscription: FeedSubscription) => void
  onImportFeedItem: (item: ImportedFeedItem) => void
}

function formatFeedMetaDate(value: string) {
  if (!value) {
    return '未同步'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function FeedDashboard({
  search,
  manualFeedUrl,
  isLoading,
  isSavingFeed,
  subscriptions,
  selectedSubscriptionUrl,
  previewFeed,
  isPreviewLoading,
  previewImportingItemUrl,
  directoryCategories,
  isDirectoryVisible,
  isDirectoryLoading,
  directoryPendingFeedUrl,
  onManualFeedUrlChange,
  onAddManualFeed,
  onToggleDirectory,
  onOpenDirectoryFeed,
  onSelectSubscription,
  onRemoveSubscription,
  onImportFeedItem,
}: FeedDashboardProps) {
  const normalizedSearch = search.trim().toLowerCase()

  const filteredSubscriptions = useMemo(() => {
    if (!normalizedSearch) {
      return subscriptions
    }

    return subscriptions.filter((subscription) =>
      [
        subscription.title,
        subscription.description,
        subscription.category,
        subscription.url,
      ].some((value) => value.toLowerCase().includes(normalizedSearch)),
    )
  }, [normalizedSearch, subscriptions])

  const selectedSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.url === selectedSubscriptionUrl) || null,
    [selectedSubscriptionUrl, subscriptions],
  )

  const sharedFeedUrlSet = useMemo(
    () => new Set(subscriptions.map((subscription) => subscription.url)),
    [subscriptions],
  )

  return (
    <section className="feed-dashboard">
      <section className="feed-dashboard__hero">
        <div className="feed-dashboard__hero-copy">
          <p className="feed-dashboard__eyebrow">RSS 工作台</p>
          <h1>订阅 feed，再把条目加入待读</h1>
          <p>RSS 页面负责管理 feed、预览最新条目和导入待读。待读页面只保留阅读与评论。</p>
        </div>
        <div className="feed-dashboard__hero-stats" aria-label="RSS 统计">
          <div className="feed-dashboard__hero-stat">
            <dt>已订阅</dt>
            <dd>{subscriptions.length}</dd>
          </div>
          <div className="feed-dashboard__hero-stat">
            <dt>共享分类</dt>
            <dd>{directoryCategories.length}</dd>
          </div>
        </div>
      </section>

      <section className="feed-dashboard__composer" aria-label="新增 feed">
        <div className="feed-dashboard__composer-copy">
          <p className="feed-dashboard__section-label">新增 feed</p>
          <strong>支持手动新增，也支持从共享目录一键订阅</strong>
        </div>
        <div className="feed-dashboard__composer-controls">
          <input
            aria-label="Feed URL"
            className="feed-dashboard__composer-input"
            placeholder="https://example.com/feed.xml"
            value={manualFeedUrl}
            onChange={(event) => onManualFeedUrlChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onAddManualFeed()
              }
            }}
          />
          <button
            type="button"
            className="feed-dashboard__composer-btn"
            onClick={onAddManualFeed}
            disabled={isSavingFeed}
          >
            {isSavingFeed ? '订阅中…' : '新增 feed'}
          </button>
          <button
            type="button"
            className="feed-dashboard__composer-secondary-btn"
            onClick={onToggleDirectory}
            disabled={isDirectoryLoading}
          >
            {isDirectoryLoading ? '目录加载中…' : isDirectoryVisible ? '收起共享目录' : '共享 RSS 源目录'}
          </button>
        </div>
      </section>

      {isDirectoryVisible ? (
        <section className="feed-dashboard__directory" aria-label="共享 RSS 源目录">
          <div className="feed-dashboard__directory-header">
            <div>
              <p className="feed-dashboard__section-label">共享目录</p>
              <strong>按分类浏览现成 feed，订阅后直接预览最近条目</strong>
            </div>
            <span>{directoryCategories.length > 0 ? `${directoryCategories.length} 个分类` : '共享目录'}</span>
          </div>
          {isDirectoryLoading ? (
            <div className="feed-dashboard__directory-empty">正在加载共享 RSS 源目录…</div>
          ) : directoryCategories.length === 0 ? (
            <div className="feed-dashboard__directory-empty">目录暂时为空，稍后再试。</div>
          ) : (
            <div className="feed-dashboard__directory-groups">
              {directoryCategories.map((group) => (
                <section key={group.category} className="feed-dashboard__directory-group">
                  <header className="feed-dashboard__directory-group-header">
                    <strong>{group.category}</strong>
                    <span>{group.feeds.length} 个源</span>
                  </header>
                  <div className="feed-dashboard__directory-list">
                    {group.feeds.map((feed) => {
                      const isProcessingThisFeed = directoryPendingFeedUrl === feed.url
                      const isSubscribed = sharedFeedUrlSet.has(feed.url)

                      return (
                        <article key={feed.id || feed.url} className="feed-dashboard__directory-item">
                          <div className="feed-dashboard__directory-item-main">
                            <div className="feed-dashboard__directory-item-title-row">
                              <strong>{feed.title || '未命名源'}</strong>
                              <span>{feed.articleCount > 0 ? `${feed.articleCount} 篇` : '已收录'}</span>
                            </div>
                            <p>{feed.intro || '这个共享源暂时还没有说明。'}</p>
                            <div className="feed-dashboard__directory-item-meta">
                              <span>{group.category}</span>
                              <span>{formatFeedMetaDate(feed.lastSuccessAt)}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="feed-dashboard__directory-btn"
                            onClick={() => onOpenDirectoryFeed(feed)}
                            disabled={Boolean(directoryPendingFeedUrl) || isSavingFeed}
                          >
                            {isProcessingThisFeed ? '处理中…' : isSubscribed ? '查看最近条目' : '订阅并查看'}
                          </button>
                        </article>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section className="feed-dashboard__content">
        <aside className="feed-dashboard__subscriptions" aria-label="已订阅 feed">
          <div className="feed-dashboard__subscriptions-header">
            <div>
              <p className="feed-dashboard__section-label">已订阅</p>
              <strong>{subscriptions.length} 个 feed</strong>
            </div>
          </div>
          {isLoading ? (
            <div className="feed-dashboard__subscriptions-empty">正在读取 feed 订阅…</div>
          ) : filteredSubscriptions.length === 0 ? (
            <div className="feed-dashboard__subscriptions-empty">
              {subscriptions.length === 0 ? '还没有订阅 feed。' : '当前搜索没有匹配的 feed。'}
            </div>
          ) : (
            <div className="feed-dashboard__subscription-list">
              {filteredSubscriptions.map((subscription) => {
                const isActive = selectedSubscriptionUrl === subscription.url

                return (
                  <article
                    key={subscription.id}
                    className={`feed-dashboard__subscription-item${isActive ? ' is-active' : ''}`}
                  >
                    <button
                      type="button"
                      className="feed-dashboard__subscription-main"
                      onClick={() => onSelectSubscription(subscription)}
                    >
                      <strong>{subscription.title || '未命名 feed'}</strong>
                      <p>{subscription.description || subscription.url}</p>
                      <div className="feed-dashboard__subscription-meta">
                        <span>{subscription.category || '未分类'}</span>
                        <span>{subscription.articleCount > 0 ? `${subscription.articleCount} 篇` : 'feed'}</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      className="feed-dashboard__subscription-remove-btn"
                      onClick={() => onRemoveSubscription(subscription)}
                    >
                      删除
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </aside>

        <section className="feed-dashboard__preview" aria-label="Feed 条目预览">
          <div className="feed-dashboard__preview-header">
            <div>
              <p className="feed-dashboard__section-label">条目预览</p>
              <strong>{selectedSubscription?.title || previewFeed?.title || '选择一个 feed'}</strong>
              <span>
                {previewFeed?.description || selectedSubscription?.description || '订阅后查看最近条目，再把需要的文章加入待读。'}
              </span>
            </div>
          </div>
          {isPreviewLoading ? (
            <div className="feed-dashboard__preview-empty">正在读取最近条目…</div>
          ) : !previewFeed ? (
            <div className="feed-dashboard__preview-empty">左侧选一个已订阅 feed，或从上面的共享目录里直接订阅并查看。</div>
          ) : (
            <div className="feed-dashboard__preview-list">
              {previewFeed.items.map((item) => {
                const isImportingThisItem = previewImportingItemUrl === item.url

                return (
                  <article key={item.id || item.url} className="feed-dashboard__preview-item">
                    <div className="feed-dashboard__preview-item-main">
                      <strong>{item.title || '未命名条目'}</strong>
                      <p>{item.summary || '这个 RSS 条目没有提供摘要。'}</p>
                      <div className="feed-dashboard__preview-item-meta">
                        <span>{item.publishedAt || '未标日期'}</span>
                        <span>{item.url}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="feed-dashboard__preview-import-btn"
                      onClick={() => onImportFeedItem(item)}
                      disabled={Boolean(previewImportingItemUrl)}
                    >
                      {isImportingThisItem ? '导入中…' : '添加到待读'}
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </section>
    </section>
  )
}
