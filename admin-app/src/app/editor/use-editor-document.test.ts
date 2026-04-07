import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createNewPost } from '../posts/new-post'
import type { ParsedPost } from '../posts/parse-post'
import { useEditorDocument } from './use-editor-document'

function createExistingPost(): ParsedPost {
  return {
    path: 'source/_posts/existing.md',
    sha: 'sha-existing',
    hasExplicitPublished: true,
    hasExplicitPermalink: true,
    frontmatter: {
      title: 'Existing post',
      date: '2026-04-03 12:00:00',
      desc: 'Existing desc',
      published: true,
      categories: ['专业'],
      tags: ['产品'],
      permalink: 'existing-post/',
    },
    body: 'Existing body',
  }
}

describe('useEditorDocument', () => {
  it('maintains canonical state and dirty tracking', () => {
    const { result } = renderHook(() => useEditorDocument(createExistingPost()))

    expect(result.current.document?.body).toBe('Existing body')
    expect(result.current.isDirty).toBe(false)

    act(() => {
      result.current.updateBody('Updated body')
    })

    expect(result.current.document?.body).toBe('Updated body')
    expect(result.current.isDirty).toBe(true)
  })

  it('supports mode switching and unsupported rich-mode fallback flag', () => {
    const { result } = renderHook(() => useEditorDocument(createExistingPost()))

    act(() => {
      result.current.setMode('rich')
      result.current.setHasUnsupportedRichContent(true)
    })

    expect(result.current.mode).toBe('rich')
    expect(result.current.hasUnsupportedRichContent).toBe(true)
  })

  it('enforces publish lock for already-published posts', () => {
    const { result } = renderHook(() => useEditorDocument(createExistingPost()))

    expect(result.current.publishLocked).toBe(true)

    act(() => {
      result.current.updateFrontmatter('published', false)
    })

    expect(result.current.document?.frontmatter.published).toBe(true)
  })

  it('blocks navigation while dirty and clears warning after save', () => {
    const { result } = renderHook(() => useEditorDocument(createExistingPost()))

    expect(result.current.canNavigateAway).toBe(true)

    act(() => {
      result.current.updateBody('Changed body')
    })

    expect(result.current.canNavigateAway).toBe(false)

    act(() => {
      result.current.markSaved()
    })

    expect(result.current.canNavigateAway).toBe(true)
    expect(result.current.isDirty).toBe(false)
  })

  it('supports switching to another post or starting a new post', () => {
    const { result } = renderHook(() => useEditorDocument(createExistingPost()))

    act(() => {
      result.current.updateBody('Changed body')
    })

    expect(result.current.canNavigateAway).toBe(false)

    const nextPost = createNewPost(new Date(2026, 3, 4, 10, 11, 12))
    act(() => {
      result.current.replaceDocument(nextPost)
    })

    expect(result.current.document?.path).toBe('source/_posts/20260404101112.md')
    expect(result.current.document?.frontmatter.published).toBe(false)
    expect(result.current.isDirty).toBe(false)
  })
})
