import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PeopleBookView from './people-book-view'
import type { PersonEntry } from './people-types'

const person: PersonEntry = {
  id: 'person-lin',
  name: '林夏',
  aliases: [],
  relationship: '朋友',
  tags: [],
  birthday: '1997-09-28',
  notes: '- 第一项',
  moments: [],
  createdAt: '2026-08-31T08:00:00.000Z',
  updatedAt: '2026-08-31T08:00:00.000Z',
}

describe('PeopleBookView', () => {
  afterEach(() => cleanup())

  it('uses the article markdown editor in expanded notes', async () => {
    render(<PeopleBookView people={[person]} search="" isLoading={false} isSaving={false} mentionCounts={{}} selectedPersonId={person.id} onAdd={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(await screen.findByTitle('展开输入'))
    const textarea = screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(textarea.value.length, textarea.value.length)
    fireEvent.keyDown(textarea, { key: 'Enter' })

    expect(textarea.value).toBe('- 第一项\n- ')
    expect(screen.getByRole('toolbar', { name: '文章格式工具栏' })).toBeTruthy()
  })

  it('opens a birthday calendar card from the person profile', async () => {
    render(<PeopleBookView people={[person]} search="" isLoading={false} isSaving={false} mentionCounts={{}} selectedPersonId={person.id} onAdd={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(await screen.findByLabelText('选择生日'))

    expect(screen.getByRole('dialog', { name: '选择生日' })).toBeTruthy()
    expect(screen.getByText('1997 年 9 月')).toBeTruthy()
  })

  it('adds a structured moment, automatically saves, and displays happened, feeling, uncertain fields', async () => {
    const handleSave = vi.fn()
    render(<PeopleBookView people={[person]} search="" isLoading={false} isSaving={false} mentionCounts={{}} selectedPersonId={person.id} onAdd={vi.fn()} onSave={handleSave} onDelete={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/发生了什么/), { target: { value: '工作时很安静，下班后很健谈' } })
    fireEvent.change(screen.getByLabelText(/我的感受/), { target: { value: '感觉有了更真实的了解' } })
    fireEvent.change(screen.getByLabelText(/我还不确定的/), { target: { value: '是否不喜欢公私交叉' } })

    fireEvent.click(screen.getByRole('button', { name: '记下瞬间' }))

    expect(screen.getByText('工作时很安静，下班后很健谈')).toBeTruthy()
    expect(screen.getByText('感觉有了更真实的了解')).toBeTruthy()
    expect(screen.getByText('是否不喜欢公私交叉')).toBeTruthy()
    expect(screen.getByRole('button', { name: /纳入当前认识/ })).toBeTruthy()
    expect(handleSave).toHaveBeenCalled()
  })

  it('supports fast input mode and split into 3 parts', async () => {
    const handleSave = vi.fn()
    render(<PeopleBookView people={[person]} search="" isLoading={false} isSaving={false} mentionCounts={{}} selectedPersonId={person.id} onAdd={vi.fn()} onSave={handleSave} onDelete={vi.fn()} />)

    // 点击切换为速记
    fireEvent.click(screen.getByRole('tab', { name: '速记' }))

    const fastInput = screen.getByPlaceholderText('她今天下班后突然又变得很活泼……')
    fireEvent.change(fastInput, { target: { value: '今天下班后又聊了很久。我觉得彼此开始更自在了。不知道她平时周末喜欢做什么。' } })

    // 智能拆解
    fireEvent.click(screen.getByRole('button', { name: '✨ 整理为三段记录' }))

    expect((screen.getByLabelText(/发生了什么/) as HTMLTextAreaElement).value).toBe('今天下班后又聊了很久。')
    expect((screen.getByLabelText(/我的感受/) as HTMLInputElement).value).toBe('我觉得彼此开始更自在了。')
    expect((screen.getByLabelText(/我还不确定的/) as HTMLInputElement).value).toBe('不知道她平时周末喜欢做什么。')

    fireEvent.click(screen.getByRole('button', { name: '记下瞬间' }))
    expect(handleSave).toHaveBeenCalled()
  })

  it('incorporates a moment into current understanding notes and immediately saves', async () => {
    const handleSave = vi.fn()
    render(<PeopleBookView people={[person]} search="" isLoading={false} isSaving={false} mentionCounts={{}} selectedPersonId={person.id} onAdd={vi.fn()} onSave={handleSave} onDelete={vi.fn()} />)

    fireEvent.change(screen.getByLabelText(/发生了什么/), { target: { value: '下班后互动明显变多' } })
    fireEvent.click(screen.getByRole('button', { name: '记下瞬间' }))

    // 点击纳入当前认识
    fireEvent.click(screen.getByRole('button', { name: /纳入当前认识/ }))

    // 弹出提炼确认框
    expect(screen.getByText('提炼并追加至「我目前认识到的他 / 她」：')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认纳入' }))

    // 验证顶部认识已追加
    expect(screen.getByText(/- 第一项\s+- 下班后互动明显变多/)).toBeTruthy()
    // 验证卡片状态更新为已纳入
    expect(screen.getByText('已沉淀至当前认识 ✓')).toBeTruthy()
    expect(handleSave).toHaveBeenCalled()
  })

  it('gracefully renders legacy moments with content field and mentions count copy', async () => {
    const personWithLegacyMoment: PersonEntry = {
      ...person,
      moments: [{
        id: 'legacy-m-1',
        date: '2026-08-30',
        content: '旧数据单条日常记录',
        createdAt: '2026-08-30T10:00:00.000Z',
      } as any],
    }

    render(<PeopleBookView people={[personWithLegacyMoment]} search="" isLoading={false} isSaving={false} mentionCounts={{ [person.id]: 3 }} selectedPersonId={person.id} onAdd={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />)

    expect(screen.getByText('旧数据单条日常记录')).toBeTruthy()
    expect(screen.getAllByText('发生了什么').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('被 3 篇文章提及')).toBeTruthy()
  })
})
