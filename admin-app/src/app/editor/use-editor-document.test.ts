import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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

  it('supports switching between markdown and preview modes', () => {
    const { result } = renderHook(() => useEditorDocument(createExistingPost()))

    act(() => {
      result.current.setMode('preview')
    })

    expect(result.current.mode).toBe('preview')

    act(() => {
      result.current.setMode('markdown')
    })

    expect(result.current.mode).toBe('markdown')
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

  it('supports switching to another post or starting a new post and resets mode to markdown', () => {
    const { result } = renderHook(() => useEditorDocument(createExistingPost()))

    act(() => {
      result.current.setMode('preview')
      result.current.updateBody('Changed body')
    })

    expect(result.current.mode).toBe('preview')
    expect(result.current.canNavigateAway).toBe(false)

    const nextPost = createNewPost(new Date(2026, 3, 4, 10, 11, 12))
    act(() => {
      result.current.replaceDocument(nextPost)
    })

    expect(result.current.mode).toBe('markdown')
    expect(result.current.document?.path).toBe('source/_posts/20260404101112.md')
    expect(result.current.document?.frontmatter.published).toBe(false)
    expect(result.current.isDirty).toBe(false)
  })

  it('treats reverting frontmatter arrays back to their saved values as clean', () => {
    const { result } = renderHook(() => useEditorDocument(createExistingPost()))

    act(() => {
      result.current.updateFrontmatter('categories', ['专业', '新分类'])
    })

    expect(result.current.isDirty).toBe(true)

    act(() => {
      result.current.updateFrontmatter('categories', ['专业'])
    })

    expect(result.current.isDirty).toBe(false)
    expect(result.current.canNavigateAway).toBe(true)
  })

  it('does not rely on JSON.stringify for dirty tracking', () => {
    const originalJsonStringify = JSON.stringify
    const stringifySpy = vi.fn(originalJsonStringify)
    JSON.stringify = stringifySpy

    try {
      renderHook(() => useEditorDocument(createExistingPost()))
      expect(stringifySpy).not.toHaveBeenCalled()
    } finally {
      JSON.stringify = originalJsonStringify
    }
  })
})
