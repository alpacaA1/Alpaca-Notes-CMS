import type { Ref } from 'react'

type AdminView = 'dashboard' | 'editor'

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
  searchInputRef?: Ref<HTMLInputElement>
  adminView: AdminView
  isPreviewing: boolean
  isDarkMode: boolean
  hasActiveDocument: boolean
  saveLabel: string
  isSaveDisabled: boolean
  isSaveQuiet: boolean
  status: string
}

export default function TopBar({
  search,
  onSearchChange,
  onNewPost,
  onSave,
  onTogglePreview,
  onLogout,
  onToggleColorMode,
  onBackToDashboard,
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
  const isDashboard = adminView === 'dashboard'
  const titleText = isDashboard ? '文章管理' : '内容编辑台'

  return (
    <header className="top-bar">
      <div className="top-bar__identity">
        <AlpacaLogo />
        <div className="top-bar__identity-text">
          <p className="top-bar__eyebrow">Alpaca Notes</p>
          <div>
            <strong>{titleText}</strong>
            <span className="top-bar__status">{status}</span>
          </div>
        </div>
      </div>

      <label className="top-bar__search">
        <span className="sr-only">搜索</span>
        <input
          ref={searchInputRef}
          aria-label="搜索"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索标题或链接"
        />
      </label>

      <div className="top-bar__actions">
        {!isDashboard && onBackToDashboard ? (
          <button
            className="top-bar__button top-bar__button--back"
            type="button"
            onClick={onBackToDashboard}
          >
            ← 返回列表
          </button>
        ) : null}
        {isDashboard ? (
          <button className="top-bar__button top-bar__button--new-post" type="button" onClick={onNewPost}>
            新建文章
          </button>
        ) : (
          <>
            <button className="top-bar__button top-bar__button--new-post" type="button" onClick={onNewPost}>
              新建文章
            </button>
            <button
              className={`top-bar__button top-bar__button--save${isSaveQuiet ? ' top-bar__button--save-quiet' : ''}`}
              type="button"
              onClick={onSave}
              disabled={isSaveDisabled}
            >
              {saveLabel}
            </button>
            <button className="top-bar__button" type="button" onClick={onTogglePreview} disabled={!hasActiveDocument}>
              {isPreviewing ? '继续编辑' : '预览'}
            </button>
          </>
        )}
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
    </header>
  )
}
