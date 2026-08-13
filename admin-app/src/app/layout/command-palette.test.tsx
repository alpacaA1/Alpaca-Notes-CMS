import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandPalette, type CommandPaletteOption } from './command-palette'

describe('CommandPalette', () => {
  beforeEach(() => {
    cleanup()
  })

  const options: CommandPaletteOption[] = [
    { id: '1', label: '新建文章', category: '操作', action: vi.fn() },
    { id: '2', label: '跳转待读', category: '导航', action: vi.fn() },
    { id: '3', label: '书架管理', category: '导航', action: vi.fn() },
  ]

  it('renders nothing when isOpen is false', () => {
    render(<CommandPalette isOpen={false} onClose={vi.fn()} options={options} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders dialog and options when isOpen is true', () => {
    render(<CommandPalette isOpen={true} onClose={vi.fn()} options={options} />)
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText('新建文章')).toBeTruthy()
    expect(screen.getByText('跳转待读')).toBeTruthy()
  })

  it('filters options by search query', () => {
    render(<CommandPalette isOpen={true} onClose={vi.fn()} options={options} />)
    const input = screen.getByPlaceholderText(/搜索文章/)
    fireEvent.change(input, { target: { value: '待读' } })
    expect(screen.queryByText('新建文章')).toBeNull()
    expect(screen.getByText('跳转待读')).toBeTruthy()
  })

  it('navigates options via keyboard and triggers action on Enter', () => {
    const onClose = vi.fn()
    render(<CommandPalette isOpen={true} onClose={onClose} options={options} />)

    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: 'Enter' })

    expect(options[1].action).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on Escape key press', () => {
    const onClose = vi.fn()
    render(<CommandPalette isOpen={true} onClose={onClose} options={options} />)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
