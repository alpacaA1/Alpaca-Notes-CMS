import { useEffect, useMemo, useState, type Dispatch, type DragEvent, type SetStateAction } from 'react'
import PreviewPane from '../editor/preview-pane'
import type { ImportedFeed, ImportedFeedItem } from '../read-later/feed-import-client'
import type { ImportedReadLaterArticle } from '../read-later/import-client'
import { normalizeFeedItemUrl, sortFeedSubscriptions, type FeedFolder, type FeedSubscription } from '../rss/feed-subscriptions'

const VIEWED_FEED_ITEMS_STORAGE_KEY = 'alpaca-admin-viewed-feed-items'
const VIEWED_FEED_READ_COUNT_PREFIX = '__alpaca-feed-read-count:'

export type ViewedFeedItemsByUrl = Record<string, string[]>

type FeedDashboardProps = {
  search: string
  manualFeedUrl: string
  isLoading: boolean
  isSavingFeed: boolean
  folders: FeedFolder[]
  subscriptions: FeedSubscription[]
  selectedSubscriptionUrl: string | null
  previewFeed: ImportedFeed | null
  feedItemsByUrl?: Record<string, ImportedFeedItem[]>
  previewArticlesByUrl: Record<string, ImportedReadLaterArticle>
  previewArticleLoadingByUrl: Record<string, boolean>
  previewArticleErrorsByUrl: Record<string, string>
  viewedFeedItemsByUrl?: ViewedFeedItemsByUrl
  isPreviewLoading: boolean
  isBackgroundRefreshing?: boolean
  onManualFeedUrlChange: (value: string) => void
  onAddManualFeed: () => void
  onPreviewItemChange: (item: ImportedFeedItem | null) => void
  onSelectSubscription: (subscription: FeedSubscription) => void
  onRemoveSubscription: (subscription: FeedSubscription) => void
  onCreateFolder: (name: string) => void
  onRenameFolder: (folder: FeedFolder, name: string) => void
  onDeleteFolder: (folder: FeedFolder) => void
  onMoveSubscriptionToFolder: (subscription: FeedSubscription, folderName: string) => void
  onViewedFeedItemsChange?: Dispatch<SetStateAction<ViewedFeedItemsByUrl>>
  onMarkFeedItemRead?: (feedUrl: string, item: ImportedFeedItem) => void
  onMarkFeedItemsRead?: (feedUrl: string, items: ImportedFeedItem[]) => void
  onMarkFeedRead?: (subscription: FeedSubscription) => void
  onCreateReadLaterFromPreview: (item: ImportedFeedItem, article: ImportedReadLaterArticle | null) => void
  isCreatingReadLaterFromPreview?: boolean
}

type SubscriptionViewModel = {
  subscription: FeedSubscription
  unreadCount: number
}

type FolderViewModel = {
  id: string
  folder: FeedFolder | null
  name: string
  isUncategorized?: boolean
  subscriptions: SubscriptionViewModel[]
  unreadCount: number
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

function getPreviewFeedSourceUrls(previewFeed: ImportedFeed | null) {
  if (!previewFeed) {
    return []
  }

  return [previewFeed.requestedUrl, previewFeed.finalUrl].map((value) => value.trim()).filter(Boolean)
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
}

export function readViewedFeedItemsByUrl(): ViewedFeedItemsByUrl {
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const payload = JSON.parse(window.localStorage.getItem(VIEWED_FEED_ITEMS_STORAGE_KEY) || '{}') as unknown
    if (!payload || typeof payload !== 'object') {
      return {}
    }

    return Object.fromEntries(
      Object.entries(payload as Record<string, unknown>)
        .map(([feedUrl, itemUrls]) => [
          feedUrl,
          Array.isArray(itemUrls)
            ? Array.from(new Set(itemUrls.filter((itemUrl): itemUrl is string => typeof itemUrl === 'string' && Boolean(itemUrl.trim()))))
            : [],
        ])
        .filter(([, itemUrls]) => itemUrls.length > 0),
    )
  } catch {
    return {}
  }
}

export function saveViewedFeedItemsByUrl(viewedItemsByFeedUrl: ViewedFeedItemsByUrl) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(VIEWED_FEED_ITEMS_STORAGE_KEY, JSON.stringify(viewedItemsByFeedUrl))
}

function createViewedFeedReadCountMarker(articleCount: number) {
  return `${VIEWED_FEED_READ_COUNT_PREFIX}${Math.max(0, articleCount)}`
}

function readViewedFeedReadCountMarker(value: string) {
  if (!value.startsWith(VIEWED_FEED_READ_COUNT_PREFIX)) {
    return null
  }

  const count = Number(value.slice(VIEWED_FEED_READ_COUNT_PREFIX.length))
  return Number.isFinite(count) ? Math.max(0, count) : null
}

export function getViewedFeedItemCount(
  viewedItemUrls: string[] | undefined,
  articleCount: number,
  currentItemUrls?: string[],
) {
  const viewedItems = viewedItemUrls || []
  const normalizedCurrentItemUrls = Array.from(
    new Set((currentItemUrls || []).map((itemUrl) => normalizeFeedItemUrl(itemUrl)).filter(Boolean)),
  )
  if (normalizedCurrentItemUrls.length > 0) {
    const viewedUrlSet = new Set(viewedItems.filter((itemUrl) => readViewedFeedReadCountMarker(itemUrl) === null))
    return normalizedCurrentItemUrls.filter((itemUrl) => viewedUrlSet.has(itemUrl)).length
  }

  const viewedUrlCount = new Set(viewedItems.filter((itemUrl) => readViewedFeedReadCountMarker(itemUrl) === null)).size
  const markedReadCount = viewedItems.reduce((count, itemUrl) => {
    const markerCount = readViewedFeedReadCountMarker(itemUrl)
    return markerCount === null ? count : Math.max(count, markerCount)
  }, 0)

  return Math.min(Math.max(viewedUrlCount, markedReadCount), Math.max(0, articleCount))
}

export default function FeedDashboard({
  search,
  manualFeedUrl,
  isLoading,
  isSavingFeed,
  folders,
  subscriptions,
  selectedSubscriptionUrl,
  previewFeed,
  feedItemsByUrl = {},
  previewArticlesByUrl,
  previewArticleLoadingByUrl,
  previewArticleErrorsByUrl,
  viewedFeedItemsByUrl: controlledViewedFeedItemsByUrl,
  isPreviewLoading,
  isBackgroundRefreshing = false,
  onManualFeedUrlChange,
  onAddManualFeed,
  onPreviewItemChange,
  onSelectSubscription,
  onRemoveSubscription,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveSubscriptionToFolder,
  onViewedFeedItemsChange,
  onMarkFeedItemRead,
  onMarkFeedItemsRead,
  onMarkFeedRead,
  onCreateReadLaterFromPreview,
  isCreatingReadLaterFromPreview = false,
}: FeedDashboardProps) {
  const normalizedSearch = search.trim().toLowerCase()
  const [selectedPreviewItemUrl, setSelectedPreviewItemUrl] = useState<string | null>(null)
  const [localViewedFeedItemsByUrl, setLocalViewedFeedItemsByUrl] = useState<ViewedFeedItemsByUrl>(readViewedFeedItemsByUrl)
  const viewedFeedItemsByUrl = controlledViewedFeedItemsByUrl || localViewedFeedItemsByUrl
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([])
  const [openFolderMenuId, setOpenFolderMenuId] = useState<string | null>(null)
  const [openSubscriptionMenuUrl, setOpenSubscriptionMenuUrl] = useState<string | null>(null)
  const [draggedSubscriptionUrl, setDraggedSubscriptionUrl] = useState<string | null>(null)
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isReaderExpanded, setIsReaderExpanded] = useState(false)

  const filteredSubscriptions = useMemo(() => {
    const matchingSubscriptions = !normalizedSearch
      ? subscriptions
      : subscriptions.filter((subscription) =>
        [
          subscription.title,
          subscription.description,
          subscription.url,
          subscription.category,
        ].some((value) => value.toLowerCase().includes(normalizedSearch)),
      )

    return sortFeedSubscriptions(matchingSubscriptions)
  }, [normalizedSearch, subscriptions])

  const subscriptionViewModels = useMemo(
    () => filteredSubscriptions.map((subscription) => {
      const fallbackViewedItemCount = getViewedFeedItemCount(
        viewedFeedItemsByUrl[subscription.url],
        subscription.articleCount,
        feedItemsByUrl[subscription.url]?.map((item) => item.url),
      )
      return {
        subscription,
        unreadCount: Array.isArray(subscription.unreadItemKeys)
          ? subscription.unreadItemKeys.length
          : Math.max(0, subscription.articleCount - fallbackViewedItemCount),
      }
    }),
    [feedItemsByUrl, filteredSubscriptions, viewedFeedItemsByUrl],
  )

  const folderViewModels = useMemo<FolderViewModel[]>(() => {
    const explicitFolders = folders.filter((folder) => folder.name.trim())
    const explicitFolderNames = new Set(explicitFolders.map((folder) => folder.name))
    const implicitFolderNames = Array.from(
      new Set(subscriptionViewModels.map((item) => item.subscription.category.trim()).filter(Boolean)),
    ).filter((folderName) => !explicitFolderNames.has(folderName))
    const baseFolders: FolderViewModel[] = [
      ...explicitFolders.map((folder) => ({
        id: folder.id,
        folder,
        name: folder.name,
        subscriptions: [] as SubscriptionViewModel[],
        unreadCount: 0,
      })),
      ...implicitFolderNames.map((folderName) => ({
        id: `implicit-${folderName}`,
        folder: {
          id: `implicit-${folderName}`,
          name: folderName,
          createdAt: '',
          updatedAt: '',
        },
        name: folderName,
        subscriptions: [] as SubscriptionViewModel[],
        unreadCount: 0,
      })),
      {
        id: 'uncategorized',
        folder: null,
        name: 'Uncategorized',
        isUncategorized: true,
        subscriptions: [],
        unreadCount: 0,
      },
    ]
    const foldersByName = new Map(baseFolders.map((folder) => [folder.name, folder]))
    const uncategorizedFolder = baseFolders[baseFolders.length - 1]

    subscriptionViewModels.forEach((item) => {
      const folderName = item.subscription.category.trim()
      const targetFolder = folderName ? foldersByName.get(folderName) || uncategorizedFolder : uncategorizedFolder
      targetFolder.subscriptions.push(item)
      targetFolder.unreadCount += item.unreadCount
    })

    return baseFolders.filter((folder) => {
      if (folder.subscriptions.length > 0) {
        return true
      }

      return !normalizedSearch || folder.name.toLowerCase().includes(normalizedSearch)
    })
  }, [folders, normalizedSearch, subscriptionViewModels])
  const totalUnreadFolderCount = folderViewModels.reduce((total, folder) => total + (folder.unreadCount > 0 ? 1 : 0), 0)

  const selectedSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.url === selectedSubscriptionUrl) || null,
    [selectedSubscriptionUrl, subscriptions],
  )
  const previewFeedSubscriptionUrl = useMemo(() => {
    const previewFeedSourceUrls = getPreviewFeedSourceUrls(previewFeed)
    if (previewFeedSourceUrls.length === 0) {
      return selectedSubscriptionUrl
    }

    return subscriptions.find((subscription) => previewFeedSourceUrls.includes(subscription.url))?.url || selectedSubscriptionUrl
  }, [previewFeed, selectedSubscriptionUrl, subscriptions])
  const isPreviewFeedForSelectedSubscription = Boolean(
    previewFeed
    && selectedSubscriptionUrl
    && previewFeedSubscriptionUrl === selectedSubscriptionUrl,
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
  const selectedFeedViewedItemUrls = previewFeedSubscriptionUrl ? new Set(viewedFeedItemsByUrl[previewFeedSubscriptionUrl] || []) : new Set<string>()
  const selectedFeedUnreadItemCount = selectedSubscription && Array.isArray(selectedSubscription.unreadItemKeys)
    ? selectedSubscription.unreadItemKeys.length
    : previewFeed
      ? previewFeed.items.filter((item) => {
        const normalizedItemUrl = normalizeFeedItemUrl(item.url)
        return normalizedItemUrl && !selectedFeedViewedItemUrls.has(normalizedItemUrl)
      }).length
      : 0

  const updateViewedFeedItemsByUrl = (updater: SetStateAction<ViewedFeedItemsByUrl>) => {
    const applyUpdater = (currentState: ViewedFeedItemsByUrl) => {
      const nextState = typeof updater === 'function' ? updater(currentState) : updater
      if (nextState !== currentState) {
        saveViewedFeedItemsByUrl(nextState)
      }
      return nextState
    }

    if (onViewedFeedItemsChange) {
      onViewedFeedItemsChange(applyUpdater)
      return
    }

    setLocalViewedFeedItemsByUrl(applyUpdater)
  }

  const markPreviewItemViewed = (item: ImportedFeedItem | null) => {
    if (!previewFeedSubscriptionUrl || !item?.url) {
      return
    }

    const normalizedItemUrl = normalizeFeedItemUrl(item.url)
    if (!normalizedItemUrl) {
      return
    }

    if (onMarkFeedItemRead) {
      onMarkFeedItemRead(previewFeedSubscriptionUrl, item)
      return
    }

    updateViewedFeedItemsByUrl((currentState) => {
      const currentFeedItems = currentState[previewFeedSubscriptionUrl] || []
      if (currentFeedItems.includes(normalizedItemUrl)) {
        return currentState
      }

      const nextState = {
        ...currentState,
        [previewFeedSubscriptionUrl]: [...currentFeedItems, normalizedItemUrl],
      }
      return nextState
    })
  }

  const markSubscriptionViewed = (subscription: FeedSubscription) => {
    if (onMarkFeedRead) {
      onMarkFeedRead(subscription)
      setOpenSubscriptionMenuUrl(null)
      return
    }

    updateViewedFeedItemsByUrl((currentState) => {
      const currentFeedItems = currentState[subscription.url] || []
      const currentFeedItemUrls = (feedItemsByUrl[subscription.url] || [])
        .map((item) => normalizeFeedItemUrl(item.url))
        .filter((itemUrl): itemUrl is string => Boolean(itemUrl))
      const nextFeedItems = currentFeedItemUrls.length > 0
        ? Array.from(new Set([
            ...currentFeedItems.filter((itemUrl) => readViewedFeedReadCountMarker(itemUrl) === null),
            ...currentFeedItemUrls,
          ]))
        : [
            ...currentFeedItems.filter((itemUrl) => readViewedFeedReadCountMarker(itemUrl) === null),
            createViewedFeedReadCountMarker(subscription.articleCount),
          ]
      const nextState = {
        ...currentState,
        [subscription.url]: nextFeedItems,
      }
      return nextState
    })
    setOpenSubscriptionMenuUrl(null)
  }

  const markAllPreviewItemsViewed = () => {
    if (!previewFeedSubscriptionUrl || !previewFeed?.items.length) {
      return
    }

    const normalizedItemUrls = previewFeed.items
      .map((item) => normalizeFeedItemUrl(item.url))
      .filter((itemUrl): itemUrl is string => Boolean(itemUrl))
    if (normalizedItemUrls.length === 0) {
      return
    }

    if (onMarkFeedItemsRead) {
      onMarkFeedItemsRead(previewFeedSubscriptionUrl, previewFeed.items)
      return
    }

    updateViewedFeedItemsByUrl((currentState) => {
      const nextFeedItems = Array.from(new Set([...(currentState[previewFeedSubscriptionUrl] || []), ...normalizedItemUrls]))
      const nextState = {
        ...currentState,
        [previewFeedSubscriptionUrl]: nextFeedItems,
      }
      return nextState
    })
  }

  const handleCreateFolderClick = () => {
    const folderName = window.prompt('Folder 名称')
    if (folderName === null) {
      return
    }

    onCreateFolder(folderName)
  }

  const handleRenameFolderClick = (folder: FeedFolder) => {
    const nextFolderName = window.prompt('新的 folder 名称', folder.name)
    setOpenFolderMenuId(null)
    if (nextFolderName === null) {
      return
    }

    onRenameFolder(folder, nextFolderName)
  }

  const handleDeleteFolderClick = (folder: FeedFolder) => {
    setOpenFolderMenuId(null)
    onDeleteFolder(folder)
  }

  const toggleFolderCollapsed = (folderId: string) => {
    setExpandedFolderIds((currentIds) =>
      currentIds.includes(folderId)
        ? currentIds.filter((currentId) => currentId !== folderId)
        : [...currentIds, folderId],
    )
  }

  const handleSubscriptionDragStart = (event: DragEvent<HTMLElement>, subscription: FeedSubscription) => {
    if (isSavingFeed) {
      event.preventDefault()
      return
    }

    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', subscription.url)
    event.dataTransfer.setData('application/x-alpaca-feed-url', subscription.url)
    setDraggedSubscriptionUrl(subscription.url)
  }

  const handleFolderDragOver = (event: DragEvent<HTMLElement>, folderId: string) => {
    if (!draggedSubscriptionUrl || isSavingFeed) {
      return
    }

    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDropTargetFolderId(folderId)
  }

  const handleFolderDrop = (event: DragEvent<HTMLElement>, folderViewModel: FolderViewModel) => {
    event.preventDefault()

    const droppedSubscriptionUrl =
      event.dataTransfer.getData('application/x-alpaca-feed-url')
      || event.dataTransfer.getData('text/plain')
      || draggedSubscriptionUrl
    const subscription = subscriptions.find((item) => item.url === droppedSubscriptionUrl)
    setDraggedSubscriptionUrl(null)
    setDropTargetFolderId(null)

    if (!subscription || isSavingFeed) {
      return
    }

    const nextFolderName = folderViewModel.isUncategorized ? '' : folderViewModel.name
    if (subscription.category.trim() === nextFolderName) {
      return
    }

    onMoveSubscriptionToFolder(subscription, nextFolderName)
  }

  const selectPreviewItem = (item: ImportedFeedItem | undefined) => {
    if (!item) {
      return
    }

    markPreviewItemViewed(item)
    setSelectedPreviewItemUrl(item.url)
  }

  const openPreviewItem = (item: ImportedFeedItem | null) => {
    if (!item?.url || typeof window === 'undefined') {
      return
    }

    markPreviewItemViewed(item)
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
        selectPreviewItem(nextItem)
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

  const renderSubscriptionItem = ({
    subscription,
    unreadCount,
    isCollapsed = false,
  }: {
    subscription: FeedSubscription
    unreadCount: number
    isCollapsed?: boolean
  }) => {
    const isActive = selectedSubscriptionUrl === subscription.url

    return (
      <article
        key={subscription.id}
        className={`feed-dashboard__subscription-item${isActive ? ' is-active' : ''}${isCollapsed ? ' feed-dashboard__subscription-item--read' : ''}${draggedSubscriptionUrl === subscription.url ? ' is-dragging' : ''}`}
        draggable={!isSavingFeed}
        onDragStart={(event) => handleSubscriptionDragStart(event, subscription)}
        onDragEnd={() => {
          setDraggedSubscriptionUrl(null)
          setDropTargetFolderId(null)
        }}
      >
        <button
          type="button"
          className="feed-dashboard__subscription-main"
          onClick={() => onSelectSubscription(subscription)}
        >
          <span className="feed-dashboard__subscription-text">
            <span className="feed-dashboard__subscription-title">{subscription.title || '未命名 feed'}</span>
          </span>
          {unreadCount > 0 ? (
            <span
              className="feed-dashboard__subscription-count"
              aria-label={`${unreadCount} 条待读`}
            >
              {unreadCount}
            </span>
          ) : null}
        </button>
        <div
          className="feed-dashboard__subscription-menu-wrap"
          onBlur={(event) => {
            const nextFocusedElement = event.relatedTarget
            if (!(nextFocusedElement instanceof Node) || !event.currentTarget.contains(nextFocusedElement)) {
              setOpenSubscriptionMenuUrl(null)
            }
          }}
        >
          <button
            type="button"
            className="feed-dashboard__subscription-menu-btn"
            onClick={() => setOpenSubscriptionMenuUrl((currentUrl) => (currentUrl === subscription.url ? null : subscription.url))}
            aria-label={`${subscription.title || '未命名 feed'} 更多操作`}
            aria-haspopup="menu"
            aria-expanded={openSubscriptionMenuUrl === subscription.url}
          >
            ...
          </button>
          {openSubscriptionMenuUrl === subscription.url ? (
            <div className="feed-dashboard__subscription-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => markSubscriptionViewed(subscription)}
                disabled={unreadCount === 0}
              >
                Mark as read
              </button>
              <button
                type="button"
                role="menuitem"
                className="feed-dashboard__subscription-menu-danger"
                onClick={() => {
                  setOpenSubscriptionMenuUrl(null)
                  onRemoveSubscription(subscription)
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
        </div>
      </article>
    )
  }

  const renderFolder = (folderViewModel: FolderViewModel) => {
    const isCollapsed = !expandedFolderIds.includes(folderViewModel.id)
    const hasSubscriptions = folderViewModel.subscriptions.length > 0
    const canManageFolder = Boolean(folderViewModel.folder && !folderViewModel.isUncategorized)

    return (
      <section
        key={folderViewModel.id}
        className={`feed-dashboard__folder${isCollapsed ? ' is-collapsed' : ''}${dropTargetFolderId === folderViewModel.id ? ' is-drop-target' : ''}`}
        onDragEnter={() => {
          if (draggedSubscriptionUrl && !isSavingFeed) {
            setDropTargetFolderId(folderViewModel.id)
          }
        }}
        onDragOver={(event) => handleFolderDragOver(event, folderViewModel.id)}
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget
          if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
            setDropTargetFolderId(null)
          }
        }}
        onDrop={(event) => handleFolderDrop(event, folderViewModel)}
      >
        <div className="feed-dashboard__folder-header">
          <button
            type="button"
            className="feed-dashboard__folder-toggle"
            onClick={() => toggleFolderCollapsed(folderViewModel.id)}
            aria-expanded={!isCollapsed}
            aria-label={`${isCollapsed ? '展开' : '收起'} ${folderViewModel.name}`}
          >
            <span className="feed-dashboard__folder-chevron" aria-hidden="true">{isCollapsed ? '>' : 'v'}</span>
            <span className="feed-dashboard__folder-name">{folderViewModel.name}</span>
            {folderViewModel.unreadCount > 0 ? (
              <span
                className="feed-dashboard__subscription-count"
                aria-label={`${folderViewModel.unreadCount} 条 folder 待读`}
              >
                {folderViewModel.unreadCount}
              </span>
            ) : null}
          </button>
          {canManageFolder && folderViewModel.folder ? (
            <div
              className="feed-dashboard__folder-menu-wrap"
              onBlur={(event) => {
                const nextFocusedElement = event.relatedTarget
                if (!(nextFocusedElement instanceof Node) || !event.currentTarget.contains(nextFocusedElement)) {
                  setOpenFolderMenuId(null)
                }
              }}
            >
              <button
                type="button"
                className="feed-dashboard__folder-menu-btn"
                onClick={() => setOpenFolderMenuId((currentId) => (currentId === folderViewModel.id ? null : folderViewModel.id))}
                aria-label={`${folderViewModel.name} 更多操作`}
                aria-haspopup="menu"
                aria-expanded={openFolderMenuId === folderViewModel.id}
              >
                ...
              </button>
              {openFolderMenuId === folderViewModel.id ? (
                <div className="feed-dashboard__folder-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleRenameFolderClick(folderViewModel.folder as FeedFolder)}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="feed-dashboard__folder-menu-danger"
                    onClick={() => handleDeleteFolderClick(folderViewModel.folder as FeedFolder)}
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        {!isCollapsed ? (
          hasSubscriptions ? (
            <div className="feed-dashboard__subscription-list">
              {folderViewModel.subscriptions.map((item) => renderSubscriptionItem(item))}
            </div>
          ) : (
            <div className="feed-dashboard__folder-empty">空 folder</div>
          )
        ) : null}
      </section>
    )
  }

  const renderReaderActions = () => {
    if (!previewFeed || !selectedPreviewItem) {
      return null
    }

    const originalUrl = selectedPreviewArticle?.finalUrl || selectedPreviewArticle?.requestedUrl || selectedPreviewItem.url

    return (
      <div className="feed-dashboard__reader-actions">
        <button
          type="button"
          className="feed-dashboard__composer-btn feed-dashboard__reader-collect-btn"
          onClick={() => {
            markPreviewItemViewed(selectedPreviewItem)
            onCreateReadLaterFromPreview(selectedPreviewItem, selectedPreviewArticle)
          }}
          disabled={isCreatingReadLaterFromPreview}
        >
          {isCreatingReadLaterFromPreview ? '加入中…' : '加入待读'}
        </button>
        <a
          className="feed-dashboard__composer-btn feed-dashboard__reader-link"
          href={originalUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => markPreviewItemViewed(selectedPreviewItem)}
        >
          打开原文
        </a>
        <button
          type="button"
          className="feed-dashboard__reader-expand-btn"
          onClick={() => {
            setOpenFolderMenuId(null)
            setOpenSubscriptionMenuUrl(null)
            const nextValue = !isReaderExpanded
            setIsReaderExpanded(nextValue)
            setIsSidebarCollapsed(nextValue)
          }}
          aria-label={isReaderExpanded ? '还原阅读布局' : '放大阅读区'}
          aria-pressed={isReaderExpanded}
          title={isReaderExpanded ? '还原阅读布局' : '放大阅读区'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M8 3H3v5" />
            <path d="M3 3l7 7" />
            <path d="M16 21h5v-5" />
            <path d="M21 21l-7-7" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <section className={`feed-dashboard${isSidebarCollapsed ? ' feed-dashboard--sidebar-collapsed' : ''}${isReaderExpanded ? ' feed-dashboard--reader-expanded' : ''}`}>
      {/* ── Left sidebar ── */}
      <aside className={`feed-dashboard__sidebar${isSidebarCollapsed ? ' is-collapsed' : ''}`}>
        <button
          type="button"
          className="feed-dashboard__sidebar-toggle"
          onClick={() => {
            setOpenFolderMenuId(null)
            setOpenSubscriptionMenuUrl(null)
            setIsSidebarCollapsed((currentValue) => !currentValue)
          }}
          aria-label={isSidebarCollapsed ? '展开 RSS 订阅栏' : '收起 RSS 订阅栏'}
          aria-expanded={!isSidebarCollapsed}
          title={isSidebarCollapsed ? '展开 RSS 订阅栏' : '收起 RSS 订阅栏'}
        >
          <span className="feed-dashboard__sidebar-toggle-icon" aria-hidden="true">
            <span />
            <span />
          </span>
          {!isSidebarCollapsed ? <span className="feed-dashboard__sidebar-toggle-label">阅读列表</span> : null}
        </button>

        {!isSidebarCollapsed ? (
          <>
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
              <button
                type="button"
                className="feed-dashboard__folder-create-btn"
                onClick={handleCreateFolderClick}
                disabled={isSavingFeed}
              >
                + New Folder
              </button>
            </div>

            <div className="feed-dashboard__sidebar-body">
              <div className="feed-dashboard__subscriptions" aria-label="已订阅 feed">
                {isLoading ? (
                  <div className="feed-dashboard__subscriptions-empty">正在读取 feed 订阅…</div>
                ) : folderViewModels.length === 0 ? (
                  <div className="feed-dashboard__subscriptions-empty">
                    {subscriptions.length === 0 && folders.length === 0 ? '还没有订阅 feed。' : '当前搜索没有匹配的 feed。'}
                  </div>
                ) : (
                  <div className="feed-dashboard__folder-list">
                    {folderViewModels.map((folderViewModel) => renderFolder(folderViewModel))}
                  </div>
                )}
              </div>
            </div>

            {/* Stats footer */}
            <div className="feed-dashboard__sidebar-footer">
              <span>
                {isBackgroundRefreshing
                  ? 'RSS 获取中…'
                  : normalizedSearch
                  ? `${totalUnreadFolderCount} 个有待读匹配 folder`
                  : `${totalUnreadFolderCount} 个有待读 folder`}
              </span>
            </div>
          </>
        ) : null}
      </aside>

      {/* ── Right main area ── */}
      <main className="feed-dashboard__main">
        {/* Feed item list */}
        {!isReaderExpanded ? (
          <section className="feed-dashboard__preview" aria-label="Feed 条目列表">
            <div className="feed-dashboard__preview-header">
              <strong>
                {isPreviewFeedForSelectedSubscription
                  ? selectedSubscription?.title || previewFeed?.title || '选择一个 feed'
                  : previewFeed?.title || selectedSubscription?.title || '选择一个 feed'}
              </strong>
              <div className="feed-dashboard__preview-header-actions">
                <span>{isPreviewLoading ? '更新中…' : previewFeed ? `${previewFeed.items.length} 条` : ''}</span>
                {previewFeed ? (
                  <button
                    type="button"
                    className="feed-dashboard__composer-secondary-btn feed-dashboard__mark-read-btn"
                    onClick={markAllPreviewItemsViewed}
                    disabled={selectedFeedUnreadItemCount === 0}
                  >
                    全部标为已读
                  </button>
                ) : null}
              </div>
            </div>
            {isPreviewLoading && !previewFeed ? (
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
                        onClick={() => selectPreviewItem(item)}
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
        ) : null}

        {/* Reader / article preview */}
        <section className="feed-dashboard__reader" aria-label="Feed 摘要阅读区">
          <div className="feed-dashboard__reader-header">
            <strong>{selectedPreviewArticle?.title || selectedPreviewItem?.title || previewFeed?.title || selectedSubscription?.title || '选择一条摘要'}</strong>
            <span>{selectedPreviewItem ? `第 ${selectedPreviewItemIndex + 1} 条 · ↑↓ 切换` : ''}</span>
          </div>
          {isPreviewLoading && !previewFeed ? (
            <div className="feed-dashboard__reader-empty">正在准备正文预览区…</div>
          ) : !previewFeed ? (
            <div className="feed-dashboard__reader-empty">选中 feed 后，这里显示当前条目的正文预览。</div>
          ) : !selectedPreviewItem ? (
            <div className="feed-dashboard__reader-empty">这个 feed 暂时没有可阅读的条目。</div>
          ) : isSelectedPreviewArticleLoading && !selectedPreviewArticle ? (
            <div className="feed-dashboard__reader-empty">正在抓取正文内容…</div>
          ) : selectedPreviewArticleError ? (
            <div className="feed-dashboard__reader-preview">
              {renderReaderActions()}
              <div className="feed-dashboard__reader-empty">
                {selectedPreviewArticleError}
                <br />
                可先通过"打开原文"跳转阅读。
              </div>
            </div>
          ) : selectedPreviewArticle?.needsManualPaste && !selectedPreviewArticle.markdown ? (
            <div className="feed-dashboard__reader-preview">
              {renderReaderActions()}
              <div className="feed-dashboard__reader-empty">
                这篇文章暂时没自动识别出正文，可先打开原文。
              </div>
            </div>
          ) : selectedPreviewArticle?.markdown ? (
            <div className="feed-dashboard__reader-preview">
              {renderReaderActions()}
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
                showReadLaterOutline
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
