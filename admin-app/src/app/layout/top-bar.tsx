import { useEffect, useRef, useState, type ChangeEvent, type Ref } from 'react'
import type { ContentType } from '../posts/post-types'
import {
  READING_FONT_SIZE_MAX,
  READING_FONT_SIZE_MIN,
  READING_FONT_WEIGHTS,
} from './use-reading-font'

type AdminView = 'dashboard' | 'editor' | 'annotations' | 'trash' | 'feeds' | 'series'

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

function FontSizeIcon() {
  return (
    <svg className="top-bar__font-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3.7 15 7.4 5.6h1.2L12.3 15h-1.6l-0.95-2.6H6.2L5.3 15H3.7Zm2.92-3.9h2.96l-1.46-4.05-1.5 4.05Z" fill="currentColor" />
      <path d="M13.4 13.4h4.2v1.18h-5.5v-1.06l1.62-1.74c.66-.72 1.06-1.18 1.2-1.4.18-.28.27-.55.27-.82 0-.32-.1-.58-.3-.78-.2-.2-.46-.3-.8-.3-.3 0-.55.08-.78.25-.22.16-.4.4-.52.7l-1.18-.4c.18-.55.5-.98.92-1.28.43-.3.94-.45 1.54-.45.7 0 1.27.2 1.7.6.43.4.64.93.64 1.6 0 .4-.1.78-.3 1.14-.18.36-.6.87-1.24 1.54l-1.46 1.56Z" fill="currentColor" opacity="0.92" />
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
  isRssRefreshing?: boolean
  onContentTypeChange: (value: ContentType) => void
  contentType: ContentType
  searchInputRef?: Ref<HTMLInputElement>
  adminView: AdminView
  isPreviewing: boolean
  isDarkMode: boolean
  hasActiveDocument: boolean
  previewFontSize?: number
  previewFontWeightIndex?: number
  onPreviewFontSizeChange?: (next: number) => void
  onPreviewFontWeightIndexChange?: (next: number) => void
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
  isPostListOpen?: boolean
  isSettingsPanelOpen?: boolean
  onTogglePostList?: () => void
  onToggleSettingsPanel?: () => void
  onCopyCurrentPath?: () => void
  onExportCurrent?: () => void
  onDuplicateCurrent?: () => void
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

function getContentTypeLabel(contentType: ContentType) {
  return CONTENT_TYPE_OPTIONS.find((option) => option.value === contentType)?.label || '文章'
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
  isRssRefreshing = false,
  onContentTypeChange,
  contentType,
  searchInputRef,
  adminView,
  isPreviewing,
  isDarkMode,
  hasActiveDocument,
  previewFontSize = 16,
  previewFontWeightIndex = 1,
  onPreviewFontSizeChange,
  onPreviewFontWeightIndexChange,
  saveLabel,
  isSaveDisabled,
  isSaveQuiet,
  status,
  currentActionContentType,
  isCurrentPinned = false,
  isPinningCurrent = false,
  isPinActionDisabled = false,
  onTogglePinnedCurrent,
  isDeletingCurrent = false,
  isDeleteActionDisabled = false,
  onDeleteCurrent,
  isPostListOpen = false,
  isSettingsPanelOpen = false,
  onTogglePostList,
  onToggleSettingsPanel,
  onCopyCurrentPath,
  onExportCurrent,
  onDuplicateCurrent,
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
  const showReadingFontButton = isEditor
  const [isReadingFontOpen, setIsReadingFontOpen] = useState(false)
  const readingFontButtonRef = useRef<HTMLButtonElement | null>(null)
  const readingFontPopoverRef = useRef<HTMLDivElement | null>(null)
  const editorMenuRef = useRef<HTMLElement | null>(null)
  const [openEditorMenu, setOpenEditorMenu] = useState<'content' | 'more' | null>(null)

  useEffect(() => {
    if (!isReadingFontOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }

      if (readingFontPopoverRef.current?.contains(target)) {
        return
      }

      if (readingFontButtonRef.current?.contains(target)) {
        return
      }

      setIsReadingFontOpen(false)
    }

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsReadingFontOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeydown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeydown)
    }
  }, [isReadingFontOpen])

  useEffect(() => {
    if (!openEditorMenu) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!editorMenuRef.current?.contains(event.target as Node)) {
        setOpenEditorMenu(null)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenEditorMenu(null)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openEditorMenu])

  const toggleReadingFontOpen = () => {
    setIsReadingFontOpen((current) => !current)
  }

  const handleFontSizeSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    onPreviewFontSizeChange?.(Number.parseInt(event.target.value, 10))
  }

  const handleFontSizeStep = (delta: number) => {
    onPreviewFontSizeChange?.(previewFontSize + delta)
  }

  const handleFontWeightSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    onPreviewFontWeightIndexChange?.(Number.parseInt(event.target.value, 10))
  }
  const showContentTypeSwitcher = isDashboardLike
  const showAnnotationToggle = isDashboardLike && contentType === 'read-later' && (onOpenAnnotations || onBackToDashboard)
  const showTrashToggle = !isEditor && Boolean(onOpenTrash || onBackToDashboard)
  const showFeedsToggle = !isEditor && Boolean(onOpenFeeds || onBackToDashboard)
  const showRssBadge = !isFeedsView && rssUnreadCount > 0
  const showRssRefreshing = !isFeedsView && isRssRefreshing
  const rssBadgeLabel = rssUnreadCount > 99 ? '99+' : String(rssUnreadCount)
  const showMaterialOrganizer = isDashboardLike && contentType === 'diary' && Boolean(onOrganizeMaterials)
  const searchPlaceholder = getSearchPlaceholder(adminView, contentType)

  if (isEditor && contentType !== 'read-later') {
    return (
      <header className="top-bar top-bar--editor top-bar--editor-workspace" ref={editorMenuRef}>
        <div className="top-bar__editor-left">
          {onBackToDashboard ? (
            <button
              type="button"
              className="top-bar__button top-bar__button--icon top-bar__button--back-icon"
              onClick={onBackToDashboard}
              aria-label={backButtonLabel}
              title={backButtonLabel}
            >
              <BackIcon />
            </button>
          ) : null}
          <div className="top-bar__editor-product-menu">
            <button
              type="button"
              className="top-bar__editor-product-button"
              onClick={() => setOpenEditorMenu((current) => current === 'content' ? null : 'content')}
              aria-haspopup="menu"
              aria-expanded={openEditorMenu === 'content'}
            >
              <AlpacaLogo />
              <span>内容编辑</span>
              <span aria-hidden="true">⌄</span>
            </button>
            {openEditorMenu === 'content' ? (
              <div className="top-bar__editor-menu top-bar__editor-menu--content" role="menu">
                {CONTENT_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={contentType === option.value}
                    className={contentType === option.value ? 'is-active' : ''}
                    onClick={() => {
                      setOpenEditorMenu(null)
                      onContentTypeChange(option.value)
                    }}
                  >
                    <span>{option.label}</span>
                    {contentType === option.value ? <span aria-hidden="true">✓</span> : null}
                  </button>
                ))}
                <div className="top-bar__editor-menu-divider" />
                <button type="button" role="menuitem" onClick={onToggleColorMode}>
                  {isDarkMode ? '切换浅色模式' : '切换深色模式'}
                </button>
                <button type="button" role="menuitem" onClick={onLogout}>退出登录</button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className={`top-bar__button${isPostListOpen ? ' top-bar__button--active' : ''}`}
            onClick={onTogglePostList}
            aria-pressed={isPostListOpen}
          >
            文章列表
          </button>
          <button className="top-bar__button top-bar__button--new-post" type="button" onClick={onNewPost}>
            {createLabel}
          </button>
        </div>

        <div className="top-bar__editor-actions">
          <button
            type="button"
            className={`top-bar__button${isSettingsPanelOpen ? ' top-bar__button--active' : ''}`}
            onClick={onToggleSettingsPanel}
            aria-pressed={isSettingsPanelOpen}
          >
            <span aria-hidden="true">⚙</span>
            文章设置
          </button>
          {showPreviewToggle ? (
            <button className="top-bar__button" type="button" onClick={onTogglePreview} disabled={!hasActiveDocument}>
              <span aria-hidden="true">◉</span>
              {previewToggleLabel}
            </button>
          ) : null}
          <button
            className={`top-bar__button top-bar__button--save${isSaveQuiet ? ' top-bar__button--save-quiet' : ''}`}
            type="button"
            onClick={onSave}
            disabled={isSaveDisabled}
          >
            {saveLabel}
          </button>
          <div className="top-bar__editor-more">
            <button
              type="button"
              className="top-bar__button top-bar__button--icon"
              aria-label="更多文章操作"
              aria-haspopup="menu"
              aria-expanded={openEditorMenu === 'more'}
              onClick={() => setOpenEditorMenu((current) => current === 'more' ? null : 'more')}
            >
              •••
            </button>
            {openEditorMenu === 'more' ? (
              <div className="top-bar__editor-menu top-bar__editor-menu--more" role="menu">
                <button type="button" role="menuitem" onClick={onDuplicateCurrent} disabled={!onDuplicateCurrent}>复制文章</button>
                <button type="button" role="menuitem" onClick={onCopyCurrentPath} disabled={!onCopyCurrentPath}>复制文件路径</button>
                <button type="button" role="menuitem" onClick={onExportCurrent} disabled={!onExportCurrent}>导出 Markdown</button>
                {onTogglePinnedCurrent ? (
                  <button type="button" role="menuitem" onClick={onTogglePinnedCurrent} disabled={isPinActionDisabled || isPinningCurrent}>
                    {isPinningCurrent ? '正在更新置顶…' : isCurrentPinned ? '取消置顶' : '置顶文章'}
                  </button>
                ) : null}
                <div className="top-bar__editor-menu-divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="top-bar__editor-menu-danger"
                  onClick={onDeleteCurrent}
                  disabled={!onDeleteCurrent || isDeleteActionDisabled || isDeletingCurrent}
                >
                  {isDeletingCurrent ? '正在删除…' : `删除${getContentTypeLabel(currentActionContentType || contentType)}`}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
    )
  }

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
              {showRssRefreshing ? (
                <span
                  className={`top-bar__rss-loading${showRssBadge ? ' top-bar__rss-loading--with-badge' : ''}`}
                  aria-hidden="true"
                  title="RSS 正在获取"
                />
              ) : null}
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
          {showReadingFontButton ? (
            <div className="top-bar__reading-font">
              <button
                ref={readingFontButtonRef}
                className={`top-bar__button top-bar__button--icon top-bar__button--reading-font${isReadingFontOpen ? ' is-active' : ''}`}
                type="button"
                onClick={toggleReadingFontOpen}
                aria-label="调整阅读字体"
                aria-haspopup="true"
                aria-expanded={isReadingFontOpen}
                title="调整阅读字体"
              >
                <FontSizeIcon />
              </button>
              {isReadingFontOpen ? (
                <div ref={readingFontPopoverRef} className="top-bar__reading-font-popover" role="dialog" aria-label="调整阅读字体">
                  <div className="top-bar__reading-font-row">
                    <span className="top-bar__reading-font-name">阅读字号</span>
                    <span className="top-bar__reading-font-value">{previewFontSize}</span>
                  </div>
                  <div className="top-bar__reading-font-controls">
                    <button
                      type="button"
                      className="top-bar__reading-font-step"
                      onClick={() => handleFontSizeStep(-1)}
                      disabled={previewFontSize <= READING_FONT_SIZE_MIN}
                      aria-label="减小字号"
                    >
                      A-
                    </button>
                    <input
                      type="range"
                      className="top-bar__reading-font-slider"
                      min={READING_FONT_SIZE_MIN}
                      max={READING_FONT_SIZE_MAX}
                      step={1}
                      value={previewFontSize}
                      onChange={handleFontSizeSliderChange}
                      aria-label="阅读字号"
                    />
                    <button
                      type="button"
                      className="top-bar__reading-font-step top-bar__reading-font-step--plus"
                      onClick={() => handleFontSizeStep(1)}
                      disabled={previewFontSize >= READING_FONT_SIZE_MAX}
                      aria-label="增大字号"
                    >
                      A+
                    </button>
                  </div>
                  <div className="top-bar__reading-font-divider" />
                  <div className="top-bar__reading-font-row">
                    <span className="top-bar__reading-font-name">字体粗细</span>
                    <span className="top-bar__reading-font-value">{READING_FONT_WEIGHTS[previewFontWeightIndex]?.label ?? '常规'}</span>
                  </div>
                  <div className="top-bar__reading-font-controls">
                    <span className="top-bar__reading-font-glyph top-bar__reading-font-glyph--light" aria-hidden="true">A</span>
                    <input
                      type="range"
                      className="top-bar__reading-font-slider"
                      min={0}
                      max={READING_FONT_WEIGHTS.length - 1}
                      step={1}
                      value={previewFontWeightIndex}
                      onChange={handleFontWeightSliderChange}
                      aria-label="字体粗细"
                    />
                    <span className="top-bar__reading-font-glyph top-bar__reading-font-glyph--bold" aria-hidden="true">A</span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
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
          <span className="top-bar__utility-divider" aria-hidden="true" />
          <button className="top-bar__button top-bar__button--quiet" type="button" onClick={onLogout}>
            退出登录
          </button>
        </div>
      </div>
    </header>
  )
}
