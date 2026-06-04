import { useEffect, useMemo, useState } from 'react'
import PreviewPane from '../editor/preview-pane'
import type { SharedFeedCategory, SharedFeedSource } from '../read-later/feed-directory-client'
import type { ImportedFeed, ImportedFeedItem } from '../read-later/feed-import-client'
import type { ImportedReadLaterArticle } from '../read-later/import-client'
import { sortFeedSubscriptions, type FeedSubscription } from '../rss/feed-subscriptions'

type FeedDashboardProps = {
  search: string
  manualFeedUrl: string
  isLoading: boolean
  isSavingFeed: boolean
  subscriptions: FeedSubscription[]
  selectedSubscriptionUrl: string | null
  previewFeed: ImportedFeed | null
  previewArticlesByUrl: Record<string, ImportedReadLaterArticle>
  previewArticleLoadingByUrl: Record<string, boolean>
  previewArticleErrorsByUrl: Record<string, string>
  isPreviewLoading: boolean
  directoryCategories: SharedFeedCategory[]
  isDirectoryVisible: boolean
  isDirectoryLoading: boolean
  directoryPendingFeedUrl: string | null
  onManualFeedUrlChange: (value: string) => void
  onAddManualFeed: () => void
  onToggleDirectory: () => void
  onOpenDirectoryFeed: (feed: SharedFeedSource) => void
  onPreviewItemChange: (item: ImportedFeedItem | null) => void
  onSelectSubscription: (subscription: FeedSubscription) => void
  onRemoveSubscription: (subscription: FeedSubscription) => void
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

function formatFeedItemDate(value: string) {
  if (!value) {
    return '未标日期'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function readFeedItemHostLabel(value: string) {
  if (!value) {
    return '未附链接'
  }

  try {
    return new URL(value).host.replace(/^www\./, '')
  } catch {
    return value
  }
}

function readSubscriptionSourceLabel(sourceType: FeedSubscription['sourceType']) {
  return sourceType === 'shared' ? '共享源' : '手动订阅'
}

function readSubscriptionCategoryLabel(category: string) {
  const normalizedCategory = category.trim()
  return normalizedCategory || '未分类'
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

export default function FeedDashboard({
  search,
  manualFeedUrl,
  isLoading,
  isSavingFeed,
  subscriptions,
  selectedSubscriptionUrl,
  previewFeed,
  previewArticlesByUrl,
  previewArticleLoadingByUrl,
  previewArticleErrorsByUrl,
  isPreviewLoading,
  directoryCategories,
  isDirectoryVisible,
  isDirectoryLoading,
  directoryPendingFeedUrl,
  onManualFeedUrlChange,
  onAddManualFeed,
  onToggleDirectory,
  onOpenDirectoryFeed,
  onPreviewItemChange,
  onSelectSubscription,
  onRemoveSubscription,
}: FeedDashboardProps) {
  const normalizedSearch = search.trim().toLowerCase()
  const [selectedPreviewItemUrl, setSelectedPreviewItemUrl] = useState<string | null>(null)
  const [collapsedSubscriptionCategories, setCollapsedSubscriptionCategories] = useState<Record<string, boolean>>({})

  const filteredSubscriptions = useMemo(() => {
    const matchingSubscriptions = !normalizedSearch
      ? subscriptions
      : subscriptions.filter((subscription) =>
        [
          subscription.title,
          subscription.description,
          subscription.category,
          subscription.url,
        ].some((value) => value.toLowerCase().includes(normalizedSearch)),
      )

    return sortFeedSubscriptions(matchingSubscriptions)
  }, [normalizedSearch, subscriptions])

  const selectedSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.url === selectedSubscriptionUrl) || null,
    [selectedSubscriptionUrl, subscriptions],
  )

  const groupedSubscriptions = useMemo(() => {
    const categoryMap = new Map<string, FeedSubscription[]>()

    filteredSubscriptions.forEach((subscription) => {
      const category = readSubscriptionCategoryLabel(subscription.category)
      const existingCategorySubscriptions = categoryMap.get(category)
      if (existingCategorySubscriptions) {
        existingCategorySubscriptions.push(subscription)
        return
      }

      categoryMap.set(category, [subscription])
    })

    return Array.from(categoryMap.entries()).map(([category, categorySubscriptions]) => ({
      category,
      subscriptions: categorySubscriptions,
      readLaterCount: categorySubscriptions.reduce(
        (total, subscription) => total + subscription.readLaterCount,
        0,
      ),
    }))
  }, [filteredSubscriptions])

  const selectedSubscriptionCategory = selectedSubscription
    ? readSubscriptionCategoryLabel(selectedSubscription.category)
    : null

  const sharedFeedUrlSet = useMemo(
    () => new Set(subscriptions.map((subscription) => subscription.url)),
    [subscriptions],
  )

  useEffect(() => {
    if (!selectedSubscriptionCategory) {
      return
    }

    setCollapsedSubscriptionCategories((currentState) => {
      if (!currentState[selectedSubscriptionCategory]) {
        return currentState
      }

      return {
        ...currentState,
        [selectedSubscriptionCategory]: false,
      }
    })
  }, [selectedSubscriptionCategory])

  useEffect(() => {
    if (!normalizedSearch) {
      return
    }

    setCollapsedSubscriptionCategories((currentState) => {
      let didChange = false
      const nextState = { ...currentState }

      groupedSubscriptions.forEach((group) => {
        if (nextState[group.category]) {
          nextState[group.category] = false
          didChange = true
        }
      })

      return didChange ? nextState : currentState
    })
  }, [groupedSubscriptions, normalizedSearch])

  useEffect(() => {
    setSelectedPreviewItemUrl(previewFeed?.items[0]?.url || null)
  }, [previewFeed])

  const selectedPreviewItem = useMemo<ImportedFeedItem | null>(() => {
    if (!previewFeed) {
      return null
    }

    return previewFeed.items.find((item) => item.url === selectedPreviewItemUrl) || previewFeed.items[0] || null
  }, [previewFeed, selectedPreviewItemUrl])

  const selectedPreviewItemIndex = useMemo(() => {
    if (!previewFeed || !selectedPreviewItem) {
      return -1
    }

    return previewFeed.items.findIndex((item) => item.url === selectedPreviewItem.url)
  }, [previewFeed, selectedPreviewItem])

  const selectedPreviewArticle = selectedPreviewItem ? previewArticlesByUrl[selectedPreviewItem.url] || null : null
  const selectedPreviewArticleError = selectedPreviewItem ? previewArticleErrorsByUrl[selectedPreviewItem.url] || null : null
  const isSelectedPreviewArticleLoading = selectedPreviewItem ? Boolean(previewArticleLoadingByUrl[selectedPreviewItem.url]) : false

  const openPreviewItem = (item: ImportedFeedItem | null) => {
    if (!item?.url || typeof window === 'undefined') {
      return
    }

    window.open(item.url, '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    if (!selectedPreviewItem || typeof document === 'undefined') {
      return
    }

    const activeItem = document.querySelector<HTMLElement>('.feed-dashboard__preview-item.is-active')
    if (!activeItem || typeof activeItem.scrollIntoView !== 'function') {
      return
    }

    const prefersReducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    activeItem.scrollIntoView({
      block: 'nearest',
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    })
  }, [selectedPreviewItem])

  useEffect(() => {
    if (!previewFeed || previewFeed.items.length === 0 || typeof window === 'undefined') {
      return
    }

    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return
      }

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()

        const currentIndex = selectedPreviewItemIndex >= 0 ? selectedPreviewItemIndex : 0
        const offset = event.key === 'ArrowDown' ? 1 : -1
        const nextIndex = Math.min(previewFeed.items.length - 1, Math.max(0, currentIndex + offset))
        const nextItem = previewFeed.items[nextIndex]
        if (nextItem) {
          setSelectedPreviewItemUrl(nextItem.url)
        }
      }

      if (event.key === 'Enter') {
        openPreviewItem(selectedPreviewItem)
      }
    }

    window.addEventListener('keydown', handleWindowKeyDown)
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown)
    }
  }, [previewFeed, selectedPreviewItem, selectedPreviewItemIndex])

  useEffect(() => {
    onPreviewItemChange(selectedPreviewItem)
  }, [onPreviewItemChange, selectedPreviewItem])

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
              <p className="feed-dashboard__section-label">源导航</p>
              <strong>
                {normalizedSearch
                  ? `${filteredSubscriptions.length} 个匹配源`
                  : `${subscriptions.length} 个源 · ${groupedSubscriptions.length} 组`}
              </strong>
            </div>
          </div>
          {isLoading ? (
            <div className="feed-dashboard__subscriptions-empty">正在读取 feed 订阅…</div>
          ) : filteredSubscriptions.length === 0 ? (
            <div className="feed-dashboard__subscriptions-empty">
              {subscriptions.length === 0 ? '还没有订阅 feed。' : '当前搜索没有匹配的 feed。'}
            </div>
          ) : (
            <div className="feed-dashboard__subscription-groups">
              {groupedSubscriptions.map((group) => {
                const isSelectedCategory = selectedSubscriptionCategory === group.category
                const isExpanded = isSelectedCategory || !collapsedSubscriptionCategories[group.category]

                return (
                  <section
                    key={group.category}
                    className={`feed-dashboard__subscription-group${isSelectedCategory ? ' is-active' : ''}`}
                  >
                    <button
                      type="button"
                      className="feed-dashboard__subscription-group-toggle"
                      aria-expanded={isExpanded}
                      onClick={() => {
                        setCollapsedSubscriptionCategories((currentState) => ({
                          ...currentState,
                          [group.category]: isExpanded,
                        }))
                      }}
                    >
                      <span className="feed-dashboard__subscription-group-label">
                        <strong>{group.category}</strong>
                        <small>{group.subscriptions.length} 个源</small>
                      </span>
                      <span className="feed-dashboard__subscription-group-summary">
                        <span>{group.readLaterCount > 0 ? `${group.readLaterCount} 篇待读` : '暂无待读'}</span>
                        <span className="feed-dashboard__subscription-group-chevron" aria-hidden="true" />
                      </span>
                    </button>
                    {isExpanded ? (
                      <div className="feed-dashboard__subscription-group-list">
                        {group.subscriptions.map((subscription) => {
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
                                <div className="feed-dashboard__subscription-kicker">
                                  <span>{readSubscriptionSourceLabel(subscription.sourceType)}</span>
                                  <span>{subscription.articleCount > 0 ? `${subscription.articleCount} 条` : '待读取'}</span>
                                </div>
                                <strong>{subscription.title || '未命名 feed'}</strong>
                                <p>{subscription.description || readFeedItemHostLabel(subscription.url)}</p>
                                <div className="feed-dashboard__subscription-meta">
                                  <span>{subscription.updatedAt ? `同步 ${formatFeedMetaDate(subscription.updatedAt)}` : '未同步'}</span>
                                  <span>{subscription.readLaterCount > 0 ? `${subscription.readLaterCount} 篇已入待读` : '未入待读'}</span>
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
                    ) : null}
                  </section>
                )
              })}
            </div>
          )}
        </aside>

        <section className="feed-dashboard__preview" aria-label="Feed 条目列表">
          <div className="feed-dashboard__preview-header">
            <div>
              <p className="feed-dashboard__section-label">条目列表</p>
              <strong>{selectedSubscription?.title || previewFeed?.title || '选择一个 feed'}</strong>
              <span>
                {previewFeed?.description || selectedSubscription?.description || '左侧选一个 feed，中间浏览摘要，右侧看详情。'}
              </span>
            </div>
            <span>{previewFeed ? `↑ ↓ 切换 · Enter 打开 · ${previewFeed.items.length} 条` : '摘要列表'}</span>
          </div>
          {isPreviewLoading ? (
            <div className="feed-dashboard__preview-empty">正在读取最近条目…</div>
          ) : !previewFeed ? (
            <div className="feed-dashboard__preview-empty">左侧选一个已订阅 feed，或从上面的共享目录里直接订阅并查看。</div>
          ) : (
            <div className="feed-dashboard__preview-list">
              {previewFeed.items.map((item) => {
                const isActive = selectedPreviewItem?.url === item.url

                return (
                  <article
                    key={item.id || item.url}
                    className={`feed-dashboard__preview-item${isActive ? ' is-active' : ''}`}
                  >
                    <button
                      type="button"
                      className="feed-dashboard__preview-select"
                      onClick={() => setSelectedPreviewItemUrl(item.url)}
                    >
                      <div className="feed-dashboard__preview-item-main">
                        <div className="feed-dashboard__preview-item-meta">
                          <span>{formatFeedItemDate(item.publishedAt)}</span>
                          <span>{item.sourceName || readFeedItemHostLabel(item.url)}</span>
                        </div>
                        <strong>{item.title || '未命名条目'}</strong>
                        <p>{item.summary || '这个 RSS 条目没有提供摘要。'}</p>
                      </div>
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="feed-dashboard__reader" aria-label="Feed 摘要阅读区">
          <div className="feed-dashboard__reader-header">
            <div>
              <p className="feed-dashboard__section-label">正文预览</p>
              <strong>{selectedPreviewArticle?.title || selectedPreviewItem?.title || previewFeed?.title || selectedSubscription?.title || '选择一条摘要'}</strong>
              <span>{selectedPreviewItem ? `当前第 ${selectedPreviewItemIndex + 1} 条 · 自动抓取正文` : '选中摘要后，这里自动加载正文预览。'}</span>
            </div>
          </div>
          {isPreviewLoading ? (
            <div className="feed-dashboard__reader-empty">正在准备正文预览区…</div>
          ) : !previewFeed ? (
            <div className="feed-dashboard__reader-empty">选中 feed 后，这里显示当前条目的正文预览。</div>
          ) : !selectedPreviewItem ? (
            <div className="feed-dashboard__reader-empty">这个 feed 暂时没有可阅读的条目。</div>
          ) : isSelectedPreviewArticleLoading && !selectedPreviewArticle ? (
            <div className="feed-dashboard__reader-empty">正在抓取正文内容…</div>
          ) : selectedPreviewArticleError ? (
            <div className="feed-dashboard__reader-empty">
              {selectedPreviewArticleError}
              <br />
              可先通过“打开原文”跳转阅读。
            </div>
          ) : selectedPreviewArticle?.needsManualPaste && !selectedPreviewArticle.markdown ? (
            <div className="feed-dashboard__reader-empty">
              这篇文章暂时没自动识别出正文，可先打开原文。
            </div>
          ) : selectedPreviewArticle?.markdown ? (
            <div className="feed-dashboard__reader-preview">
              <div className="feed-dashboard__reader-actions">
                <button
                  type="button"
                  className="feed-dashboard__composer-secondary-btn feed-dashboard__reader-nav-btn"
                  onClick={() => {
                    const previousItem = previewFeed.items[selectedPreviewItemIndex - 1]
                    if (previousItem) {
                      setSelectedPreviewItemUrl(previousItem.url)
                    }
                  }}
                  disabled={selectedPreviewItemIndex <= 0}
                >
                  上一条
                </button>
                <button
                  type="button"
                  className="feed-dashboard__composer-secondary-btn feed-dashboard__reader-nav-btn"
                  onClick={() => {
                    const nextItem = previewFeed.items[selectedPreviewItemIndex + 1]
                    if (nextItem) {
                      setSelectedPreviewItemUrl(nextItem.url)
                    }
                  }}
                  disabled={selectedPreviewItemIndex >= previewFeed.items.length - 1}
                >
                  下一条
                </button>
                <a
                  className="feed-dashboard__composer-btn feed-dashboard__reader-link"
                  href={selectedPreviewArticle.finalUrl || selectedPreviewArticle.requestedUrl || selectedPreviewItem.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  打开原文
                </a>
              </div>
              <PreviewPane
                title={selectedPreviewArticle.title || selectedPreviewItem.title || '未命名条目'}
                date={formatFeedItemDate(selectedPreviewItem.publishedAt)}
                markdown={selectedPreviewArticle.markdown}
                contentFormat="markdown"
                desc={selectedPreviewArticle.desc || selectedPreviewItem.summary}
                sourceName={selectedPreviewArticle.sourceName || selectedPreviewItem.sourceName || previewFeed.title}
                externalUrl={selectedPreviewArticle.finalUrl || selectedPreviewArticle.requestedUrl || selectedPreviewItem.url}
                readingStatus="unread"
                contentType="read-later"
              />
            </div>
          ) : (
            <div className="feed-dashboard__reader-empty">正在整理正文预览…</div>
          )}
        </section>
      </section>
    </section>
  )
}
