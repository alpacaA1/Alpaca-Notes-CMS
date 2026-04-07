type TopBarProps = {
  search: string
  onSearchChange: (value: string) => void
  onNewPost: () => void
  onSave: () => void
  onTogglePreview: () => void
  onToggleImmersive: () => void
  onLogout: () => void
  isPreviewing: boolean
  isImmersive: boolean
  status: string
}

export default function TopBar({
  search,
  onSearchChange,
  onNewPost,
  onSave,
  onTogglePreview,
  onToggleImmersive,
  onLogout,
  isPreviewing,
  isImmersive,
  status,
}: TopBarProps) {
  return (
    <header className="top-bar">
      <button type="button" onClick={onNewPost}>
        New post
      </button>
      <label>
        <span className="sr-only">Search</span>
        <input
          aria-label="Search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search"
        />
      </label>
      <button type="button">Filter</button>
      <button type="button">Sort</button>
      <button type="button" onClick={onSave}>
        Save
      </button>
      <button type="button" onClick={onTogglePreview}>
        {isPreviewing ? 'Editor' : 'Preview'}
      </button>
      <button type="button" onClick={onToggleImmersive}>
        {isImmersive ? 'Exit immersive' : 'Immersive'}
      </button>
      <button type="button" onClick={onLogout}>
        Log out
      </button>
      <span>{status}</span>
    </header>
  )
}
