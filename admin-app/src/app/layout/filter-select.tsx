import { useEffect, useId, useMemo, useRef, useState } from 'react'

export type FilterSelectOption = {
  value: string
  label: string
  keywords?: string
}

type FilterSelectProps = {
  label: string
  value: string
  options: FilterSelectOption[]
  onChange: (value: string) => void
  searchable?: boolean
  searchPlaceholder?: string
  emptyMessage?: string
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase()
}

function uniqueOptions(options: FilterSelectOption[]) {
  const deduped = new Map<string, FilterSelectOption>()

  options.forEach((option) => {
    if (!deduped.has(option.value)) {
      deduped.set(option.value, option)
    }
  })

  return Array.from(deduped.values())
}

export default function FilterSelect({
  label,
  value,
  options,
  onChange,
  searchable = false,
  searchPlaceholder,
  emptyMessage,
}: FilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const normalizedOptions = useMemo(() => uniqueOptions(options), [options])
  const normalizedQuery = normalizeText(query)
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return normalizedOptions
    }

    return normalizedOptions.filter((option) => {
      const haystack = `${option.label} ${option.keywords || ''}`
      return normalizeText(haystack).includes(normalizedQuery)
    })
  }, [normalizedOptions, normalizedQuery])
  const selectedOption = normalizedOptions.find((option) => option.value === value) || null
  const triggerText = selectedOption?.label || '请选择'
  const searchLabel = `搜索${label}`
  const listboxLabel = `${label}选项`
  const resolvedSearchPlaceholder = searchPlaceholder || `筛选${label}`
  const resolvedEmptyMessage = emptyMessage || `没有找到匹配的${label}。`

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleDocumentClick = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setQuery('')
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('touchstart', handleDocumentClick)
    window.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('touchstart', handleDocumentClick)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && searchable) {
      searchInputRef.current?.focus()
    }
  }, [isOpen, searchable])

  function handleToggleOpen() {
    setIsOpen((currentValue) => {
      if (currentValue) {
        setQuery('')
      }

      return !currentValue
    })
  }

  function handleSelect(nextValue: string) {
    onChange(nextValue)
    setIsOpen(false)
    setQuery('')
  }

  return (
    <div className="filter-select" ref={containerRef}>
      <button
        type="button"
        className="filter-select__trigger"
        aria-label={`筛选${label}`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={handleToggleOpen}
      >
        <span className="filter-select__trigger-text" title={triggerText}>
          {triggerText}
        </span>
      </button>

      {isOpen ? (
        <div className="filter-select__panel">
          {searchable ? (
            <label className="filter-select__search">
              <span className="filter-select__search-label">{searchLabel}</span>
              <input
                ref={searchInputRef}
                aria-label={searchLabel}
                value={query}
                placeholder={resolvedSearchPlaceholder}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          ) : null}

          {filteredOptions.length > 0 ? (
            <div id={listboxId} role="listbox" aria-label={listboxLabel} className="filter-select__options">
              {filteredOptions.map((option) => {
                const isSelected = option.value === value

                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    className={`filter-select__option${isSelected ? ' is-selected' : ''}`}
                    title={option.label}
                    onClick={() => handleSelect(option.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleSelect(option.value)
                      }
                    }}
                  >
                    <span className="filter-select__option-label">{option.label}</span>
                    <span className="filter-select__option-trail" aria-hidden="true">
                      {isSelected ? '当前' : ''}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="filter-select__status">{resolvedEmptyMessage}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
