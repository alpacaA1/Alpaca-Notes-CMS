import { useId, useMemo, useState } from 'react'

type TaxonomyMultiSelectProps = {
  label: '分类' | '标签'
  value: string[]
  availableOptions: string[]
  onChange: (value: string[]) => void
}

function uniqueValues(values: string[]) {
  return values.filter((value, index) => values.indexOf(value) === index)
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
}: TaxonomyMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const listboxId = useId()
  const searchLabel = `搜索${label}`
  const triggerLabel = `选择${label}`
  const listboxLabel = `${label}选项`
  const indexedOptions = useMemo(() => uniqueValues(availableOptions), [availableOptions])
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) {
      return indexedOptions
    }

    return indexedOptions.filter((option) => option.toLocaleLowerCase().includes(normalizedQuery))
  }, [indexedOptions, normalizedQuery])
  const hasIndexedOptions = indexedOptions.length > 0
  const hasFilteredOptions = filteredOptions.length > 0
  const showSearch = hasIndexedOptions
  const showListbox = hasIndexedOptions && hasFilteredOptions
  const statusMessage = !hasIndexedOptions
    ? `暂无已索引的${label}。`
    : !hasFilteredOptions
      ? `没有找到匹配的${label}。`
      : null

  function handleToggleOption(option: string) {
    onChange(toggleValue(value, option))
  }

  function handleToggleOpen() {
    setIsOpen((currentValue) => {
      if (currentValue) {
        setQuery('')
      }

      return !currentValue
    })
  }

  return (
    <div className="taxonomy-multi-select">
      {value.length ? (
        <div className="taxonomy-multi-select__chip-group" aria-label={`已选${label}`}>
          {value.map((selectedValue) => (
            <button
              key={selectedValue}
              type="button"
              className="taxonomy-multi-select__chip taxonomy-multi-select__chip--selected"
              aria-label={`移除${label} ${selectedValue}`}
              onClick={() => onChange(value.filter((item) => item !== selectedValue))}
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
                value={query}
                placeholder={`筛选${label}`}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
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
                const isSelected = value.includes(option)

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
                    {isSelected ? <span aria-hidden="true">已选</span> : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
