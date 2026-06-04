import { useEffect, useMemo, useState } from 'react'
import PreviewPane from '../editor/preview-pane'
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
  onManualFeedUrlChange: (value: string) => void
  onAddManualFeed: () => void
  onPreviewItemChange: (item: ImportedFeedItem | null) => void
  onSelectSubscription: (subscription: FeedSubscription) => void
  onRemoveSubscription: (subscription: FeedSubscription) => void
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
  onManualFeedUrlChange,
  onAddManualFeed,
  onPreviewItemChange,
  onSelectSubscription,
  onRemoveSubscription,
}: FeedDashboardProps) {
  const normalizedSearch = search.trim().toLowerCase()
  const [selectedPreviewItemUrl, setSelectedPreviewItemUrl] = useState<string | null>(null)

  const filteredSubscriptions = useMemo(() => {
    const matchingSubscriptions = !normalizedSearch
      ? subscriptions
      : subscriptions.filter((subscription) =>
        [
          subscription.title,
          subscription.description,
          subscription.url,
        ].some((value) => value.toLowerCase().includes(normalizedSearch)),
      )

    return sortFeedSubscriptions(matchingSubscriptions)
  }, [normalizedSearch, subscriptions])

  const selectedSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.url === selectedSubscriptionUrl) || null,
    [selectedSubscriptionUrl, subscriptions],
  )

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
      {/* ── Left sidebar ── */}
      <aside className="feed-dashboard__sidebar">
        {/* Compact add-feed toolbar */}
        <div className="feed-dashboard__toolbar" aria-label="新增 feed">
          <div className="feed-dashboard__toolbar-row">
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
              className="feed-dashboard__toolbar-add-btn"
              onClick={onAddManualFeed}
              disabled={isSavingFeed}
              aria-label={isSavingFeed ? '订阅中…' : '新增 feed'}
            >
              {isSavingFeed ? '…' : '+'}
            </button>
          </div>
        </div>

        <div className="feed-dashboard__sidebar-body">
          <div className="feed-dashboard__subscriptions" aria-label="已订阅 feed">
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
                        <span className="feed-dashboard__subscription-count">
                          {subscription.articleCount > 0 ? `${subscription.articleCount} 条` : '0 条'}
                        </span>
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
          </div>
        </div>

        {/* Stats footer */}
        <div className="feed-dashboard__sidebar-footer">
          <span>
            {normalizedSearch
              ? `${filteredSubscriptions.length} 个匹配源`
              : `${subscriptions.length} 个源`}
          </span>
        </div>
      </aside>

      {/* ── Right main area ── */}
      <main className="feed-dashboard__main">
        {/* Feed item list */}
        <section className="feed-dashboard__preview" aria-label="Feed 条目列表">
          <div className="feed-dashboard__preview-header">
            <strong>{selectedSubscription?.title || previewFeed?.title || '选择一个 feed'}</strong>
            <span>{previewFeed ? `${previewFeed.items.length} 条` : ''}</span>
          </div>
          {isPreviewLoading ? (
            <div className="feed-dashboard__preview-empty">正在读取最近条目…</div>
          ) : !previewFeed ? (
            <div className="feed-dashboard__preview-empty">左侧选一个已订阅 feed，或手动添加新的 feed。</div>
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

        {/* Reader / article preview */}
        <section className="feed-dashboard__reader" aria-label="Feed 摘要阅读区">
          <div className="feed-dashboard__reader-header">
            <strong>{selectedPreviewArticle?.title || selectedPreviewItem?.title || previewFeed?.title || selectedSubscription?.title || '选择一条摘要'}</strong>
            <span>{selectedPreviewItem ? `第 ${selectedPreviewItemIndex + 1} 条 · ↑↓ 切换` : ''}</span>
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
              可先通过"打开原文"跳转阅读。
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
      </main>
    </section>
  )
}
