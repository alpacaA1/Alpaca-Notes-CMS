import type { Ref } from 'react'
import type { ContentType } from '../posts/post-types'

type AdminView = 'dashboard' | 'editor' | 'annotations' | 'trash' | 'feeds'

function AlpacaLogo() {
  return (
    <svg className="top-bar__logo-svg" width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="38" height="38" rx="12" fill="url(#alpaca-grad)" />
      <path d="M15 19V14.5C15 13.1193 16.1193 12 17.5 12H19.5C20.8807 12 22 13.1193 22 14.5V16" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M13 19H21.5C22.8807 19 24 20.1193 24 21.5V26" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="17.5" cy="15.5" r="1.5" fill="#f7ecdb" />
      <defs>
        <linearGradient id="alpaca-grad" x1="0" y1="0" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e4a358" />
          <stop offset="1" stopColor="#c77b27" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function SunIcon() {
  return (
    <svg className="top-bar__theme-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="3.7" fill="currentColor" />
      <path
        d="M10 1.9V4M10 16v2.1M1.9 10H4M16 10h2.1M4.25 4.25l1.48 1.48M14.27 14.27l1.48 1.48M15.75 4.25l-1.48 1.48M5.73 14.27l-1.48 1.48"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="top-bar__theme-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M17.9 12.74A7.56 7.56 0 0 1 11 18.06 7.6 7.6 0 0 1 8.38 2.93a6.2 6.2 0 0 0 6.38 9.3c.99-.18 1.93-.63 2.7-1.28.4-.34 1.08.22.93.72-.07.25-.16.5-.49 1.07Z"
        fill="currentColor"
      />
      <path d="M15.65 2.4l.48 1.14 1.13.48-1.13.48-.48 1.14-.48-1.14-1.14-.48 1.14-.48.48-1.14Z" fill="currentColor" opacity="0.72" />
      <circle cx="17.15" cy="7.35" r="0.82" fill="currentColor" opacity="0.58" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="top-bar__icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 4.5h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 2.75h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M6 7v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 7v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 7v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.6 4.5l.45 8.2a2 2 0 0 0 2 1.9h3.9a2 2 0 0 0 2-1.9l.45-8.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BackIcon() {
  return (
    <svg className="top-bar__icon" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M10.5 4.5 6 9l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.25 9H15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

type TopBarProps = {
  search: string
  onSearchChange: (value: string) => void
  onNewPost: () => void
  onOrganizeMaterials?: () => void
  onSave: () => void
  onTogglePreview: () => void
  onLogout: () => void
  onToggleColorMode: () => void
  onBackToDashboard?: () => void
  backButtonLabel?: string
  onOpenAnnotations?: () => void
  onOpenTrash?: () => void
  onOpenFeeds?: () => void
  rssUnreadCount?: number
  onContentTypeChange: (value: ContentType) => void
  contentType: ContentType
  searchInputRef?: Ref<HTMLInputElement>
  adminView: AdminView
  isPreviewing: boolean
  isDarkMode: boolean
  hasActiveDocument: boolean
  saveLabel: string
  isSaveDisabled: boolean
  isSaveQuiet: boolean
  status: string
  currentActionContentType?: ContentType | null
  isCurrentPinned?: boolean
  isPinningCurrent?: boolean
  isPinActionDisabled?: boolean
  onTogglePinnedCurrent?: () => void
  isDeletingCurrent?: boolean
  isDeleteActionDisabled?: boolean
  onDeleteCurrent?: () => void
}

const CONTENT_TYPE_OPTIONS: Array<{ value: ContentType; label: string; shortLabel: string }> = [
  { value: 'post', label: '文章', shortLabel: 'Post' },
  { value: 'diary', label: '日记', shortLabel: 'Diary' },
  { value: 'read-later', label: '待读', shortLabel: 'Later' },
  { value: 'knowledge', label: '知识点', shortLabel: 'Know' },
]

function getDashboardTitle(contentType: ContentType) {
  if (contentType === 'read-later') {
    return '待读管理'
  }

  if (contentType === 'diary') {
    return '日记管理'
  }

  if (contentType === 'knowledge') {
    return '知识点管理'
  }

  return '文章管理'
}

function getCreateLabel(contentType: ContentType) {
  if (contentType === 'read-later') {
    return '新建待读'
  }

  if (contentType === 'diary') {
    return '新建日记'
  }

  if (contentType === 'knowledge') {
    return '新建知识点'
  }

  return '新建文章'
}

function getSearchPlaceholder(adminView: AdminView, contentType: ContentType) {
  if (adminView === 'trash') {
    return '搜索标题、原路径或已删除内容'
  }

  if (adminView === 'feeds') {
    return '搜索 feed 名称、简介或链接'
  }

  if (adminView === 'annotations') {
    return '搜索摘录、批注、来源文章、来源或标签'
  }

  if (contentType === 'read-later') {
    return '搜索标题、摘要、正文、来源或原文链接'
  }

  if (contentType === 'diary') {
    return '搜索标题、正文或标签'
  }

  if (contentType === 'knowledge') {
    return '搜索标题、内容、来源或标签'
  }

  return '搜索标题、摘要、正文、标签或链接'
}

export default function TopBar({
  search,
  onSearchChange,
  onNewPost,
  onOrganizeMaterials,
  onSave,
  onTogglePreview,
  onLogout,
  onToggleColorMode,
  onBackToDashboard,
  backButtonLabel = '返回列表',
  onOpenAnnotations,
  onOpenTrash,
  onOpenFeeds,
  rssUnreadCount = 0,
  onContentTypeChange,
  contentType,
  searchInputRef,
  adminView,
  isPreviewing,
  isDarkMode,
  hasActiveDocument,
  saveLabel,
  isSaveDisabled,
  isSaveQuiet,
  status,
}: TopBarProps) {
  const isEditor = adminView === 'editor'
  const isAnnotationsView = adminView === 'annotations'
  const isTrashView = adminView === 'trash'
  const isFeedsView = adminView === 'feeds'
  const isDashboardLike = !isEditor && !isTrashView && !isFeedsView
  const titleText = isTrashView
    ? '回收站'
    : isFeedsView
      ? 'RSS 工作台'
    : isAnnotationsView
      ? '批注管理'
      : isDashboardLike
        ? getDashboardTitle(contentType)
        : '内容编辑台'
  const createLabel = getCreateLabel(contentType)
  const showPreviewToggle = contentType !== 'read-later'
  const previewToggleLabel = isPreviewing ? '继续编辑' : '预览'
  const showContentTypeSwitcher = isDashboardLike
  const showAnnotationToggle = isDashboardLike && contentType === 'read-later' && (onOpenAnnotations || onBackToDashboard)
  const showTrashToggle = !isEditor && Boolean(onOpenTrash || onBackToDashboard)
  const showFeedsToggle = !isEditor && Boolean(onOpenFeeds || onBackToDashboard)
  const showRssBadge = !isFeedsView && rssUnreadCount > 0
  const rssBadgeLabel = rssUnreadCount > 99 ? '99+' : String(rssUnreadCount)
  const showMaterialOrganizer = isDashboardLike && contentType === 'diary' && Boolean(onOrganizeMaterials)
  const searchPlaceholder = getSearchPlaceholder(adminView, contentType)

  return (
    <header className={`top-bar${isEditor ? ' top-bar--editor' : ''}`}>
      <div className="top-bar__identity">
        <AlpacaLogo />
        <div className="top-bar__identity-text">
          {isDashboardLike || isTrashView ? <p className="top-bar__eyebrow">Alpaca Notes</p> : null}
          <div className="top-bar__title-row">
            <strong>{titleText}</strong>
            <span className="top-bar__status">{status}</span>
          </div>
        </div>
      </div>

      <div className={`top-bar__controls${showContentTypeSwitcher ? '' : ' top-bar__controls--editor'}`}>
        <label className="top-bar__search" style={{ marginBottom: 0 }}>
          <span className="sr-only">搜索</span>
          <input
            ref={searchInputRef}
            aria-label="搜索"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>
        {showContentTypeSwitcher ? (
          <div className="top-bar__content-switcher">
            <span className="top-bar__switcher-label">内容类型</span>
            <div className="top-bar__switcher-options" role="radiogroup" aria-label="内容类型">
              {CONTENT_TYPE_OPTIONS.map((option) => {
                const checked = option.value === contentType
                return (
                  <label
                    key={option.value}
                    className={`top-bar__switcher-option${checked ? ' top-bar__switcher-option--active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="content-type"
                      value={option.value}
                      aria-label={option.label}
                      checked={checked}
                      onChange={() => onContentTypeChange(option.value)}
                    />
                    <span className="top-bar__switcher-short" aria-hidden="true">{option.shortLabel}</span>
                    <span className="top-bar__switcher-text">
                      <strong>{option.label}</strong>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="top-bar__actions">
        <div className="top-bar__primary-actions">
          {showAnnotationToggle ? (
            <button
              className={`top-bar__button${isAnnotationsView ? ' top-bar__button--active' : ''}`}
              type="button"
              onClick={isAnnotationsView ? onBackToDashboard : onOpenAnnotations}
            >
              {isAnnotationsView ? '返回待读' : '批注'}
            </button>
          ) : null}
          {showTrashToggle ? (
            <button
              className={`top-bar__button top-bar__button--icon${isTrashView ? ' top-bar__button--active' : ''}`}
              type="button"
              onClick={isTrashView ? onBackToDashboard : onOpenTrash}
              aria-label={isTrashView ? '返回内容' : '打开回收站'}
              title={isTrashView ? '返回内容' : '回收站'}
            >
              {isTrashView ? <BackIcon /> : <TrashIcon />}
            </button>
          ) : null}
          {showFeedsToggle ? (
            <button
              className={`top-bar__button top-bar__button--rss${isFeedsView ? ' top-bar__button--active' : ''}`}
              type="button"
              onClick={isFeedsView ? onBackToDashboard : onOpenFeeds}
            >
              {isFeedsView ? '返回内容' : 'RSS'}
              {showRssBadge ? <span className="top-bar__rss-badge" aria-hidden="true" title={`${rssUnreadCount} 条 RSS 未读`}>{rssBadgeLabel}</span> : null}
            </button>
          ) : null}
          {isEditor && onBackToDashboard ? (
            <button
              className="top-bar__button top-bar__button--back"
              type="button"
              onClick={onBackToDashboard}
            >
              {backButtonLabel}
            </button>
          ) : null}
          {showMaterialOrganizer ? (
            <button
              className="top-bar__button top-bar__button--quiet"
              type="button"
              onClick={onOrganizeMaterials}
            >
              整理素材
            </button>
          ) : null}
          {!isTrashView && !isFeedsView ? (
            <button className="top-bar__button top-bar__button--new-post" type="button" onClick={onNewPost}>
              {createLabel}
            </button>
          ) : null}
          {isEditor ? (
            <>
              <button
                className={`top-bar__button top-bar__button--save${isSaveQuiet ? ' top-bar__button--save-quiet' : ''}`}
                type="button"
                onClick={onSave}
                disabled={isSaveDisabled}
              >
                {saveLabel}
              </button>
              {showPreviewToggle ? (
                <button className="top-bar__button" type="button" onClick={onTogglePreview} disabled={!hasActiveDocument}>
                  {previewToggleLabel}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="top-bar__utility-actions">
          <button
            className={`top-bar__button top-bar__button--theme${isDarkMode ? ' is-dark' : ' is-light'}`}
            type="button"
            onClick={onToggleColorMode}
            aria-label={isDarkMode ? '切换浅色模式' : '切换深色模式'}
            aria-pressed={isDarkMode}
            title={isDarkMode ? '切换浅色模式' : '切换深色模式'}
          >
            <span className="top-bar__theme-glyph" aria-hidden="true">
              {isDarkMode ? <MoonIcon /> : <SunIcon />}
            </span>
          </button>
          <button className="top-bar__button top-bar__button--quiet" type="button" onClick={onLogout}>
            退出登录
          </button>
        </div>
      </div>
    </header>
  )
}
