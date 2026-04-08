import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaxonomyMultiSelect from './taxonomy-multi-select'

type RenderControlOptions = {
  label?: '分类' | '标签'
  initialValue?: string[]
  availableOptions?: string[]
}

function renderControl({
  label = '分类',
  initialValue = [],
  availableOptions = ['专业', '思考', '记录'],
}: RenderControlOptions = {}) {
  const onChange = vi.fn()

  function Harness() {
    const [value, setValue] = useState(initialValue)

    return (
      <TaxonomyMultiSelect
        label={label}
        value={value}
        availableOptions={availableOptions}
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

describe('taxonomy multi select', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it.each(['分类', '标签'] as const)('uses explicit button/listbox/option semantics for %s', (label) => {
    renderControl({ label, availableOptions: ['专业', '思考'] })

    const trigger = screen.getByRole('button', { name: `选择${label}` })

    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(trigger)

    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByLabelText(`搜索${label}`)).toBeTruthy()

    const listbox = screen.getByRole('listbox', { name: `${label}选项` })
    expect(listbox.getAttribute('aria-multiselectable')).toBe('true')

    const option = screen.getByRole('option', { name: '专业' })
    expect(option.getAttribute('aria-selected')).toBe('false')
  })

  it('filters, selects multiple options, deselects from the dropdown, and removes selected chips', () => {
    const { onChange } = renderControl({ availableOptions: ['专业', '思考', '记录'] })

    fireEvent.click(screen.getByRole('button', { name: '选择分类' }))
    fireEvent.change(screen.getByLabelText('搜索分类'), { target: { value: '思' } })

    expect(screen.getByRole('option', { name: '思考' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: '专业' })).toBe(null)

    fireEvent.click(screen.getByRole('option', { name: '思考' }))
    expect(onChange).toHaveBeenNthCalledWith(1, ['思考'])

    fireEvent.change(screen.getByLabelText('搜索分类'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('option', { name: '专业' }))

    expect(onChange).toHaveBeenNthCalledWith(2, ['思考', '专业'])
    expect(screen.getByRole('button', { name: '移除分类 思考' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '移除分类 专业' })).toBeTruthy()

    fireEvent.click(screen.getByRole('option', { name: '专业' }))
    expect(onChange).toHaveBeenNthCalledWith(3, ['思考'])
    expect(screen.queryByRole('button', { name: '移除分类 专业' })).toBe(null)

    fireEvent.click(screen.getByRole('button', { name: '移除分类 思考' }))
    expect(onChange).toHaveBeenNthCalledWith(4, [])
    expect(screen.queryByRole('button', { name: '移除分类 思考' })).toBe(null)
  })

  it('shows empty indexed state without search or listbox and keeps selected chips visible when available options are empty', () => {
    const { onChange } = renderControl({ initialValue: ['既有分类'], availableOptions: [] })

    expect(screen.getByRole('button', { name: '移除分类 既有分类' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '选择分类' }))

    expect(screen.getByText('暂无已索引的分类。')).toBeTruthy()
    expect(screen.queryByLabelText('搜索分类')).toBe(null)
    expect(screen.queryByRole('listbox', { name: '分类选项' })).toBe(null)

    fireEvent.click(screen.getByRole('button', { name: '移除分类 既有分类' }))

    expect(onChange).toHaveBeenCalledWith([])
  })

  it('shows no-results state outside the listbox and never creates freeform options from search input', () => {
    const { onChange } = renderControl({ availableOptions: ['专业', '思考'] })

    fireEvent.click(screen.getByRole('button', { name: '选择分类' }))

    const searchInput = screen.getByLabelText('搜索分类')
    fireEvent.change(searchInput, { target: { value: '自定义分类' } })

    expect(screen.getByText('没有找到匹配的分类。')).toBeTruthy()
    expect(screen.queryByRole('listbox', { name: '分类选项' })).toBe(null)

    fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('option', { name: '自定义分类' })).toBe(null)
    expect(screen.queryByRole('button', { name: '移除分类 自定义分类' })).toBe(null)
  })
})
