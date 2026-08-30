import { useEffect, useRef, useState, type ChangeEvent, type Ref } from 'react'
import type { ContentType } from '../posts/post-types'
import {
  READING_FONT_FAMILIES,
  READING_FONT_SIZE_MAX,
  READING_FONT_SIZE_MIN,
  READING_FONT_WEIGHTS,
} from './use-reading-font'

const TOOL_HUB_URL = 'https://alpacaa1.github.io/tool-hub/'

type AdminView = 'dashboard' | 'editor' | 'annotations' | 'trash' | 'feeds' | 'series' | 'books' | 'movies'

function AlpacaLogo() {
  return <img className="top-bar__logo" src={`${import.meta.env.BASE_URL}alpaca-notes-folded-film-icon.png`} alt="" />
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
    <svg className="top-bar__font-icon" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <text x="1.1" y="14.25" fill="currentColor" fontFamily="Georgia, serif" fontSize="13.5" fontWeight="700">A</text>
      <text x="10.6" y="14.7" fill="currentColor" fontFamily="Georgia, serif" fontSize="11.5" fontWeight="600">a</text>
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className="top-bar__theme-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="6.2" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 16.2c0-2.8 2.5-4.7 5.5-4.7s5.5 1.9 5.5 4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ToolHubMenuIcon() {
  return (
    <svg className="top-bar__menu-item-icon" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="14" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 6V4.5C7 3.67 7.67 3 8.5 3h3c.83 0 1.5.67 1.5 1.5V6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 10.5h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="10.5" r="1.2" fill="currentColor" />
    </svg>
  )
}

function LogoutMenuIcon() {
  return (
    <svg className="top-bar__menu-item-icon" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M7.5 4H4.5a1.5 1.5 0 0 0-1.5 1.5v9a1.5 1.5 0 0 0 1.5 1.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12.5 13.5l3.5-3.5-3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 10H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ExternalArrowIcon() {
  return (
    <svg className="top-bar__menu-item-arrow" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3.5h6.5V10M12.5 3.5L5.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RenderSaveBadge({ label }: { label: string }) {
  const isSaved = label.includes('已保存')
  const isSaving = label.includes('保存中')
  const statusClass = isSaved ? 'is-saved' : isSaving ? 'is-saving' : 'is-dirty'

  return (
    <span className={`top-bar__save-badge ${statusClass}`}>
      <span className="top-bar__status-dot" aria-hidden="true" />
      <span className="top-bar__status-text">{label}</span>
    </span>
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

function SearchIcon() {
  return (
    <svg className="top-bar__search-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function PreviewIcon() {
  return (
    <svg className="top-bar__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="3" y="3.5" width="14" height="10.5" rx="1.6" stroke="currentColor" strokeWidth="1.55" />
      <path d="M8 17h4M10 14v3" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
      <path d="m6.3 10 2.15-2.1 1.8 1.55 2.95-2.65" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg className="top-bar__icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.55" />
      <path d="M10 3.1v1.25M10 15.65v1.25M16.9 10h-1.25M4.35 10H3.1M14.88 5.12l-.88.88M6 14l-.88.88M14.88 14.88l-.88-.88M6 6l-.88-.88" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
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
  onOpenBooks?: () => void
  onOpenMovies?: () => void
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
  previewFontFamilyId?: string
  onPreviewFontSizeChange?: (next: number) => void
  onPreviewFontWeightIndexChange?: (next: number) => void
  onPreviewFontFamilyIdChange?: (next: string) => void
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
  onOpenCommandPalette?: () => void
  onOpenCheckin?: () => void
  checkinPendingCount?: number
  isBookReaderOpen?: boolean
}

const CONTENT_TYPE_OPTIONS: Array<{ value: ContentType; label: string; shortLabel: string }> = [
  { value: 'post', label: '文章', shortLabel: 'Post' },
  { value: 'diary', label: '日记', shortLabel: 'Diary' },
  { value: 'read-later', label: '待读', shortLabel: 'Later' },
  { value: 'knowledge', label: '知识点', shortLabel: 'Know' },
  { value: 'pitch', label: '灵感', shortLabel: 'Idea' },
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

  if (contentType === 'pitch') {
    return '灵感'
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

  if (contentType === 'pitch') {
    return '新建灵感'
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

  if (adminView === 'books') {
    return '搜索书名或作者'
  }

  if (adminView === 'movies') {
    return '搜索片名、导演或标签'
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

  if (contentType === 'pitch') {
    return '搜索灵感、来源或标签'
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
  onOpenBooks,
  onOpenMovies,
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
  previewFontFamilyId = 'sans',
  onPreviewFontSizeChange,
  onPreviewFontWeightIndexChange,
  onPreviewFontFamilyIdChange,
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
  onOpenCommandPalette,
  onOpenCheckin,
  checkinPendingCount,
  isBookReaderOpen = false,
}: TopBarProps) {
  const isEditor = adminView === 'editor'
  const isAnnotationsView = adminView === 'annotations'
  const isTrashView = adminView === 'trash'
  const isFeedsView = adminView === 'feeds'
  const isBooksView = adminView === 'books'
  const isMoviesView = adminView === 'movies'
  const isCollectionView = isBooksView || isMoviesView
  const isDashboardLike = !isEditor && !isTrashView && !isFeedsView && !isBooksView && !isMoviesView
  const titleText = isTrashView
    ? '回收站'
    : isFeedsView
      ? 'RSS 工作台'
    : isBooksView
      ? '电子书'
    : isMoviesView
      ? '光影'
    : isAnnotationsView
      ? '批注管理'
      : isDashboardLike
        ? getDashboardTitle(contentType)
        : '内容编辑台'
  const createLabel = getCreateLabel(contentType)
  const showPreviewToggle = contentType !== 'read-later'
  const previewToggleLabel = isPreviewing ? '继续编辑' : '预览'
  const showReadingFontButton = isEditor || (isBooksView && isBookReaderOpen)
  const [isReadingFontOpen, setIsReadingFontOpen] = useState(false)
  const readingFontButtonRef = useRef<HTMLButtonElement | null>(null)
  const readingFontPopoverRef = useRef<HTMLDivElement | null>(null)
  const editorMenuRef = useRef<HTMLElement | null>(null)
  const [openEditorMenu, setOpenEditorMenu] = useState<'content' | 'more' | null>(null)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuButtonRef = useRef<HTMLButtonElement | null>(null)
  const userMenuPopoverRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isUserMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null
      if (!target) {
        return
      }

      if (userMenuPopoverRef.current?.contains(target)) {
        return
      }

      if (userMenuButtonRef.current?.contains(target)) {
        return
      }

      setIsUserMenuOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isUserMenuOpen])

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
  const showFeedsToggle = false
  const showCollectionNavigation = !isEditor && Boolean(onOpenBooks || onOpenMovies || onBackToDashboard)
  const showRssBadge = !isFeedsView && rssUnreadCount > 0
  const showRssRefreshing = !isFeedsView && isRssRefreshing
  const rssBadgeLabel = rssUnreadCount > 99 ? '99+' : String(rssUnreadCount)
  const showMaterialOrganizer = isDashboardLike && contentType === 'diary' && Boolean(onOrganizeMaterials)
  const searchPlaceholder = getSearchPlaceholder(adminView, contentType)

  if (isEditor && contentType !== 'read-later') {
    return (
      <header className="top-bar top-bar--editor top-bar--editor-workspace" ref={editorMenuRef}>
        <div className="top-bar__editor-left">
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
                <a
                  href={TOOL_HUB_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="top-bar__editor-menu-link"
                  role="menuitem"
                  onClick={() => setOpenEditorMenu(null)}
                >
                  <span className="top-bar__menu-item-main">
                    <ToolHubMenuIcon />
                    <span>Tool Hub</span>
                  </span>
                  <ExternalArrowIcon />
                </a>
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
          {onBackToDashboard ? (
            <button
              className="top-bar__button top-bar__button--back"
              type="button"
              onClick={onBackToDashboard}
              aria-label={backButtonLabel}
            >
              <BackIcon />
              {backButtonLabel?.replace(/^←\s*/, '')}
            </button>
          ) : null}
          <button
            type="button"
            className={`top-bar__button top-bar__button--editor-settings${isSettingsPanelOpen ? ' top-bar__button--active' : ''}`}
            onClick={onToggleSettingsPanel}
            aria-pressed={isSettingsPanelOpen}
          >
            <SettingsIcon />
            {contentType === 'diary' ? '日记设置' : contentType === 'knowledge' ? '知识点设置' : contentType === 'pitch' ? '灵感设置' : '文章设置'}
          </button>
          {showPreviewToggle ? (
            <button className="top-bar__button top-bar__button--editor-preview" type="button" onClick={onTogglePreview} disabled={!hasActiveDocument}>
              <PreviewIcon />
              {previewToggleLabel}
            </button>
          ) : null}
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
                <div className="top-bar__reading-font-divider" />
                <div className="top-bar__reading-font-row">
                  <span className="top-bar__reading-font-name">字体风格</span>
                </div>
                <div className="top-bar__reading-font-family-group" role="radiogroup" aria-label="选择字体风格">
                  {READING_FONT_FAMILIES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={previewFontFamilyId === option.id}
                      className={`top-bar__reading-font-family-btn${previewFontFamilyId === option.id ? ' is-active' : ''}`}
                      onClick={() => onPreviewFontFamilyIdChange?.(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="top-bar__editor-more">
            <button
              type="button"
              className="top-bar__button top-bar__button--icon"
              aria-label="更多文章操作"
              aria-haspopup="menu"
              aria-expanded={openEditorMenu === 'more'}
              onClick={() => setOpenEditorMenu((current) => current === 'more' ? null : 'more')}
            >
              <svg className="top-bar__more-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="2.2" />
                <circle cx="12" cy="12" r="2.2" />
                <circle cx="19" cy="12" r="2.2" />
              </svg>
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
          <button
            className={`top-bar__button top-bar__button--save${isSaveQuiet ? ' top-bar__button--save-quiet' : ''}`}
            type="button"
            onClick={onSave}
            disabled={isSaveDisabled}
          >
            <RenderSaveBadge label={saveLabel} />
          </button>
        </div>
      </header>
    )
  }

  return (
    <header className={`top-bar${isEditor ? ' top-bar--editor' : ''}`}>
      <div className="top-bar__identity">
        <AlpacaLogo />
      </div>

      <div className={`top-bar__controls${showContentTypeSwitcher ? '' : ' top-bar__controls--editor'}`}>
        <label className="top-bar__search" style={{ marginBottom: 0 }}>
          <span className="sr-only">搜索</span>
          <SearchIcon />
          <input
            ref={searchInputRef}
            aria-label="搜索"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
          />
          {onOpenCommandPalette ? (
            <button
              type="button"
              className="top-bar__search-cmd-k"
              onClick={onOpenCommandPalette}
              aria-label="命令面板 (⌘K)"
              title="命令面板 (⌘K)"
            >
              <kbd>⌘K</kbd>
            </button>
          ) : null}
        </label>
        {showContentTypeSwitcher ? (
          <div className="top-bar__content-switcher">
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
          {showCollectionNavigation ? (
            isCollectionView ? (
              <>
                <div className="top-bar__collection-switch" aria-label="藏馆分类">
                  <span className="top-bar__collection-label">藏馆</span>
                  <div className="top-bar__collection-tabs" role="tablist" aria-label="藏馆分类">
                    <button
                      className={`top-bar__collection-tab${isBooksView ? ' is-active' : ''}`}
                      type="button"
                      onClick={onOpenBooks}
                      aria-current={isBooksView ? 'page' : undefined}
                    >
                      书架
                    </button>
                    <button
                      className={`top-bar__collection-tab${isMoviesView ? ' is-active' : ''}`}
                      type="button"
                      onClick={onOpenMovies}
                      aria-current={isMoviesView ? 'page' : undefined}
                    >
                      光影
                    </button>
                  </div>
                </div>
                <button
                  className="top-bar__button top-bar__button--back"
                  type="button"
                  onClick={onBackToDashboard}
                >
                  返回内容
                </button>
              </>
            ) : (
              <button
                className="top-bar__button"
                type="button"
                onClick={onOpenBooks}
              >
                藏馆
              </button>
            )
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
          {!isTrashView && !isFeedsView && !isBooksView && !isMoviesView ? (
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
                <RenderSaveBadge label={saveLabel} />
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
          {onOpenCheckin ? (
            <button
              className="top-bar__button top-bar__button--checkin"
              type="button"
              onClick={onOpenCheckin}
              aria-label="自我观察签到"
              title="自我观察签到"
            >
              ✍️ 签到
              {checkinPendingCount && checkinPendingCount > 0 ? (
                <span className="top-bar__checkin-badge">{checkinPendingCount}</span>
              ) : null}
            </button>
          ) : null}
          {!showContentTypeSwitcher && onOpenCommandPalette ? (
            <button
              className="top-bar__button top-bar__button--cmd-k"
              type="button"
              onClick={onOpenCommandPalette}
              aria-label="命令面板 (⌘K)"
              title="命令面板 (⌘K)"
            >
              <kbd className="top-bar__cmd-k-kbd">⌘K</kbd>
            </button>
          ) : null}
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
                  <div className="top-bar__reading-font-divider" />
                  <div className="top-bar__reading-font-row">
                    <span className="top-bar__reading-font-name">字体风格</span>
                  </div>
                  <div className="top-bar__reading-font-family-group" role="radiogroup" aria-label="选择字体风格">
                    {READING_FONT_FAMILIES.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={previewFontFamilyId === option.id}
                        className={`top-bar__reading-font-family-btn${previewFontFamilyId === option.id ? ' is-active' : ''}`}
                        onClick={() => onPreviewFontFamilyIdChange?.(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
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
          <div className="top-bar__user-menu">
            <button
              ref={userMenuButtonRef}
              className={`top-bar__button top-bar__button--icon top-bar__button--user${isUserMenuOpen ? ' is-active' : ''}`}
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              aria-label="用户与工具菜单"
              aria-haspopup="menu"
              aria-expanded={isUserMenuOpen}
              title="用户与工具菜单"
            >
              <UserIcon />
            </button>
            {isUserMenuOpen ? (
              <div ref={userMenuPopoverRef} className="top-bar__user-dropdown" role="menu" aria-label="用户与工具菜单">
                <a
                  href={TOOL_HUB_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="top-bar__user-dropdown-item"
                  role="menuitem"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <span className="top-bar__menu-item-main">
                    <ToolHubMenuIcon />
                    <span>Tool Hub</span>
                  </span>
                  <ExternalArrowIcon />
                </a>
                <div className="top-bar__user-dropdown-divider" />
                <button
                  type="button"
                  role="menuitem"
                  className="top-bar__user-dropdown-item top-bar__user-dropdown-item--danger"
                  onClick={() => {
                    setIsUserMenuOpen(false)
                    onLogout()
                  }}
                >
                  <span className="top-bar__menu-item-main">
                    <LogoutMenuIcon />
                    <span>退出登录</span>
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
