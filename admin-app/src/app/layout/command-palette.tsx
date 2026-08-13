import React, { useEffect, useState, useRef } from 'react'

export interface CommandPaletteOption {
  id: string
  label: string
  category: string
  icon?: string
  shortcut?: string
  action: () => void
}

export interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  options: CommandPaletteOption[]
}

export function CommandPalette({ isOpen, onClose, options }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(query.toLowerCase()) ||
      opt.category.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [isOpen])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return

      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((prev) => (filteredOptions.length > 0 ? (prev + 1) % filteredOptions.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((prev) =>
          filteredOptions.length > 0 ? (prev - 1 + filteredOptions.length) % filteredOptions.length : 0
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (filteredOptions[selectedIndex]) {
          filteredOptions[selectedIndex].action()
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, filteredOptions, selectedIndex, onClose])

  if (!isOpen) return null

  return (
    <div
      className="command-palette-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="命令面板"
    >
      <div
        className="command-palette"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="command-palette__header">
          <svg className="command-palette__search-icon" width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path
              d="M14.5 14.5L18 18M16.5 9.5C16.5 13.366 13.366 16.5 9.5 16.5C5.63401 16.5 2.5 13.366 2.5 9.5C2.5 5.63401 5.63401 2.5 9.5 2.5C13.366 2.5 16.5 5.63401 16.5 9.5Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="command-palette__input"
            placeholder="搜索文章、跳转功能或执行快捷指令..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="command-palette__kbd">ESC</kbd>
        </div>

        <div className="command-palette__body">
          {filteredOptions.length === 0 ? (
            <div className="command-palette__empty">未找到匹配的命令或项目</div>
          ) : (
            <ul className="command-palette__list" role="listbox">
              {filteredOptions.map((opt, idx) => {
                const isSelected = idx === selectedIndex
                return (
                  <li
                    key={opt.id}
                    role="option"
                    aria-selected={isSelected}
                    className={`command-palette__item ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => {
                      opt.action()
                      onClose()
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    {opt.icon ? <span className="command-palette__item-icon">{opt.icon}</span> : null}
                    <span className="command-palette__item-label">{opt.label}</span>
                    <span className="command-palette__item-category">{opt.category}</span>
                    {opt.shortcut ? <kbd className="command-palette__item-shortcut">{opt.shortcut}</kbd> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="command-palette__footer">
          <span><kbd>↑</kbd> <kbd>↓</kbd> 切换</span>
          <span><kbd>↵</kbd> 执行</span>
          <span><kbd>⌘K</kbd> / <kbd>Esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  )
}
