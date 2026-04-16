type TopBarProps = {
  search: string
  onSearchChange: (value: string) => void
  onNewPost: () => void
  onSave: () => void
  onTogglePreview: () => void
  onLogout: () => void
  isPreviewing: boolean
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
  isPreviewing,
  hasActiveDocument,
  saveLabel,
  isSaveDisabled,
  isSaveQuiet,
  status,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar__identity">
        <p className="top-bar__eyebrow">写作后台</p>
        <div>
          <strong>内容编辑台</strong>
          <span className="top-bar__status">{status}</span>
        </div>
      </div>

      <label className="top-bar__search">
        <span className="sr-only">搜索</span>
        <input
          aria-label="搜索"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索标题或链接"
        />
      </label>

      <div className="top-bar__actions">
        <button className="top-bar__button top-bar__button--new-post" type="button" onClick={onNewPost}>
          新建文章
        </button>
        <button className="top-bar__button" type="button">
          筛选
        </button>
        <button className="top-bar__button" type="button">
          排序
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
        <button className="top-bar__button top-bar__button--quiet" type="button" onClick={onLogout}>
          退出登录
        </button>
      </div>
    </header>
  )
}
