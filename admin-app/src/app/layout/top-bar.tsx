import type { Ref } from 'react'
import type { ContentType } from '../posts/post-types'

type AdminView = 'dashboard' | 'editor' | 'annotations'

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

type TopBarProps = {
  search: string
  onSearchChange: (value: string) => void
  onNewPost: () => void
  onSave: () => void
  onTogglePreview: () => void
  onLogout: () => void
  onToggleColorMode: () => void
  onBackToDashboard?: () => void
  onOpenAnnotations?: () => void
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

export default function TopBar({
  search,
  onSearchChange,
  onNewPost,
  onSave,
  onTogglePreview,
  onLogout,
  onToggleColorMode,
  onBackToDashboard,
  onOpenAnnotations,
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
  const isDashboardLike = !isEditor
  const titleText = isAnnotationsView
    ? '批注管理'
    : isDashboardLike
      ? (contentType === 'read-later' ? '待读管理' : contentType === 'diary' ? '日记管理' : contentType === 'knowledge' ? '知识点管理' : '文章管理')
      : '内容编辑台'
  const createLabel =
    contentType === 'read-later'
      ? '新建待读'
      : contentType === 'diary'
        ? '新建日记'
        : contentType === 'knowledge'
          ? '新建知识点'
          : '新建文章'
  const showPreviewToggle = contentType !== 'read-later'
  const previewToggleLabel = isPreviewing ? '继续编辑' : '预览'
  const showContentTypeSwitcher = isDashboardLike
  const showAnnotationToggle = isDashboardLike && contentType === 'read-later' && (onOpenAnnotations || onBackToDashboard)
  const searchPlaceholder = isAnnotationsView
    ? '搜索摘录、批注、来源文章、来源或标签'
    : contentType === 'read-later'
      ? '搜索标题、摘要、正文、来源或原文链接'
      : contentType === 'diary'
        ? '搜索标题、摘要、正文或标签'
        : contentType === 'knowledge'
          ? '搜索标题、内容、来源或标签'
        : '搜索标题、摘要、正文、标签或链接'

  return (
    <header className={`top-bar${isEditor ? ' top-bar--editor' : ''}`}>
      <div className="top-bar__identity">
        <AlpacaLogo />
        <div className="top-bar__identity-text">
          {isDashboardLike ? <p className="top-bar__eyebrow">Alpaca Notes</p> : null}
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
          {isEditor && onBackToDashboard ? (
            <button
              className="top-bar__button top-bar__button--back"
              type="button"
              onClick={onBackToDashboard}
            >
              ← 返回列表
            </button>
          ) : null}
          <button className="top-bar__button top-bar__button--new-post" type="button" onClick={onNewPost}>
            {createLabel}
          </button>
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
            className="top-bar__button top-bar__button--theme"
            type="button"
            onClick={onToggleColorMode}
            aria-label={isDarkMode ? '切换浅色模式' : '切换深色模式'}
            title={isDarkMode ? '切换浅色模式' : '切换深色模式'}
          >
            {isDarkMode ? '☀️' : '🌙'}
          </button>
          <button className="top-bar__button top-bar__button--quiet" type="button" onClick={onLogout}>
            退出登录
          </button>
        </div>
      </div>
    </header>
  )
}
