import { useId, useMemo, useRef, useState } from 'react'

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
  const editInputRef = useRef<HTMLInputElement>(null)
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
      }

      return !currentValue
    })
  }

  function handleStartEdit(option: string) {
    setEditingOption(option)
    setEditingValue(option)
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

  return (
    <div className="taxonomy-multi-select">
      {normalizedValue.length ? (
        <div className="taxonomy-multi-select__chip-group" aria-label={`已选${label}`}>
          {normalizedValue.map((selectedValue) => (
            <button
              key={selectedValue}
              type="button"
              className="taxonomy-multi-select__chip taxonomy-multi-select__chip--selected"
              aria-label={`移除${label} ${selectedValue}`}
              onClick={() => onChange(normalizedValue.filter((item) => item !== selectedValue))}
            >
              <span>{selectedValue}</span>
              <span aria-hidden="true">移除</span>
            </button>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className="taxonomy-multi-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={handleToggleOpen}
      >
        {triggerLabel}
      </button>

      {isOpen ? (
        <div className="taxonomy-multi-select__panel">
          {showSearch ? (
            <label className="taxonomy-multi-select__search">
              <span className="taxonomy-multi-select__search-label">{searchLabel}</span>
              <input
                aria-label={searchLabel}
                autoFocus
                value={query}
                placeholder={`筛选${label}`}
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
                    onClick={() => handleToggleOption(option)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        handleToggleOption(option)
                      }
                    }}
                  >
                    <span>{option}</span>
                    <span className="taxonomy-multi-select__option-trail">
                      {isSelected ? <span aria-hidden="true">已选</span> : null}
                      {hasManageActions ? (
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
                              ✎
                            </button>
                          ) : null}
                          {onDeleteOption ? (
                            <button
                              type="button"
                              className="taxonomy-multi-select__action-btn taxonomy-multi-select__action-btn--danger"
                              aria-label={`删除${label} ${option}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleDelete(option)
                              }}
                            >
                              ✕
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
