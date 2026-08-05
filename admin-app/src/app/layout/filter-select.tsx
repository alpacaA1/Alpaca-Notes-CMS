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
  allowCustomValue?: boolean
  searchPlaceholder?: string
  emptyMessage?: string
  placeholder?: string
  triggerAriaLabel?: string
  onRenameOption?: (oldValue: string, newValue: string) => void
  onDeleteOption?: (value: string) => void
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
  allowCustomValue = false,
  searchPlaceholder,
  emptyMessage,
  placeholder,
  triggerAriaLabel,
  onRenameOption,
  onDeleteOption,
}: FilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [editingOptionValue, setEditingOptionValue] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [confirmingDeleteValue, setConfirmingDeleteValue] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
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
  const triggerText = selectedOption?.label || value || placeholder || '请选择'
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
        setEditingOptionValue(null)
        setConfirmingDeleteValue(null)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setQuery('')
        setEditingOptionValue(null)
        setConfirmingDeleteValue(null)
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
        setEditingOptionValue(null)
        setConfirmingDeleteValue(null)
      }

      return !currentValue
    })
  }

  function handleSelect(nextValue: string) {
    onChange(nextValue)
    setIsOpen(false)
    setQuery('')
    setEditingOptionValue(null)
    setConfirmingDeleteValue(null)
  }

  function handleStartEdit(optValue: string, optLabel: string) {
    setEditingOptionValue(optValue)
    setEditingValue(optLabel)
    setConfirmingDeleteValue(null)
    setTimeout(() => {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }, 0)
  }

  function handleConfirmEdit() {
    if (!editingOptionValue || !onRenameOption) {
      return
    }

    const trimmed = editingValue.trim()
    if (trimmed.length === 0 || trimmed === editingOptionValue) {
      setEditingOptionValue(null)
      return
    }

    onRenameOption(editingOptionValue, trimmed)
    setEditingOptionValue(null)
  }

  function handleCancelEdit() {
    setEditingOptionValue(null)
  }

  function handleDelete(optValue: string) {
    if (!onDeleteOption) {
      return
    }

    onDeleteOption(optValue)
    setConfirmingDeleteValue(null)
  }

  const canCreateCustomValue = allowCustomValue && query.trim().length > 0 && !normalizedOptions.some(
    (option) => normalizeText(option.value) === normalizedQuery || normalizeText(option.label) === normalizedQuery,
  )

  const hasManageActions = Boolean(onRenameOption) || Boolean(onDeleteOption)

  return (
    <div className={`filter-select${isOpen ? ' is-open' : ''}`} ref={containerRef}>
      <button
        type="button"
        className="filter-select__trigger"
        aria-label={triggerAriaLabel || `筛选${label}`}
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
              <div className="filter-select__search-input-wrapper">
                <svg className="filter-select__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  ref={searchInputRef}
                  aria-label={searchLabel}
                  value={query}
                  placeholder={resolvedSearchPlaceholder}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </label>
          ) : null}

          {filteredOptions.length > 0 ? (
            <div id={listboxId} role="listbox" aria-label={listboxLabel} className="filter-select__options">
              {filteredOptions.map((option) => {
                const isSelected = option.value === value
                const isEditing = editingOptionValue === option.value
                const isConfirmingDelete = confirmingDeleteValue === option.value
                const isManageable = hasManageActions && Boolean(option.value)

                if (isEditing) {
                  return (
                    <div
                      key={option.value}
                      className="filter-select__option filter-select__option--editing"
                    >
                      <input
                        ref={editInputRef}
                        className="taxonomy-multi-select__edit-input"
                        aria-label={`重命名${label} ${option.label}`}
                        value={editingValue}
                        onChange={(event) => setEditingValue(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            handleConfirmEdit()
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            handleCancelEdit()
                          }
                        }}
                      />
                      <span className="taxonomy-multi-select__edit-actions">
                        <button
                          type="button"
                          className="taxonomy-multi-select__edit-btn taxonomy-multi-select__edit-btn--save"
                          aria-label={`确认重命名${label}`}
                          title="保存"
                          onClick={handleConfirmEdit}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="taxonomy-multi-select__edit-btn taxonomy-multi-select__edit-btn--cancel"
                          aria-label={`取消重命名${label}`}
                          title="取消"
                          onClick={handleCancelEdit}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                        </button>
                      </span>
                    </div>
                  )
                }

                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    className={`filter-select__option${isSelected ? ' is-selected' : ''}`}
                    title={option.label}
                    onClick={() => {
                      if (!isConfirmingDelete) {
                        handleSelect(option.value)
                      }
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && !isConfirmingDelete) {
                        event.preventDefault()
                        handleSelect(option.value)
                      }
                    }}
                  >
                    <span className="filter-select__option-label">{option.label}</span>
                    <span className="filter-select__option-trail" aria-hidden="true">
                      {isConfirmingDelete ? (
                        <span className="taxonomy-multi-select__confirm-box" onClick={(e) => e.stopPropagation()}>
                          <span className="taxonomy-multi-select__confirm-text">确定删除？</span>
                          <button
                            type="button"
                            className="taxonomy-multi-select__confirm-btn taxonomy-multi-select__confirm-btn--danger"
                            aria-label={`确认删除${label} ${option.label}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(option.value)
                            }}
                          >
                            确定
                          </button>
                          <button
                            type="button"
                            className="taxonomy-multi-select__confirm-btn"
                            aria-label={`取消删除${label} ${option.label}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmingDeleteValue(null)
                            }}
                          >
                            取消
                          </button>
                        </span>
                      ) : (
                        <>
                          {isSelected ? (
                            <svg
                              className="filter-select__check-icon"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          ) : null}
                          {isManageable ? (
                            <span className="filter-select__option-actions">
                              {onRenameOption ? (
                                <button
                                  type="button"
                                  className="taxonomy-multi-select__action-btn"
                                  aria-label={`编辑${label} ${option.label}`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    handleStartEdit(option.value, option.label)
                                  }}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                  </svg>
                                </button>
                              ) : null}
                              {onDeleteOption ? (
                                <button
                                  type="button"
                                  className="taxonomy-multi-select__action-btn taxonomy-multi-select__action-btn--danger"
                                  aria-label={`删除${label} ${option.label}`}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setConfirmingDeleteValue(option.value)
                                  }}
                                >
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  </svg>
                                </button>
                              ) : null}
                            </span>
                          ) : null}
                        </>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="filter-select__status">{resolvedEmptyMessage}</p>
          )}
          {canCreateCustomValue ? (
            <button type="button" className="filter-select__custom-option" onClick={() => handleSelect(query.trim())}>
              <span className="filter-select__custom-icon">+</span>
              <span>使用 “{query.trim()}”</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
