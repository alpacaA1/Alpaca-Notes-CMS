import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FilterSelect, { type FilterSelectOption } from './filter-select'

const appStyles = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8')

type RenderControlOptions = {
  label?: string
  initialValue?: string
  options?: FilterSelectOption[]
  searchable?: boolean
}

function renderControl({
  label = '分类',
  initialValue = '',
  options = [
    { value: '', label: '全部分类' },
    { value: 'professional', label: '专业' },
    { value: 'thinking', label: '思考' },
  ],
  searchable = true,
}: RenderControlOptions = {}) {
  const onChange = vi.fn()

  function Harness() {
    const [value, setValue] = useState(initialValue)

    return (
      <FilterSelect
        label={label}
        value={value}
        options={options}
        searchable={searchable}
        onChange={(nextValue) => {
          onChange(nextValue)
          setValue(nextValue)
        }}
      />
    )
  }

  render(<Harness />)

  return { onChange }
}

describe('filter select', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('uses explicit button/listbox/option semantics and reflects the current selection', () => {
    renderControl()

    const trigger = screen.getByRole('button', { name: '筛选分类' })

    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByText('全部分类')).toBeTruthy()

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText('搜索分类')).toBeTruthy()
    expect(screen.getByRole('listbox', { name: '分类选项' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '全部分类' }).getAttribute('aria-selected')).toBe('true')
  })

  it('filters options, selects a new value, closes the panel, and updates the trigger text', () => {
    const { onChange } = renderControl()

    fireEvent.click(screen.getByRole('button', { name: '筛选分类' }))
    fireEvent.change(screen.getByLabelText('搜索分类'), { target: { value: '思' } })

    expect(screen.getByRole('option', { name: '思考' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: '专业' })).toBeNull()

    fireEvent.click(screen.getByRole('option', { name: '思考' }))

    expect(onChange).toHaveBeenCalledWith('thinking')
    expect(screen.queryByRole('listbox', { name: '分类选项' })).toBeNull()
    expect(screen.getByText('思考')).toBeTruthy()
  })

  it('shows an empty state when search has no matches and closes on escape', () => {
    renderControl()

    fireEvent.click(screen.getByRole('button', { name: '筛选分类' }))
    fireEvent.change(screen.getByLabelText('搜索分类'), { target: { value: '不存在的分类' } })

    expect(screen.getByText('没有找到匹配的分类。')).toBeTruthy()
    expect(screen.queryByRole('listbox', { name: '分类选项' })).toBeNull()

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' })

    expect(screen.queryByText('没有找到匹配的分类。')).toBeNull()
  })

  it('uses a floating overlay panel instead of expanding the document flow', () => {
    expect(appStyles).toMatch(/\.filter-select\s*\{[^}]*position:\s*relative;/s)
    expect(appStyles).toMatch(/\.filter-select\.is-open\s*\{[^}]*z-index:\s*12;/s)
    expect(appStyles).toMatch(/\.filter-select__panel\s*\{[^}]*position:\s*absolute;[^}]*top:\s*calc\(100%\s*\+\s*8px\);[^}]*left:\s*0;[^}]*right:\s*0;/s)
    expect(appStyles).toMatch(/\.filter-select__panel\s*\{[^}]*z-index:\s*60;/s)
    expect(appStyles).toMatch(/\.filter-select__panel\s*\{[^}]*box-shadow:[^;]*0 18px 36px rgba\(36, 24, 10, 0\.14\)/s)
  })
})
