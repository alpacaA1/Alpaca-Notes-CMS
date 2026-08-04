import { useEffect, useId, useMemo, useRef, useState } from 'react'

type TaxonomyMultiSelectProps = {
  label: '分类' | '标签'
  value: string[]
  availableOptions: string[]
  onChange: (value: string[]) => void
  onCreateOption?: (name: string) => void
  onRenameOption?: (oldName: string, newName: string) => void
  onDeleteOption?: (name: string) => void
}

function uniqueValues(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index)
}

function normalizeOption(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '').trim()
}

function toggleValue(currentValues: string[], nextValue: string) {
  return currentValues.includes(nextValue)
    ? currentValues.filter((value) => value !== nextValue)
    : [...currentValues, nextValue]
}

export default function TaxonomyMultiSelect({
  label,
  value,
  availableOptions,
  onChange,
  onCreateOption,
  onRenameOption,
  onDeleteOption,
}: TaxonomyMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [editingOption, setEditingOption] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [confirmingDeleteOption, setConfirmingDeleteOption] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()
  const searchLabel = `搜索${label}`
  const triggerLabel = `选择${label}`
  const listboxLabel = `${label}选项`
  const normalizedValue = useMemo(
    () => uniqueValues(value.map(normalizeOption).filter((option) => option.length > 0)),
    [value],
  )
  const indexedOptions = useMemo(
    () => uniqueValues(availableOptions.map(normalizeOption).filter((option) => option.length > 0)),
    [availableOptions],
  )
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return indexedOptions
    }

    return indexedOptions.filter((option) => option.toLocaleLowerCase().includes(normalizedQuery))
  }, [indexedOptions, normalizedQuery])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const handleDocumentClick = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery('')
        setEditingOption(null)
        setConfirmingDeleteOption(null)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('touchstart', handleDocumentClick)

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('touchstart', handleDocumentClick)
    }
  }, [isOpen])

  const hasIndexedOptions = indexedOptions.length > 0
  const hasFilteredOptions = filteredOptions.length > 0
  const showSearch = hasIndexedOptions || Boolean(onCreateOption)
  const showListbox = hasIndexedOptions && hasFilteredOptions
  const statusMessage = !hasIndexedOptions && !onCreateOption
    ? `暂无已索引的${label}。`
    : hasIndexedOptions && !hasFilteredOptions && !canCreate()
      ? `没有找到匹配的${label}。`
      : null

  const hasManageActions = Boolean(onRenameOption) || Boolean(onDeleteOption)

  function canCreate(): boolean {
    if (!onCreateOption || !normalizedQuery) {
      return false
    }

    const exactMatch = indexedOptions.some(
      (option) => option.toLocaleLowerCase() === normalizedQuery,
    )
    const alreadySelected = normalizedValue.some(
      (val) => val.toLocaleLowerCase() === normalizedQuery,
    )
    return !exactMatch && !alreadySelected
  }

  function handleCreate() {
    const trimmed = query.trim()
    if (!trimmed || !onCreateOption) {
      return
    }

    onCreateOption(trimmed)
    // Also add to the current post's value
    if (!normalizedValue.includes(trimmed)) {
      onChange([...normalizedValue, trimmed])
    }
    setQuery('')
  }

  function handleToggleOption(option: string) {
    onChange(toggleValue(normalizedValue, option))
  }

  function handleToggleOpen() {
    setIsOpen((currentValue) => {
      if (currentValue) {
        setQuery('')
        setEditingOption(null)
        setConfirmingDeleteOption(null)
      }

      return !currentValue
    })
  }

  function handleStartEdit(option: string) {
    setEditingOption(option)
    setEditingValue(option)
    setConfirmingDeleteOption(null)
    setTimeout(() => {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    }, 0)
  }

  function handleConfirmEdit() {
    if (!editingOption || !onRenameOption) {
      return
    }

    const trimmed = editingValue.trim()
    if (trimmed.length === 0 || trimmed === editingOption) {
      setEditingOption(null)
      return
    }

    onRenameOption(editingOption, trimmed)
    setEditingOption(null)
  }

  function handleCancelEdit() {
    setEditingOption(null)
  }

  function handleDelete(option: string) {
    if (!onDeleteOption) {
      return
    }

    onDeleteOption(option)
  }

  const triggerText = normalizedValue.length > 0 ? normalizedValue.join(', ') : triggerLabel

  return (
    <div className="taxonomy-multi-select" ref={containerRef}>
      <button
        type="button"
        className="taxonomy-multi-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={triggerLabel}
        aria-controls={listboxId}
        onClick={handleToggleOpen}
      >
        <span className="taxonomy-multi-select__trigger-text">{triggerText}</span>
      </button>

      {isOpen ? (
        <div className="taxonomy-multi-select__panel">
          {showSearch ? (
            <label className="taxonomy-multi-select__search">
              <span className="taxonomy-multi-select__search-label">{searchLabel}</span>
              <div className="taxonomy-multi-select__search-input-wrapper">
                <svg className="taxonomy-multi-select__search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input
                  aria-label={searchLabel}
                  autoFocus
                  value={query}
                  placeholder={`搜索或输入新${label}`}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      if (canCreate()) {
                        handleCreate()
                      }
                    }
                  }}
                />
              </div>
            </label>
          ) : null}

          {statusMessage ? <p className="taxonomy-multi-select__status">{statusMessage}</p> : null}

          {showListbox ? (
            <div
              id={listboxId}
              role="listbox"
              aria-label={listboxLabel}
              aria-multiselectable="true"
              className="taxonomy-multi-select__options"
            >
              {filteredOptions.map((option) => {
                const isSelected = normalizedValue.includes(option)
                const isEditing = editingOption === option
                const isConfirmingDelete = confirmingDeleteOption === option

                if (isEditing) {
                  return (
                    <div
                      key={option}
                      className="taxonomy-multi-select__option taxonomy-multi-select__option--editing"
                    >
                      <input
                        ref={editInputRef}
                        className="taxonomy-multi-select__edit-input"
                        aria-label={`重命名${label} ${option}`}
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
                          className="taxonomy-multi-select__action-btn"
                          aria-label={`确认重命名${label}`}
                          onClick={handleConfirmEdit}
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="taxonomy-multi-select__action-btn"
                          aria-label={`取消重命名${label}`}
                          onClick={handleCancelEdit}
                        >
                          ✕
                        </button>
                      </span>
                    </div>
                  )
                }

                return (
                  <div
                    key={option}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    className={`taxonomy-multi-select__option${isSelected ? ' is-selected' : ''}`}
                    onClick={() => {
                      if (!isConfirmingDelete) {
                        handleToggleOption(option)
                      }
                    }}
                    onKeyDown={(event) => {
                      if ((event.key === 'Enter' || event.key === ' ') && !isConfirmingDelete) {
                        event.preventDefault()
                        handleToggleOption(option)
                      }
                    }}
                  >
                    <span>{option}</span>
                    <span className="taxonomy-multi-select__option-trail">
                      {isSelected && !isConfirmingDelete ? (
                        <svg className="taxonomy-multi-select__check-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      ) : null}

                      {isConfirmingDelete ? (
                        <span className="taxonomy-multi-select__confirm-box" onClick={(e) => e.stopPropagation()}>
                          <span className="taxonomy-multi-select__confirm-text">确定删除？</span>
                          <button
                            type="button"
                            className="taxonomy-multi-select__confirm-btn taxonomy-multi-select__confirm-btn--danger"
                            aria-label={`确认删除${label} ${option}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDelete(option)
                              setConfirmingDeleteOption(null)
                            }}
                          >
                            确定
                          </button>
                          <button
                            type="button"
                            className="taxonomy-multi-select__confirm-btn"
                            aria-label={`取消删除${label} ${option}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setConfirmingDeleteOption(null)
                            }}
                          >
                            取消
                          </button>
                        </span>
                      ) : hasManageActions ? (
                        <span className="taxonomy-multi-select__option-actions">
                          {onRenameOption ? (
                            <button
                              type="button"
                              className="taxonomy-multi-select__action-btn"
                              aria-label={`编辑${label} ${option}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleStartEdit(option)
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
                              aria-label={`删除${label} ${option}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                setConfirmingDeleteOption(option)
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
                    </span>
                  </div>
                )
              })}
            </div>
          ) : null}

          {canCreate() ? (
            <button
              type="button"
              className="taxonomy-multi-select__create-btn"
              aria-label={`新建${label} ${query.trim()}`}
              onClick={handleCreate}
            >
              ＋ 新建「{query.trim()}」
            </button>
          ) : null}

          {!hasIndexedOptions && onCreateOption && !canCreate() ? (
            <p className="taxonomy-multi-select__status">暂无已索引的{label}。输入名称可新建。</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
}
