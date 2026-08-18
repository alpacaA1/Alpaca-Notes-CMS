import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TaxonomyMultiSelect from './taxonomy-multi-select'

const appStyles = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8')

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

  it('filters, selects multiple options, and deselects from the dropdown', () => {
    const { onChange } = renderControl({ availableOptions: ['专业', '思考', '记录'] })
    const trigger = screen.getByRole('button', { name: '选择分类' })

    fireEvent.click(trigger)
    fireEvent.change(screen.getByLabelText('搜索分类'), { target: { value: '思' } })

    expect(screen.getByRole('option', { name: '思考' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: '专业' })).toBe(null)

    fireEvent.click(screen.getByRole('option', { name: '思考' }))
    expect(onChange).toHaveBeenNthCalledWith(1, ['思考'])
    expect(trigger.textContent).toBe('思考')

    fireEvent.change(screen.getByLabelText('搜索分类'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('option', { name: '专业' }))

    expect(onChange).toHaveBeenNthCalledWith(2, ['思考', '专业'])
    expect(trigger.textContent).toBe('思考, 专业')

    fireEvent.click(screen.getByRole('option', { name: '专业' }))
    expect(onChange).toHaveBeenNthCalledWith(3, ['思考'])
    expect(trigger.textContent).toBe('思考')

    fireEvent.click(screen.getByRole('option', { name: '思考' }))
    expect(onChange).toHaveBeenNthCalledWith(4, [])
    expect(trigger.textContent).toBe('选择分类')
  })

  it('shows empty indexed state without search or listbox when available options are empty', () => {
    renderControl({ initialValue: ['既有分类'], availableOptions: [] })
    const trigger = screen.getByRole('button', { name: '选择分类' })
    expect(trigger.textContent).toBe('既有分类')

    fireEvent.click(trigger)

    expect(screen.getByText('暂无已索引的分类。')).toBeTruthy()
    expect(screen.queryByLabelText('搜索分类')).toBe(null)
    expect(screen.queryByRole('listbox', { name: '分类选项' })).toBe(null)
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
  })

  it('filters out blank taxonomy options, normalizes quoted values, and auto-focuses search when opened', () => {
    renderControl({ availableOptions: ['  "专业"   ', '', '   ', '""', "''", " '思考'   "] })

    fireEvent.click(screen.getByRole('button', { name: '选择分类' }))

    const searchInput = screen.getByLabelText('搜索分类')
    expect(document.activeElement).toBe(searchInput)
    expect(screen.getAllByRole('option').map((option) => option.textContent?.trim())).toEqual(['专业', '思考'])
  })

  it('normalizes already selected taxonomy values and matches options against the normalized values', () => {
    renderControl({ initialValue: ['  "专业"   ', " '思考'   "], availableOptions: ['专业', '思考'] })

    const trigger = screen.getByRole('button', { name: '选择分类' })
    expect(trigger.textContent).toBe('专业, 思考')

    fireEvent.click(trigger)

    expect(screen.getByRole('option', { name: '专业' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('option', { name: '思考' }).getAttribute('aria-selected')).toBe('true')
  })

  it('requires secondary confirmation before calling onDeleteOption', () => {
    const onDeleteOption = vi.fn()
    render(
      <TaxonomyMultiSelect
        label="分类"
        value={[]}
        availableOptions={['前端']}
        onChange={vi.fn()}
        onDeleteOption={onDeleteOption}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '选择分类' }))

    const deleteBtn = screen.getByRole('button', { name: '删除分类 前端' })
    fireEvent.click(deleteBtn)

    expect(onDeleteOption).not.toHaveBeenCalled()
    expect(screen.getByText('确定删除？')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '取消删除分类 前端' }))
    expect(screen.queryByText('确定删除？')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '删除分类 前端' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除分类 前端' }))
    expect(onDeleteOption).toHaveBeenCalledWith('前端')
  })

  it('marks selected options by state class without a check-icon svg', () => {
    renderControl({ initialValue: ['专业'], availableOptions: ['专业', '思考'] })
    fireEvent.click(screen.getByRole('button', { name: '选择分类' }))

    const selectedOption = screen.getByRole('option', { name: '专业' })
    expect(selectedOption.className).toContain('is-selected')
    expect(selectedOption.querySelector('.taxonomy-multi-select__check-icon')).toBeNull()

    const unselectedOption = screen.getByRole('option', { name: '思考' })
    expect(unselectedOption.className).not.toContain('is-selected')
    expect(unselectedOption.querySelector('.taxonomy-multi-select__check-icon')).toBeNull()
  })
})
