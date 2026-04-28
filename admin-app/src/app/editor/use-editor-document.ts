import { useEffect, useMemo, useState } from 'react'
import type { ParsedPost } from '../posts/parse-post'
import { validatePostForSave } from '../posts/new-post'
import type { PostValidationErrors } from '../posts/post-types'

type EditableDocument = ParsedPost

export type EditorMode = 'markdown' | 'preview'

function clonePost(post: EditableDocument): EditableDocument {
  return {
    ...post,
    frontmatter: {
      ...post.frontmatter,
      categories: [...post.frontmatter.categories],
      tags: [...post.frontmatter.tags],
    },
  }
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function samePost(left: EditableDocument | null, right: EditableDocument | null) {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return (
    left.path === right.path &&
    left.sha === right.sha &&
    left.body === right.body &&
    left.hasExplicitPublished === right.hasExplicitPublished &&
    left.hasExplicitPermalink === right.hasExplicitPermalink &&
    left.contentType === right.contentType &&
    left.frontmatter.title === right.frontmatter.title &&
    left.frontmatter.date === right.frontmatter.date &&
    left.frontmatter.desc === right.frontmatter.desc &&
    left.frontmatter.published === right.frontmatter.published &&
    left.frontmatter.pinned === right.frontmatter.pinned &&
    left.frontmatter.permalink === right.frontmatter.permalink &&
    left.frontmatter.cover === right.frontmatter.cover &&
    left.frontmatter.external_url === right.frontmatter.external_url &&
    left.frontmatter.source_name === right.frontmatter.source_name &&
    left.frontmatter.reading_status === right.frontmatter.reading_status &&
    left.frontmatter.read_later === right.frontmatter.read_later &&
    left.frontmatter.nav_exclude === right.frontmatter.nav_exclude &&
    left.frontmatter.layout === right.frontmatter.layout &&
    sameStringArray(left.frontmatter.categories, right.frontmatter.categories) &&
    sameStringArray(left.frontmatter.tags, right.frontmatter.tags)
  )
}

export function useEditorDocument(initialPost: EditableDocument | null = null) {
  const [savedPost, setSavedPost] = useState<EditableDocument | null>(() =>
    initialPost ? clonePost(initialPost) : null,
  )
  const [draftPost, setDraftPost] = useState<EditableDocument | null>(() =>
    initialPost ? clonePost(initialPost) : null,
  )
  const [mode, setMode] = useState<EditorMode>('markdown')
  const [validationErrors, setValidationErrors] = useState<PostValidationErrors>({})

  const isDirty = useMemo(() => !samePost(savedPost, draftPost), [draftPost, savedPost])
  const publishLocked = Boolean(savedPost?.frontmatter.published)

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return
      }
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [isDirty])

  const replaceDocument = (post: EditableDocument | null) => {
    const nextPost = post ? clonePost(post) : null
    setSavedPost(nextPost)
    setDraftPost(nextPost ? clonePost(nextPost) : null)
    setMode('markdown')
    setValidationErrors({})
  }

  const updateFrontmatter = <K extends keyof EditableDocument['frontmatter']>(
    field: K,
    value: EditableDocument['frontmatter'][K],
  ) => {
    setDraftPost((currentPost) => {
      if (!currentPost) {
        return currentPost
      }

      if (field === 'published' && publishLocked && value === false) {
        return currentPost
      }

      return {
        ...currentPost,
        frontmatter: {
          ...currentPost.frontmatter,
          [field]: value,
        },
      }
    })
  }

  const updateBody = (body: string) => {
    setDraftPost((currentPost) => {
      if (!currentPost) {
        return currentPost
      }

      return {
        ...currentPost,
        body,
      }
    })
  }

  const validate = (options?: { isNewPost?: boolean }) => {
    if (!draftPost) {
      return {}
    }

    const nextErrors = validatePostForSave(draftPost, options)
    setValidationErrors(nextErrors)
    return nextErrors
  }

  const markSaved = (post?: EditableDocument | null) => {
    const nextSavedPost = post ? clonePost(post) : draftPost ? clonePost(draftPost) : null
    setSavedPost(nextSavedPost)
    setDraftPost(nextSavedPost ? clonePost(nextSavedPost) : null)
    setValidationErrors({})
  }

  const canNavigateAway = !isDirty

  return {
    document: draftPost,
    savedDocument: savedPost,
    mode,
    isDirty,
    publishLocked,
    validationErrors,
    canNavigateAway,
    setMode,
    replaceDocument,
    updateFrontmatter,
    updateBody,
    validate,
    markSaved,
  }
}
