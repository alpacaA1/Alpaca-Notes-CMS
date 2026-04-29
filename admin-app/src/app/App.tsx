import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  batchUpdatePostContents,
  deleteMarkdownFile,
  fetchMarkdownFile,
  GitHubAuthError,
  GitHubConflictError,
  readCachedMarkdownFile,
  saveMarkdownFile,
  uploadImageFile,
} from './github-client'
import { buildImageMarkdown, buildImageUploadDescriptor } from './editor/image-upload'
import MarkdownEditor from './editor/markdown-editor'
import PreviewPane from './editor/preview-pane'
import { useEditorDocument } from './editor/use-editor-document'
import TopBar from './layout/top-bar'
import PostListPane from './layout/post-list-pane'
import PostDashboard from './layout/post-dashboard'
import SettingsPanel from './layout/settings-panel'
import ConfirmDialog from './layout/confirm-dialog'
import { getNextImmersiveMode } from './layout/immersive-mode'
import { useColorMode } from './layout/use-color-mode'
import LoginGate from './login-gate'
import { buildReadLaterIndex, parseReadLaterIndexItem } from './read-later/index-items'
import { createNewReadLaterItem } from './read-later/new-item'
import { importReadLaterFromUrl } from './read-later/import-client'
import { parseReadLaterItem } from './read-later/parse-item'
import { serializeReadLaterItem } from './read-later/serialize-item'
import type { ParsedReadLaterItem, ReadLaterAnnotation } from './read-later/item-types'
import { createNewPost } from './posts/new-post'
import { buildPostIndex, collectPostIndexFacets, filterPostIndex, parsePostIndexItem, sortPostIndex } from './posts/index-posts'
import { parsePost } from './posts/parse-post'
import type { ParsedPost } from './posts/parse-post'
import { serializePost } from './posts/serialize-post'
import type { PostIndexItem } from './posts/post-types'
import { findPostsWithTaxonomy, renameTaxonomyInContent, deleteTaxonomyFromContent } from './posts/taxonomy-operations'
import { AuthError, createSessionStore, loginWithPopup, readStoredSession } from './session'

type ContentType = 'post' | 'read-later'
type ReadLaterTab = 'info' | 'commentary'
type ReadLaterAnnotationAction = 'highlight' | 'note'
type ReadLaterAnnotationDraft = Pick<ReadLaterAnnotation, 'sectionKey' | 'quote' | 'prefix' | 'suffix'>
type TaxonomyType = 'categories' | 'tags'
type TaxonomyConfirmAction =
  | { kind: 'rename'; type: TaxonomyType; oldName: string; newName: string; affectedPaths: string[] }
  | { kind: 'delete'; type: TaxonomyType; name: string; affectedPaths: string[] }

type PostDeleteConfirmAction = {
  kind: 'delete-post'
  post: PostIndexItem
}

const SAVE_SUCCESS_MESSAGE = '已保存。'
const TAXONOMY_LABELS: Record<TaxonomyType, string> = { categories: '分类', tags: '标签' }

function createReadLaterAnnotationId() {
  return `annotation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <section className="hero-card">
      <div className="hero-card__grid" />
      <p className="eyebrow">写作后台</p>
      <h1>内容编辑台</h1>
      <p>请选择一篇文章开始编辑，或新建一篇草稿。</p>
      {error ? <p className="error-message">{error}</p> : null}
    </section>
  )
}

type AdminView = 'dashboard' | 'editor'

export default function App() {
  const sessionStore = useMemo(() => createSessionStore(readStoredSession()), [])
  const [session, setSession] = useState(() => sessionStore.getSession())
  const { isDark, toggle: toggleColorMode } = useColorMode()
  const [contentType, setContentType] = useState<ContentType>('post')
  const [posts, setPosts] = useState<PostIndexItem[]>([])
  const [activePostPath, setActivePostPath] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isImmersive, setIsImmersive] = useState(false)
  const [adminView, setAdminView] = useState<AdminView>('dashboard')
  const [isLoading, setIsLoading] = useState(false)
  const [isIndexing, setIsIndexing] = useState(false)
  const [isOpeningPost, setIsOpeningPost] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isImportingFromUrl, setIsImportingFromUrl] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [previewImageUrls, setPreviewImageUrls] = useState<Record<string, string>>({})
  const previewObjectUrlsRef = useRef<string[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [taxonomyConfirm, setTaxonomyConfirm] = useState<TaxonomyConfirmAction | null>(null)
  const [postDeleteConfirm, setPostDeleteConfirm] = useState<PostDeleteConfirmAction | null>(null)
  const [isBatchUpdating, setIsBatchUpdating] = useState(false)
  const [isDeletingPost, setIsDeletingPost] = useState(false)
  const [deletingPostPath, setDeletingPostPath] = useState<string | null>(null)
  const [isTogglingPinned, setIsTogglingPinned] = useState(false)
  const [togglingPinnedPostPath, setTogglingPinnedPostPath] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState('')
  const [readLaterTab, setReadLaterTab] = useState<ReadLaterTab>('info')
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [annotationScrollRequest, setAnnotationScrollRequest] = useState(0)
  const {
    document,
    mode,
    isDirty,
    publishLocked,
    validationErrors,
    canNavigateAway,
    setMode,
    replaceDocument,
    updateFrontmatter,
    updateBody,
    updateReadLaterAnnotations,
    validate,
    markSaved,
  } = useEditorDocument()

  const filteredPosts = useMemo(
    () =>
      filterPostIndex(posts, {
        query: search,
        publishState: 'all',
        category: null,
        tag: null,
        sort: 'date-desc',
      }),
    [posts, search],
  )
  const { categories: availableCategories, tags: availableTags } = useMemo(
    () => collectPostIndexFacets(posts),
    [posts],
  )
  const readLaterAnnotations = useMemo(
    () => (document?.contentType === 'read-later' ? (document.annotations || []) : []),
    [document],
  )

  useEffect(() => {
    setReadLaterTab('info')
    setActiveAnnotationId(null)
    setEditingAnnotationId(null)
    setAnnotationScrollRequest(0)
  }, [document?.path, document?.contentType])

  const revokePreviewObjectUrls = () => {
    if (typeof URL.revokeObjectURL === 'function') {
      previewObjectUrlsRef.current.forEach((objectUrl) => {
        URL.revokeObjectURL(objectUrl)
      })
    }
    previewObjectUrlsRef.current = []
  }

  const resetPreviewImageUrls = () => {
    revokePreviewObjectUrls()
    setPreviewImageUrls({})
  }

  useEffect(() => {
    return () => {
      revokePreviewObjectUrls()
    }
  }, [])

  useEffect(() => {
    if (!session) {
      setPosts([])
      setIsIndexing(false)
      setIsOpeningPost(false)
      return
    }

    let cancelled = false

    const loadPosts = async () => {
      setIsIndexing(true)

      try {
        const indexedPosts = contentType === 'read-later'
          ? await buildReadLaterIndex(session)
          : await buildPostIndex(session)
        if (!cancelled) {
          setPosts(indexedPosts)
        }
      } catch (caughtError) {
        if (cancelled) {
          return
        }

        if (caughtError instanceof GitHubAuthError) {
          handleAuthExpiry(caughtError.message)
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : contentType === 'read-later' ? '加载待读列表失败。' : '加载文章列表失败。')
      } finally {
        if (!cancelled) {
          setIsIndexing(false)
        }
      }
    }

    void loadPosts()

    return () => {
      cancelled = true
    }
  }, [contentType, session, sessionStore])

  const applyDocument = (nextPost: ParsedPost) => {
    resetPreviewImageUrls()
    replaceDocument(nextPost)
    setMode(nextPost.contentType === 'read-later' ? 'preview' : 'markdown')
    setActivePostPath(nextPost.path)
    setIsImmersive(false)
    setSuccessMessage(null)
    setError(null)
  }

  const confirmNavigation = () => {
    if (canNavigateAway) {
      return true
    }

    return window.confirm('当前有未保存的修改。确认丢弃并继续吗？')
  }

  const handleLogin = async () => {
    setIsLoading(true)
    setSuccessMessage(null)
    setError(null)

    try {
      const nextSession = await loginWithPopup()
      sessionStore.setSession(nextSession)
      setSession(nextSession)
    } catch (caughtError) {
      const message =
        caughtError instanceof AuthError ? caughtError.message : 'GitHub 授权失败。'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const resetWorkspace = () => {
    resetPreviewImageUrls()
    setPosts([])
    setActivePostPath(null)
    setIsOpeningPost(false)
    setSuccessMessage(null)
    replaceDocument(null)
    setIsImmersive(false)
    setAdminView('dashboard')
  }

  const handleAuthExpiry = (message: string) => {
    sessionStore.logout()
    setSession(null)
    resetWorkspace()
    setError(message)
  }

  const handleLogout = () => {
    sessionStore.logout()
    setSession(null)
    resetWorkspace()
    setError(null)
  }

  const handleNewPost = () => {
    if (!confirmNavigation()) {
      return
    }

    applyDocument(contentType === 'read-later' ? createNewReadLaterItem() : createNewPost())
    setAdminView('editor')
  }

  const handleOpenPost = async (post: PostIndexItem) => {
    if (!session || !confirmNavigation()) {
      return
    }

    const parseOpenedFile = (file: { path: string; sha: string; content: string }) =>
      contentType === 'read-later' ? parseReadLaterItem(file) : parsePost(file)

    setAdminView('editor')
    setSuccessMessage(null)
    setError(null)

    const cachedFile = readCachedMarkdownFile(post.path, post.sha)
    if (cachedFile) {
      setIsOpeningPost(false)
      applyDocument(parseOpenedFile(cachedFile))
      return
    }

    setIsOpeningPost(true)
    setActivePostPath(post.path)
    replaceDocument(null)

    try {
      const file = await fetchMarkdownFile(session, post.path)
      applyDocument(parseOpenedFile(file))
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : contentType === 'read-later' ? '打开待读失败。' : '打开文章失败。')
    } finally {
      setIsOpeningPost(false)
    }
  }

  const handleBackToDashboard = () => {
    if (!confirmNavigation()) {
      return
    }

    resetPreviewImageUrls()
    setActivePostPath(null)
    replaceDocument(null)
    setIsImmersive(false)
    setSuccessMessage(null)
    setError(null)
    setAdminView('dashboard')
  }

  const handleDeletePost = (post: PostIndexItem) => {
    if (isDeletingPost || isTogglingPinned) {
      return
    }

    if (document?.path === post.path && !canNavigateAway) {
      const shouldContinue = window.confirm('当前文章有未保存的修改。删除后无法恢复，确认继续吗？')
      if (!shouldContinue) {
        return
      }
    }

    setPostDeleteConfirm({ kind: 'delete-post', post })
  }

  const handleDeletePostConfirm = async () => {
    if (!session || !postDeleteConfirm || isDeletingPost) {
      return
    }

    const { post } = postDeleteConfirm
    setIsDeletingPost(true)
    setDeletingPostPath(post.path)
    setError(null)
    setSuccessMessage(null)

    try {
      await deleteMarkdownFile(session, {
        path: post.path,
        sha: post.sha,
      })

      setPosts((currentPosts) => currentPosts.filter((currentPost) => currentPost.path !== post.path))

      if (activePostPath === post.path) {
        resetPreviewImageUrls()
        setActivePostPath(null)
        replaceDocument(null)
        setIsOpeningPost(false)
        setIsImmersive(false)
        setAdminView('dashboard')
      }

      setSuccessMessage(`已删除《${post.title}》。`)
      setPostDeleteConfirm(null)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      if (caughtError instanceof GitHubConflictError) {
        setError(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : contentType === 'read-later' ? '删除待读失败。' : '删除文章失败。')
    } finally {
      setIsDeletingPost(false)
      setDeletingPostPath(null)
    }
  }

  const handleDeletePostCancel = () => {
    if (!isDeletingPost) {
      setPostDeleteConfirm(null)
    }
  }

  const handleTogglePinned = async (post: PostIndexItem) => {
    if (!session || contentType !== 'post' || isTogglingPinned) {
      return
    }

    if (document?.path === post.path && !canNavigateAway) {
      setSuccessMessage(null)
      setError('当前文章有未保存的修改，请先保存后再置顶。')
      return
    }

    setIsTogglingPinned(true)
    setTogglingPinnedPostPath(post.path)
    setError(null)
    setSuccessMessage(null)

    try {
      const file = readCachedMarkdownFile(post.path, post.sha) ?? await fetchMarkdownFile(session, post.path)
      const openedPost = parsePost(file)
      const savedContent = serializePost({
        ...openedPost,
        frontmatter: {
          ...openedPost.frontmatter,
          pinned: !openedPost.frontmatter.pinned,
        },
      })
      const savedFile = await saveMarkdownFile(session, {
        path: openedPost.path,
        sha: openedPost.sha || undefined,
        content: savedContent,
      })
      const savedDocument: ParsedPost = {
        ...openedPost,
        path: savedFile.path,
        sha: savedFile.sha,
        frontmatter: {
          ...openedPost.frontmatter,
          pinned: !openedPost.frontmatter.pinned,
        },
      }
      const savedPostIndexItem = parsePostIndexItem({
        path: savedFile.path,
        sha: savedFile.sha,
        content: savedContent,
      })

      setPosts((currentPosts) =>
        sortPostIndex(
          [
            ...currentPosts.filter((currentPost) => currentPost.path !== post.path && currentPost.path !== savedFile.path),
            savedPostIndexItem,
          ],
          'date-desc',
        ),
      )

      if (document?.path === post.path && canNavigateAway) {
        markSaved(savedDocument)
        setActivePostPath(savedFile.path)
      }

      setSuccessMessage(savedDocument.frontmatter.pinned ? `已置顶《${post.title}》。` : `已取消《${post.title}》的置顶。`)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      if (caughtError instanceof GitHubConflictError) {
        setError(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '更新文章置顶状态失败。')
    } finally {
      setIsTogglingPinned(false)
      setTogglingPinnedPostPath(null)
    }
  }

  const handleSave = async () => {
    if (!document || !session || isSaving) {
      return
    }

    const nextErrors = validate({ isNewPost: document.sha.length === 0 })
    if (Object.keys(nextErrors).length > 0) {
      return
    }

    setIsSaving(true)
    setSuccessMessage(null)
    setError(null)

    try {
      const content = contentType === 'read-later' ? serializeReadLaterItem(document as ParsedReadLaterItem) : serializePost(document)
      const savedFile = await saveMarkdownFile(session, {
        path: document.path,
        sha: document.sha || undefined,
        content,
      })
      const savedDocument: ParsedPost = {
        ...document,
        path: savedFile.path,
        sha: savedFile.sha,
      }
      const savedPostIndexItem = contentType === 'read-later'
        ? parseReadLaterIndexItem({
            path: savedFile.path,
            sha: savedFile.sha,
            content,
          })
        : parsePostIndexItem({
            path: savedFile.path,
            sha: savedFile.sha,
            content,
          })
      markSaved(savedDocument)
      setActivePostPath(savedFile.path)
      setPosts((currentPosts) =>
        sortPostIndex(
          [
            ...currentPosts.filter((post) => post.path !== document.path && post.path !== savedFile.path),
            savedPostIndexItem,
          ],
          'date-desc',
        ),
      )
      setSuccessMessage(SAVE_SUCCESS_MESSAGE)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      if (caughtError instanceof GitHubConflictError) {
        setError(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : contentType === 'read-later' ? '保存待读失败。' : '保存文章失败。')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTogglePreview = () => {
    if (!document || document.contentType === 'read-later') {
      return
    }

    setMode(mode === 'preview' ? 'markdown' : 'preview')
  }

  const clearSuccessMessageOnDirty = () => {
    if (successMessage) {
      setSuccessMessage(null)
    }
  }

  const handleFrontmatterChange: typeof updateFrontmatter = (...args) => {
    clearSuccessMessageOnDirty()
    return updateFrontmatter(...args)
  }

  const handleEditorChange = (value: string) => {
    clearSuccessMessageOnDirty()
    updateBody(value)
  }

  const handleReadLaterTabChange = (value: ReadLaterTab) => {
    setReadLaterTab(value)
    if (value !== 'commentary') {
      setEditingAnnotationId(null)
    }
  }

  const handleSelectAnnotation = (annotationId: string) => {
    setReadLaterTab('commentary')
    setActiveAnnotationId(annotationId)
    setEditingAnnotationId(null)
    setAnnotationScrollRequest((current) => current + 1)
  }

  const handleOpenAnnotationNote = (annotationId: string) => {
    setReadLaterTab('commentary')
    setActiveAnnotationId(annotationId)
    setEditingAnnotationId(annotationId)
    setAnnotationScrollRequest((current) => current + 1)
  }

  const handleDeleteAnnotation = (annotationId: string) => {
    clearSuccessMessageOnDirty()
    updateReadLaterAnnotations(readLaterAnnotations.filter((annotation) => annotation.id !== annotationId))
    setActiveAnnotationId(null)
    setEditingAnnotationId(null)
  }

  const handleSaveAnnotationNote = (annotationId: string, note: string) => {
    const nextAnnotations = readLaterAnnotations.map((annotation) =>
      annotation.id === annotationId
        ? {
            ...annotation,
            note,
            updatedAt: new Date().toISOString(),
          }
        : annotation,
    )

    clearSuccessMessageOnDirty()
    updateReadLaterAnnotations(nextAnnotations)
    setActiveAnnotationId(annotationId)
    setEditingAnnotationId(null)
  }

  const handleCreateReadLaterAnnotation = (
    draft: ReadLaterAnnotationDraft,
    action: ReadLaterAnnotationAction,
  ) => {
    if (!document || document.contentType !== 'read-later') {
      return
    }

    const timestamp = new Date().toISOString()
    const annotation: ReadLaterAnnotation = {
      id: createReadLaterAnnotationId(),
      quote: draft.quote,
      prefix: draft.prefix,
      suffix: draft.suffix,
      sectionKey: draft.sectionKey,
      note: '',
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    clearSuccessMessageOnDirty()
    updateReadLaterAnnotations([...readLaterAnnotations, annotation])
    setReadLaterTab('commentary')
    setActiveAnnotationId(annotation.id)
    setEditingAnnotationId(action === 'note' ? annotation.id : null)
    setAnnotationScrollRequest((current) => current + 1)
  }

  const handleUploadImage = async (file: File) => {
    if (!session) {
      throw new Error('GitHub 会话已过期，请重新登录。')
    }

    clearSuccessMessageOnDirty()
    setError(null)

    try {
      const descriptor = buildImageUploadDescriptor(file)
      await uploadImageFile(session, {
        path: descriptor.repoPath,
        file,
      })

      const objectUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null
      if (objectUrl) {
        previewObjectUrlsRef.current.push(objectUrl)
        setPreviewImageUrls((currentUrls) => ({
          ...currentUrls,
          [descriptor.publicUrl]: objectUrl,
        }))
      }

      return {
        markdown: buildImageMarkdown(descriptor.defaultAlt, descriptor.publicUrl),
        publicUrl: descriptor.publicUrl,
      }
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        throw caughtError
      }

      const message = caughtError instanceof Error ? caughtError.message : '上传图片失败。'
      setError(message)
      throw caughtError instanceof Error ? caughtError : new Error(message)
    }
  }

  const handleImportFromUrl = async () => {
    if (!session || !document || contentType !== 'read-later' || isImportingFromUrl) {
      return
    }

    const externalUrl = document.frontmatter.external_url?.trim() || ''
    if (!externalUrl) {
      setError('请先填写原文链接。')
      return
    }

    const currentBody = document.body.trim()
    const defaultBody = createNewReadLaterItem(new Date(document.frontmatter.date || Date.now())).body.trim()
    const hasAnnotations = (document.annotations || []).length > 0
    const shouldConfirmOverwrite = currentBody.length > 0 && currentBody !== defaultBody
    if (
      shouldConfirmOverwrite &&
      !window.confirm(hasAnnotations ? '当前正文和高亮批注将被导入内容覆盖，确认继续吗？' : '当前正文将被导入内容覆盖，确认继续吗？')
    ) {
      return
    }

    clearSuccessMessageOnDirty()
    setError(null)
    setIsImportingFromUrl(true)

    try {
      const imported = await importReadLaterFromUrl(session, externalUrl)
      updateBody(imported.markdown)
      updateReadLaterAnnotations([])
      setReadLaterTab('info')
      setActiveAnnotationId(null)
      setEditingAnnotationId(null)

      if (!document.frontmatter.title.trim() && imported.title) {
        updateFrontmatter('title', imported.title)
      }
      if (!document.frontmatter.desc.trim() && imported.desc) {
        updateFrontmatter('desc', imported.desc)
      }
      if (!(document.frontmatter.source_name || '').trim() && imported.sourceName) {
        updateFrontmatter('source_name', imported.sourceName)
      }
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '导入正文失败。')
    } finally {
      setIsImportingFromUrl(false)
    }
  }

  // ---- Taxonomy CRUD handlers ----

  const handleTaxonomyCreate = (type: TaxonomyType, name: string) => {
    if (!document) {
      return
    }

    clearSuccessMessageOnDirty()
    // Add the new taxonomy value to the current document's frontmatter
    const currentValues = document.frontmatter[type]
    if (!currentValues.includes(name)) {
      updateFrontmatter(type, [...currentValues, name])
    }
  }

  const handleTaxonomyRename = (type: TaxonomyType, oldName: string, newName: string) => {
    const affectedPaths = findPostsWithTaxonomy(posts, type, oldName)

    if (affectedPaths.length === 0) {
      // No posts use this taxonomy — just update the current document if it has it
      if (document) {
        const currentValues = document.frontmatter[type]
        if (currentValues.includes(oldName)) {
          updateFrontmatter(
            type,
            currentValues.map((v) => (v === oldName ? newName : v)),
          )
        }
      }
      return
    }

    setTaxonomyConfirm({ kind: 'rename', type, oldName, newName, affectedPaths })
  }

  const handleTaxonomyDelete = (type: TaxonomyType, name: string) => {
    const affectedPaths = findPostsWithTaxonomy(posts, type, name)

    if (affectedPaths.length === 0) {
      // No posts use this taxonomy — just remove from current document if present
      if (document) {
        const currentValues = document.frontmatter[type]
        if (currentValues.includes(name)) {
          updateFrontmatter(
            type,
            currentValues.filter((v) => v !== name),
          )
        }
      }
      return
    }

    setTaxonomyConfirm({ kind: 'delete', type, name, affectedPaths })
  }

  const handleTaxonomyConfirm = async () => {
    if (!taxonomyConfirm || !session) {
      return
    }

    setIsBatchUpdating(true)
    setBatchProgress('')
    setError(null)

    try {
      const { affectedPaths } = taxonomyConfirm

      if (taxonomyConfirm.kind === 'rename') {
        const { type, oldName, newName } = taxonomyConfirm
        const result = await batchUpdatePostContents(
          session,
          affectedPaths,
          `Rename ${type} "${oldName}" to "${newName}"`,
          (content) => renameTaxonomyInContent(content, type, oldName, newName),
          (completed, total) => setBatchProgress(`正在更新 ${completed}/${total} 篇文章…`),
        )

        // Update current document's frontmatter if it contains the old name
        if (document) {
          const currentValues = document.frontmatter[type]
          if (currentValues.includes(oldName)) {
            updateFrontmatter(
              type,
              currentValues.map((v) => (v === oldName ? newName : v)),
            )
          }
        }

        if (result.failed.length > 0) {
          setError(`重命名完成，但 ${result.failed.length} 篇文章更新失败。`)
        } else {
          setSuccessMessage(`已将${TAXONOMY_LABELS[type]}「${oldName}」重命名为「${newName}」。`)
        }
      } else {
        const { type, name } = taxonomyConfirm
        const result = await batchUpdatePostContents(
          session,
          affectedPaths,
          `Delete ${type} "${name}"`,
          (content) => deleteTaxonomyFromContent(content, type, name),
          (completed, total) => setBatchProgress(`正在更新 ${completed}/${total} 篇文章…`),
        )

        // Update current document's frontmatter if it contains the deleted name
        if (document) {
          const currentValues = document.frontmatter[type]
          if (currentValues.includes(name)) {
            updateFrontmatter(
              type,
              currentValues.filter((v) => v !== name),
            )
          }
        }

        if (result.failed.length > 0) {
          setError(`删除完成，但 ${result.failed.length} 篇文章更新失败。`)
        } else {
          setSuccessMessage(`已从所有文章中删除${TAXONOMY_LABELS[type]}「${name}」。`)
        }
      }

      // Refresh post index to reflect the changes
      try {
        const indexedPosts = contentType === 'read-later'
          ? await buildReadLaterIndex(session)
          : await buildPostIndex(session)
        setPosts(indexedPosts)
      } catch {
        // If re-indexing fails, the UI still reflects the old data but the operation succeeded
      }
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '批量更新失败。')
    } finally {
      setIsBatchUpdating(false)
      setBatchProgress('')
      setTaxonomyConfirm(null)
    }
  }

  const handleTaxonomyCancel = () => {
    if (!isBatchUpdating) {
      setTaxonomyConfirm(null)
    }
  }

  const saveLabel = isSaving ? '保存中…' : document ? (isDirty ? '保存' : '已保存') : '保存'
  const isSaveDisabled = !document || isSaving || !isDirty || isBatchUpdating || isTogglingPinned
  const isSaveQuiet = Boolean(document) && !isDirty && !isSaving

  const indexedLabel = contentType === 'read-later' ? '待读' : '文章'
  const loadingLabel = contentType === 'read-later' ? '正在加载待读…' : '正在加载文章…'

  const status = adminView === 'dashboard'
    ? isIndexing
      ? loadingLabel
      : `共 ${posts.length} 篇${indexedLabel}`
    : isSaving && document
      ? `正在保存 ${document.path}`
      : isTogglingPinned && togglingPinnedPostPath
        ? `正在更新置顶 · ${togglingPinnedPostPath}`
        : isOpeningPost && activePostPath
          ? `正在打开 ${activePostPath}`
          : document
          ? isDirty
            ? `未保存修改 · ${document.path}`
            : `编辑中 · ${document.path}`
          : isIndexing
            ? loadingLabel
            : '已就绪'

  if (!session) {
    return <LoginGate isLoading={isLoading} error={error} onLogin={handleLogin} />
  }

  const isDashboard = adminView === 'dashboard'
  const isPreviewing = mode === 'preview'
  const isReadLaterDocument = document?.contentType === 'read-later'
  const isReadLaterPreview = Boolean(isReadLaterDocument && isPreviewing)
  const showImmersiveCanvas = Boolean(document) && (isImmersive || (isPreviewing && !isReadLaterDocument))
  const isPostListHidden = showImmersiveCanvas
  const showSettingsPanel = Boolean(document) && !showImmersiveCanvas
  const showDocumentFrame = Boolean(document) && !showImmersiveCanvas && !isReadLaterPreview

  return (
    <main className={`admin-shell${showImmersiveCanvas ? ' admin-shell--immersive' : ''}${isDark ? ' admin-shell--dark' : ''}`}>
      <div className="admin-shell__glow admin-shell__glow--left" />
      <div className="admin-shell__glow admin-shell__glow--right" />
      <TopBar
        search={search}
        onSearchChange={setSearch}
        onNewPost={handleNewPost}
        onSave={() => {
          void handleSave()
        }}
        onTogglePreview={handleTogglePreview}
        hasActiveDocument={Boolean(document)}
        isPreviewing={isPreviewing}
        isDarkMode={isDark}
        saveLabel={saveLabel}
        isSaveDisabled={isSaveDisabled}
        isSaveQuiet={isSaveQuiet}
        status={status}
        onLogout={handleLogout}
        onToggleColorMode={toggleColorMode}
        adminView={adminView}
        onBackToDashboard={handleBackToDashboard}
        onContentTypeChange={(value) => {
          if (value === contentType) {
            return
          }
          if (!confirmNavigation()) {
            return
          }
          resetPreviewImageUrls()
          replaceDocument(null)
          setActivePostPath(null)
          setIsOpeningPost(false)
          setIsImmersive(false)
          setError(null)
          setSuccessMessage(null)
          setSearch('')
          setContentType(value)
          setAdminView('dashboard')
        }}
        contentType={contentType}
        searchInputRef={searchInputRef}
      />
      {isDashboard ? (
        <>
          {successMessage ? <p className="success-message">{successMessage}</p> : null}
          {error ? <p className="error-message">{error}</p> : null}
          <PostDashboard
            posts={posts}
            search={search}
            isIndexing={isIndexing}
            contentType={contentType}
            isDeleting={isDeletingPost}
            deletingPostPath={deletingPostPath}
            isTogglingPinned={isTogglingPinned}
            togglingPinnedPostPath={togglingPinnedPostPath}
            onOpenPost={handleOpenPost}
            onNewPost={handleNewPost}
            onDeletePost={handleDeletePost}
            onTogglePinned={handleTogglePinned}
            onSearchFocus={() => searchInputRef.current?.focus()}
          />
        </>
      ) : (
        <div className={`admin-layout${isReadLaterPreview ? ' admin-layout--reader' : ''}`}>
          <PostListPane
            posts={filteredPosts}
            hidden={isPostListHidden}
            contentType={contentType}
            activePostPath={activePostPath}
            document={document}
            isDeleting={isDeletingPost}
            deletingPostPath={deletingPostPath}
            isTogglingPinned={isTogglingPinned}
            togglingPinnedPostPath={togglingPinnedPostPath}
            disabledPinnedPostPath={document?.path && !canNavigateAway ? document.path : null}
            onOpenPost={handleOpenPost}
            onDeletePost={handleDeletePost}
            onTogglePinned={handleTogglePinned}
            onBackToList={handleBackToDashboard}
          />
          <section className={`editor-layout${showSettingsPanel ? '' : ' editor-layout--single'}${isReadLaterPreview ? ' editor-layout--reader' : ''}`}>
            <div className={`editor-stack${isReadLaterPreview ? ' editor-stack--reader' : ''}`}>
              {document ? (
                <>
                  {showDocumentFrame ? (
                    <section className="editor-frame">
                      <div className="editor-frame__header">
                        <div>
                          <p className={`editor-frame__eyebrow${!document.frontmatter.title?.trim() ? ' editor-frame__eyebrow--untitled' : ''}`}>当前稿件</p>
                          <h1 className={!document.frontmatter.title?.trim() ? 'editor-frame__title--untitled' : ''}>
                            {document.frontmatter.title?.trim() || '未命名草稿'}
                          </h1>
                        </div>
                      </div>
                      <div className="editor-frame__meta">
                        <span>{document.path}</span>
                        <span>{mode === 'preview' ? (isReadLaterDocument ? '阅读视图' : '预览模式') : '编辑模式'}</span>
                      </div>
                    </section>
                  ) : null}
                  {successMessage && !isDirty ? <p className="success-message">{successMessage}</p> : null}
                  {error ? <p className="error-message">{error}</p> : null}
                  {mode === 'preview' ? (
                    <PreviewPane
                      title={document.frontmatter.title}
                      date={document.frontmatter.date}
                      markdown={document.body}
                      desc={document.frontmatter.desc}
                      cover={document.frontmatter.cover}
                      sourceName={document.frontmatter.source_name}
                      externalUrl={document.frontmatter.external_url}
                      readingStatus={document.frontmatter.reading_status}
                      contentType={document.contentType}
                      previewImageUrls={previewImageUrls}
                      annotations={readLaterAnnotations}
                      activeAnnotationId={activeAnnotationId}
                      annotationScrollRequest={annotationScrollRequest}
                      onCreateAnnotation={handleCreateReadLaterAnnotation}
                      onSelectAnnotation={handleSelectAnnotation}
                    />
                  ) : (
                    <MarkdownEditor
                      value={document.body}
                      onChange={handleEditorChange}
                      onToggleImmersive={() => setIsImmersive((current) => getNextImmersiveMode(current))}
                      isImmersive={isImmersive}
                      onUploadImage={handleUploadImage}
                    />
                  )}
                </>
              ) : isOpeningPost ? (
                <section className="hero-card">
                  <div className="hero-card__grid" />
                  <p>{contentType === 'read-later' ? '正在加载待读…' : '正在加载文章…'}</p>
                </section>
              ) : (
                <EmptyState error={error} />
              )}
            </div>
            {showSettingsPanel ? (
              <SettingsPanel
                document={document}
                validationErrors={validationErrors}
                publishLocked={publishLocked}
                contentType={contentType}
                availableCategories={availableCategories}
                availableTags={availableTags}
                onFieldChange={handleFrontmatterChange}
                onBodyChange={handleEditorChange}
                onTaxonomyCreate={handleTaxonomyCreate}
                onTaxonomyRename={handleTaxonomyRename}
                onTaxonomyDelete={handleTaxonomyDelete}
                onUploadImage={handleUploadImage}
                onImportFromUrl={() => { void handleImportFromUrl() }}
                isImportingFromUrl={isImportingFromUrl}
                previewImageUrls={previewImageUrls}
                readLaterTab={readLaterTab}
                onReadLaterTabChange={handleReadLaterTabChange}
                annotations={readLaterAnnotations}
                activeAnnotationId={activeAnnotationId}
                editingAnnotationId={editingAnnotationId}
                onSelectAnnotation={handleSelectAnnotation}
                onEditAnnotation={handleOpenAnnotationNote}
                onDeleteAnnotation={handleDeleteAnnotation}
                onSaveAnnotationNote={handleSaveAnnotationNote}
                onCancelAnnotationEdit={() => setEditingAnnotationId(null)}
              />
            ) : null}
          </section>
        </div>
      )}
      {taxonomyConfirm ? (
        <ConfirmDialog
          title={
            taxonomyConfirm.kind === 'rename'
              ? `重命名${TAXONOMY_LABELS[taxonomyConfirm.type]}`
              : `删除${TAXONOMY_LABELS[taxonomyConfirm.type]}`
          }
          message={
            taxonomyConfirm.kind === 'rename'
              ? `确定将${TAXONOMY_LABELS[taxonomyConfirm.type]}「${taxonomyConfirm.oldName}」重命名为「${taxonomyConfirm.newName}」吗？这将修改 ${taxonomyConfirm.affectedPaths.length} 篇文章。`
              : `确定删除${TAXONOMY_LABELS[taxonomyConfirm.type]}「${taxonomyConfirm.name}」吗？这将从 ${taxonomyConfirm.affectedPaths.length} 篇文章中移除该${TAXONOMY_LABELS[taxonomyConfirm.type]}。`
          }
          confirmLabel={taxonomyConfirm.kind === 'rename' ? '确认重命名' : '确认删除'}
          isDangerous={taxonomyConfirm.kind === 'delete'}
          isProcessing={isBatchUpdating}
          processingMessage={batchProgress}
          onConfirm={() => { void handleTaxonomyConfirm() }}
          onCancel={handleTaxonomyCancel}
        />
      ) : null}
      {postDeleteConfirm ? (
        <ConfirmDialog
          title={contentType === 'read-later' ? '删除待读条目' : '删除文章'}
          message={`确定删除《${postDeleteConfirm.post.title}》吗？该操作会直接删除仓库中的 Markdown 文件，且不可恢复。`}
          confirmLabel="确认删除"
          isDangerous
          isProcessing={isDeletingPost}
          processingMessage={deletingPostPath ? `正在删除 ${deletingPostPath}` : undefined}
          onConfirm={() => { void handleDeletePostConfirm() }}
          onCancel={handleDeletePostCancel}
        />
      ) : null}
    </main>
  )
}
