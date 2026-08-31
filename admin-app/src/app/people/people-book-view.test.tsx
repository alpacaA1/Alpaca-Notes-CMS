import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PeopleBookView from './people-book-view'
import type { PersonEntry } from './people-types'

const person: PersonEntry = {
  id: 'person-lin', name: '林夏', aliases: [], relationship: '朋友', tags: [], birthday: '', notes: '- 第一项', moments: [],
  createdAt: '2026-08-31T08:00:00.000Z', updatedAt: '2026-08-31T08:00:00.000Z',
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
})
