import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuickPitchModal } from './quick-pitch-modal'

describe('QuickPitchModal', () => {
  afterEach(() => {
    cleanup()
  })
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <QuickPitchModal isOpen={false} onClose={vi.fn()} onSave={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders modal when isOpen is true and submits form', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined)
    const handleClose = vi.fn()

    render(
      <QuickPitchModal
        isOpen={true}
        defaultStatus="collecting"
        onClose={handleClose}
        onSave={handleSave}
      />,
    )

    expect(screen.getByText('快速记录灵感')).toBeTruthy()

    // Title input
    const textarea = screen.getByPlaceholderText('一两句话记录你的灵感与想法…')
    fireEvent.change(textarea, { target: { value: '构建双链笔记系统' } })

    // Inspiration input
    const inspirationInput = screen.getByPlaceholderText('例如：看《某本书》第3章、某条推文、散步时的感触')
    fireEvent.change(inspirationInput, { target: { value: '看 Roam Research 论文' } })

    // Submit
    const submitBtn = screen.getByRole('button', { name: '保存灵感' })
    fireEvent.click(submitBtn)

    expect(handleSave).toHaveBeenCalledWith({
      title: '构建双链笔记系统',
      inspiration: '看 Roam Research 论文',
      tags: undefined,
      pitchStatus: 'collecting',
      openInEditor: false,
    })
  })

  it('validates empty title before saving', () => {
    const handleSave = vi.fn()
    render(<QuickPitchModal isOpen={true} onClose={vi.fn()} onSave={handleSave} />)

    const submitBtn = screen.getByRole('button', { name: '保存灵感' })
    fireEvent.click(submitBtn)

    expect(screen.getByText('请输入灵感想法或标题')).toBeTruthy()
    expect(handleSave).not.toHaveBeenCalled()
  })

  it('supports Cmd+Enter shortcut to save', () => {
    const handleSave = vi.fn().mockResolvedValue(undefined)
    render(<QuickPitchModal isOpen={true} onClose={vi.fn()} onSave={handleSave} />)

    const textarea = screen.getByPlaceholderText('一两句话记录你的灵感与想法…')
    fireEvent.change(textarea, { target: { value: '快捷键测试灵感' } })

    fireEvent.keyDown(window, { key: 'Enter', metaKey: true })

    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '快捷键测试灵感',
      }),
    )
  })
})
