import { useEffect, useMemo, useState } from 'react'
import type { ParsedPost } from '../posts/parse-post'
import { validatePostForSave } from '../posts/new-post'
import type { PostValidationErrors } from '../posts/post-types'

export type EditorMode = 'markdown' | 'preview'

function clonePost(post: ParsedPost): ParsedPost {
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

function samePost(left: ParsedPost | null, right: ParsedPost | null) {
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
    left.frontmatter.title === right.frontmatter.title &&
    left.frontmatter.date === right.frontmatter.date &&
    left.frontmatter.desc === right.frontmatter.desc &&
    left.frontmatter.published === right.frontmatter.published &&
    left.frontmatter.permalink === right.frontmatter.permalink &&
    sameStringArray(left.frontmatter.categories, right.frontmatter.categories) &&
    sameStringArray(left.frontmatter.tags, right.frontmatter.tags)
  )
}

export function useEditorDocument(initialPost: ParsedPost | null = null) {
  const [savedPost, setSavedPost] = useState<ParsedPost | null>(() =>
    initialPost ? clonePost(initialPost) : null,
  )
  const [draftPost, setDraftPost] = useState<ParsedPost | null>(() =>
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

  const replaceDocument = (post: ParsedPost | null) => {
    const nextPost = post ? clonePost(post) : null
    setSavedPost(nextPost)
    setDraftPost(nextPost ? clonePost(nextPost) : null)
    setMode('markdown')
    setValidationErrors({})
  }

  const updateFrontmatter = <K extends keyof ParsedPost['frontmatter']>(
    field: K,
    value: ParsedPost['frontmatter'][K],
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

  const markSaved = (post?: ParsedPost | null) => {
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
