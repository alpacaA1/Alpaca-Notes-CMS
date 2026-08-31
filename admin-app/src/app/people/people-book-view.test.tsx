import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PeopleBookView from './people-book-view'
import type { PersonEntry } from './people-types'

const person: PersonEntry = {
  id: 'person-lin', name: '林夏', aliases: [], relationship: '朋友', tags: [], birthday: '', notes: '', moments: [],
  createdAt: '2026-08-31T08:00:00.000Z', updatedAt: '2026-08-31T08:00:00.000Z',
}

describe('PeopleBookView', () => {
  afterEach(() => cleanup())

  it('grows the expanded notes canvas and follows the caret below the visible edge', async () => {
    render(<PeopleBookView people={[person]} search="" isLoading={false} isSaving={false} mentionCounts={{}} selectedPersonId={person.id} onAdd={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} />)

    fireEvent.click(await screen.findByTitle('展开输入'))
    const canvas = document.querySelector<HTMLElement>('.people-book__notes-canvas')!
    const textarea = screen.getByPlaceholderText('想记住的习惯、近况、共同经历……') as HTMLTextAreaElement
    let scrollTop = 0
    Object.defineProperties(canvas, {
      clientHeight: { configurable: true, value: 400 },
      scrollTop: { configurable: true, get: () => scrollTop, set: (value) => { scrollTop = value } },
    })
    Object.defineProperties(textarea, {
      scrollHeight: { configurable: true, value: 760 },
      offsetTop: { configurable: true, value: 140 },
      offsetHeight: { configurable: true, value: 760 },
    })

    fireEvent.change(textarea, { target: { value: '写到画布底部后的下一行' } })

    expect(textarea.style.height).toBe('760px')
    expect(scrollTop).toBe(524)
  })
})
