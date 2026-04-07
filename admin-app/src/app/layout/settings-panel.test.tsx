import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsPanel from './settings-panel'
import { createNewPost } from '../posts/new-post'
import type { ParsedPost } from '../posts/parse-post'

function createExistingPost(): ParsedPost {
  return {
    path: 'source/_posts/existing.md',
    sha: 'sha-existing',
    hasExplicitPublished: true,
    hasExplicitPermalink: false,
    frontmatter: {
      title: 'Existing post',
      date: '2026-04-03 12:00:00',
      desc: 'Existing desc',
      published: true,
      categories: ['专业'],
      tags: ['产品'],
    },
    body: 'Existing body',
  }
}

describe('settings panel', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('edits title/date/desc/published/categories/tags/permalink', () => {
    const onFieldChange = vi.fn()
    render(
      <SettingsPanel
        document={createNewPost(new Date(2026, 3, 3, 10, 11, 12))}
        validationErrors={{}}
        publishLocked={false}
        onFieldChange={onFieldChange}
      />,
    )

    const textboxes = screen.getAllByRole('textbox')
    fireEvent.change(textboxes[0], { target: { value: 'New title' } })
    fireEvent.change(textboxes[1], {
      target: { value: '2026-04-03 10:12:13' },
    })
    fireEvent.change(textboxes[2], { target: { value: 'New desc' } })
    fireEvent.click(screen.getByRole('checkbox'))

    expect(onFieldChange).toHaveBeenCalled()
  })

  it('shows validation errors for required fields', () => {
    render(
      <SettingsPanel
        document={createNewPost(new Date(2026, 3, 3, 10, 11, 12))}
        validationErrors={{
          title: 'Title is required.',
          desc: 'Description is required.',
          permalink: 'Permalink is required before the first save.',
        }}
        publishLocked={false}
        onFieldChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Title is required.')).toBeTruthy()
    expect(screen.getByText('Description is required.')).toBeTruthy()
    expect(screen.getByText('Permalink is required before the first save.')).toBeTruthy()
  })

  it('keeps legacy permalink omission allowed for existing posts', () => {
    render(
      <SettingsPanel
        document={createExistingPost()}
        validationErrors={{}}
        publishLocked={true}
        onFieldChange={vi.fn()}
      />,
    )

    expect(screen.getByPlaceholderText('Leave empty for legacy posts')).toBeTruthy()
    expect(screen.getByRole('checkbox').hasAttribute('disabled')).toBe(true)
  })
})
