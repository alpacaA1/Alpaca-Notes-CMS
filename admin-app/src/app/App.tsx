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
import { listLocalDraftSummaries, readLocalDraft, removeLocalDraft, saveLocalDraft } from './editor/local-draft-store'
import MarkdownEditor from './editor/markdown-editor'
import PreviewPane from './editor/preview-pane'
import { useEditorDocument } from './editor/use-editor-document'
import { createKnowledgeFromSelection, createNewKnowledgeItem } from './knowledge/new-item'
import { KNOWLEDGE_RANDOM_CATEGORY } from './knowledge/constants'
import { resolveContentFormat } from './content-format'
import { organizeDiaryMaterials, type DiaryAiEntry } from './diary/diary-ai-client'
import TopBar from './layout/top-bar'
import PostListPane from './layout/post-list-pane'
import PostDashboard from './layout/post-dashboard'
import ReadLaterAnnotationsView from './layout/read-later-annotations-view'
import SettingsPanel from './layout/settings-panel'
import ConfirmDialog from './layout/confirm-dialog'
import { getNextImmersiveMode } from './layout/immersive-mode'
import { useColorMode } from './layout/use-color-mode'
import LoginGate from './login-gate'
import { buildReadLaterAnnotationIndex } from './read-later/annotation-index'
import type { ReadLaterAnnotationIndexItem } from './read-later/annotation-index'
import { buildReadLaterIndex, parseReadLaterIndexItem } from './read-later/index-items'
import { createNewReadLaterItem } from './read-later/new-item'
import { importReadLaterFromUrl } from './read-later/import-client'
import { parseReadLaterItem } from './read-later/parse-item'
import { serializeReadLaterItem } from './read-later/serialize-item'
import type { ParsedReadLaterItem, ReadLaterAnnotation } from './read-later/item-types'
import { createNewDiaryEntry, createNewPost } from './posts/new-post'
import { buildDiaryIndex, buildKnowledgeIndex, buildPostIndex, collectPostIndexFacets, filterPostIndex, parsePostIndexItem, sortPostIndex } from './posts/index-posts'
import { parsePost } from './posts/parse-post'
import type { ParsedPost } from './posts/parse-post'
import { serializePost } from './posts/serialize-post'
import type { ContentType, PostIndexItem } from './posts/post-types'
import { findPostsWithTaxonomy, renameTaxonomyInContent, deleteTaxonomyFromContent } from './posts/taxonomy-operations'
import { AuthError, createSessionStore, loginWithPopup, readStoredSession } from './session'

type IndexedPostsByType = Record<ContentType, PostIndexItem[]>
type ReadLaterTab = 'info' | 'commentary'
type ReadLaterAnnotationAction = 'highlight' | 'note'
type ReadLaterAnnotationDraft = Pick<ReadLaterAnnotation, 'sectionKey' | 'quote' | 'prefix' | 'suffix'>
type ReaderNavigationRequest = { targetId: string; requestId: number }
type TaxonomyType = 'categories' | 'tags'
type TaxonomyConfirmAction =
  | { kind: 'rename'; type: TaxonomyType; oldName: string; newName: string; affectedPaths: string[] }
  | { kind: 'delete'; type: TaxonomyType; name: string; affectedPaths: string[] }

type PostDeleteConfirmAction = {
  kind: 'delete-post'
  post: PostIndexItem
}

type OpenDocumentOptions = {
  draftPost?: ParsedPost | null
  successMessage?: string | null
}

const SAVE_SUCCESS_MESSAGE = '已保存。'
const TAXONOMY_LABELS: Record<TaxonomyType, string> = { categories: '分类', tags: '标签' }

function createEmptyIndexedPostsByType(): IndexedPostsByType {
  return { post: [], diary: [], 'read-later': [], knowledge: [] }
}

function createReadLaterAnnotationId() {
  return `annotation-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function getContentTypeFromPostLike(post: Pick<PostIndexItem, 'contentType'> | Pick<ParsedPost, 'contentType'>): ContentType {
  if (post.contentType === 'read-later') {
    return 'read-later'
  }

  if (post.contentType === 'diary') {
    return 'diary'
  }

  if (post.contentType === 'knowledge') {
    return 'knowledge'
  }

  return 'post'
}

function getContentTypeLabel(contentType: ContentType) {
  if (contentType === 'read-later') {
    return '待读'
  }

  if (contentType === 'diary') {
    return '日记'
  }

  return contentType === 'knowledge' ? '知识点' : '文章'
}

function getDeleteContentTypeLabel(contentType: ContentType) {
  if (contentType === 'read-later') {
    return '待读条目'
  }

  if (contentType === 'diary') {
    return '日记'
  }

  return contentType === 'knowledge' ? '知识点' : '文章'
}

function getContentCountUnit(contentType: ContentType) {
  return contentType === 'read-later' || contentType === 'knowledge' ? '条' : '篇'
}

function normalizeUrlForComparison(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }

  try {
    const url = new URL(trimmed)
    url.hash = ''
    const normalizedPath = url.pathname.replace(/\/+$/, '') || '/'
    return `${url.protocol}//${url.host}${normalizedPath}${url.search}`.toLowerCase()
  } catch {
    return trimmed.toLowerCase()
  }
}

function hasRecoverableChanges(draft: ParsedPost | null, saved: ParsedPost | null) {
  if (!draft) {
    return false
  }

  if (!saved) {
    return true
  }

  return JSON.stringify(draft) !== JSON.stringify(saved)
}

function buildPostIndexItemFromDocument(document: ParsedPost): PostIndexItem {
  const resolvedContentType = getContentTypeFromPostLike(document)

  return {
    path: document.path,
    sha: document.sha,
    title: document.frontmatter.title.trim() || '未命名草稿',
    date: document.frontmatter.date,
    desc: document.frontmatter.desc,
    published: resolvedContentType === 'read-later' ? false : Boolean(document.frontmatter.published),
    pinned: Boolean(document.frontmatter.pinned),
    hasExplicitPublished: document.hasExplicitPublished,
    categories: document.frontmatter.categories,
    tags: document.frontmatter.tags,
    permalink: document.frontmatter.permalink || null,
    cover: document.frontmatter.cover || null,
    contentType: resolvedContentType,
    ...(resolvedContentType === 'read-later'
      ? {
          externalUrl: document.frontmatter.external_url || null,
          sourceName: document.frontmatter.source_name || null,
          readingStatus: document.frontmatter.reading_status || 'unread',
        }
      : resolvedContentType === 'knowledge'
        ? {
            sourceType: document.frontmatter.source_type || null,
            sourcePath: document.frontmatter.source_path || null,
            sourceTitle: document.frontmatter.source_title || null,
            sourceUrl: document.frontmatter.source_url || null,
          }
      : {}),
  }
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <section className="hero-card">
      <div className="hero-card__grid" />
      <p className="eyebrow">写作后台</p>
      <h1>内容编辑台</h1>
      <p>请选择一条内容开始编辑，或新建一篇草稿。</p>
      {error ? <p className="error-message">{error}</p> : null}
    </section>
  )
}

type AdminView = 'dashboard' | 'editor' | 'annotations'

export default function App() {
  const sessionStore = useMemo(() => createSessionStore(readStoredSession()), [])
  const [session, setSession] = useState(() => sessionStore.getSession())
  const { isDark, toggle: toggleColorMode } = useColorMode()
  const [contentType, setContentType] = useState<ContentType>('post')
  const [postsByType, setPostsByType] = useState<IndexedPostsByType>(createEmptyIndexedPostsByType)
  const posts = postsByType[contentType]
  const readLaterPosts = postsByType['read-later']
  const [activePostPath, setActivePostPath] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isImmersive, setIsImmersive] = useState(false)
  const [adminView, setAdminView] = useState<AdminView>('dashboard')
  const [isLoading, setIsLoading] = useState(false)
  const [isIndexing, setIsIndexing] = useState(false)
  const [isAnnotationIndexing, setIsAnnotationIndexing] = useState(false)
  const [isOpeningPost, setIsOpeningPost] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isImportingFromUrl, setIsImportingFromUrl] = useState(false)
  const [isQuickCollectingReadLater, setIsQuickCollectingReadLater] = useState(false)
  const [isOrganizingDiaryMaterials, setIsOrganizingDiaryMaterials] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [diaryMaterialResult, setDiaryMaterialResult] = useState<string | null>(null)
  const [quickReadLaterUrl, setQuickReadLaterUrl] = useState('')
  const [previewImageUrls, setPreviewImageUrls] = useState<Record<string, string>>({})
  const [readLaterAnnotationIndex, setReadLaterAnnotationIndex] = useState<ReadLaterAnnotationIndexItem[]>([])
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
  const [isReadLaterTopBarHidden, setIsReadLaterTopBarHidden] = useState(false)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null)
  const [annotationScrollRequest, setAnnotationScrollRequest] = useState(0)
  const [readerNavigationRequest, setReaderNavigationRequest] = useState<ReaderNavigationRequest | null>(null)
  const [activeOutlineTargetId, setActiveOutlineTargetId] = useState<string | null>(null)
  const {
    document,
    savedDocument,
    mode,
    isDirty,
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
  const { categories: availableCategories, tags: availableTags } = useMemo(() => {
    const facets = collectPostIndexFacets(posts)
    if (contentType !== 'knowledge' || facets.categories.includes(KNOWLEDGE_RANDOM_CATEGORY)) {
      return facets
    }

    return {
      ...facets,
      categories: [KNOWLEDGE_RANDOM_CATEGORY, ...facets.categories].sort((left, right) =>
        left.localeCompare(right, 'zh-CN'),
      ),
    }
  }, [contentType, posts])
  const readLaterAnnotations = useMemo(
    () => (document?.contentType === 'read-later' ? (document.annotations || []) : []),
    [document],
  )
  const documentContentFormat = useMemo(
    () => (document ? resolveContentFormat(document.path, document.frontmatter.format) : 'markdown'),
    [document],
  )
  const activeDocumentPost = useMemo(() => {
    if (!document) {
      return null
    }

    const resolvedContentType = getContentTypeFromPostLike(document)
    return postsByType[resolvedContentType].find((post) => post.path === document.path) || buildPostIndexItemFromDocument(document)
  }, [document, postsByType])
  const recoverableDrafts = useMemo(() => {
    const knownPaths = new Set(postsByType[contentType].map((post) => post.path))

    return listLocalDraftSummaries().filter((draft) => draft.contentType === contentType && !knownPaths.has(draft.path))
  }, [contentType, postsByType, adminView, document?.path, isDirty, isSaving, session])

  const updatePostsForType = useCallback((type: ContentType, updater: (currentPosts: PostIndexItem[]) => PostIndexItem[]) => {
    setPostsByType((currentPostsByType) => ({
      ...currentPostsByType,
      [type]: updater(currentPostsByType[type]),
    }))
  }, [])

  useEffect(() => {
    setReadLaterTab('info')
    setActiveAnnotationId(null)
    setEditingAnnotationId(null)
    setAnnotationScrollRequest(0)
  }, [document?.path, document?.contentType])

  useEffect(() => {
    if (contentType !== 'diary') {
      setDiaryMaterialResult(null)
      setIsOrganizingDiaryMaterials(false)
    }
  }, [contentType])

  useEffect(() => {
    if (!session || contentType !== 'read-later' || adminView !== 'annotations') {
      return
    }

    let cancelled = false

    const loadAnnotations = async () => {
      setIsAnnotationIndexing(true)

      try {
        const annotations = await buildReadLaterAnnotationIndex(session, readLaterPosts)
        if (!cancelled) {
          setReadLaterAnnotationIndex(annotations)
        }
      } catch (caughtError) {
        if (cancelled) {
          return
        }

        if (caughtError instanceof GitHubAuthError) {
          handleAuthExpiry(caughtError.message)
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : '加载批注列表失败。')
      } finally {
        if (!cancelled) {
          setIsAnnotationIndexing(false)
        }
      }
    }

    void loadAnnotations()

    return () => {
      cancelled = true
    }
  }, [adminView, contentType, readLaterPosts, session])

  useEffect(() => {
    if (!document || document.contentType !== 'read-later' || mode !== 'preview') {
      setIsReadLaterTopBarHidden(false)
    }
  }, [document, mode])

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
    if (!document) {
      return
    }

    if (!isDirty) {
      removeLocalDraft(document.path)
      return
    }

    saveLocalDraft(savedDocument, document)
  }, [document, isDirty, savedDocument])

  useEffect(() => {
    if (!session) {
      setPostsByType(createEmptyIndexedPostsByType())
      setIsIndexing(false)
      setIsOpeningPost(false)
      return
    }

    let cancelled = false
    const indexedContentType = contentType

    const loadPosts = async () => {
      setIsIndexing(true)

      try {
        const indexedPosts =
          indexedContentType === 'read-later'
            ? await buildReadLaterIndex(session)
            : indexedContentType === 'diary'
              ? await buildDiaryIndex(session)
              : indexedContentType === 'knowledge'
                ? await buildKnowledgeIndex(session)
              : await buildPostIndex(session)
        if (!cancelled) {
          updatePostsForType(indexedContentType, () => indexedPosts)
        }
      } catch (caughtError) {
        if (cancelled) {
          return
        }

        if (caughtError instanceof GitHubAuthError) {
          handleAuthExpiry(caughtError.message)
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : `加载${getContentTypeLabel(indexedContentType)}列表失败。`)
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
  }, [contentType, session, sessionStore, updatePostsForType])

  const openDocument = (nextPost: ParsedPost, options?: OpenDocumentOptions) => {
    resetPreviewImageUrls()
    replaceDocument(nextPost, options?.draftPost ?? undefined)
    setMode(nextPost.contentType === 'read-later' ? 'preview' : 'markdown')
    setActivePostPath(nextPost.path)
    setIsImmersive(false)
    setSuccessMessage(options?.successMessage || null)
    setError(null)
  }

  const confirmNavigation = () => {
    if (canNavigateAway) {
      return true
    }

    const shouldDiscard = window.confirm('当前有未保存的修改。确认丢弃并继续吗？')
    if (shouldDiscard && document) {
      removeLocalDraft(document.path)
    }

    return shouldDiscard
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
    setPostsByType(createEmptyIndexedPostsByType())
    setReadLaterAnnotationIndex([])
    setActivePostPath(null)
    setIsOpeningPost(false)
    setIsQuickCollectingReadLater(false)
    setQuickReadLaterUrl('')
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

  const resolveDocumentWithLocalDraft = (savedPost: ParsedPost) => {
    const storedDraft = readLocalDraft(savedPost.path)
    if (!storedDraft || !hasRecoverableChanges(storedDraft.draftDocument, storedDraft.savedDocument)) {
      return { savedPost, draftPost: null as ParsedPost | null, successMessage: null as string | null }
    }

    const hasMatchingBaseline =
      storedDraft.savedDocument?.path === savedPost.path &&
      storedDraft.savedDocument?.sha === savedPost.sha

    if (!hasMatchingBaseline) {
      const shouldRestore = window.confirm('检测到本地未保存草稿，但远端内容可能已更新。是否恢复本地草稿继续编辑？')
      if (!shouldRestore) {
        return { savedPost, draftPost: null as ParsedPost | null, successMessage: null as string | null }
      }
    }

    return {
      savedPost,
      draftPost: storedDraft.draftDocument,
      successMessage: '已恢复本地草稿。',
    }
  }

  const handleNewPost = () => {
    if (!confirmNavigation()) {
      return
    }

    openDocument(
      contentType === 'read-later'
        ? createNewReadLaterItem()
        : contentType === 'diary'
          ? createNewDiaryEntry()
          : contentType === 'knowledge'
            ? createNewKnowledgeItem()
          : createNewPost(),
    )
    setAdminView('editor')
  }

  const handleOpenPost = async (post: PostIndexItem) => {
    if (!session || !confirmNavigation()) {
      return
    }

    const targetContentType = getContentTypeFromPostLike(post)
    const parseOpenedFile = (file: { path: string; sha: string; content: string }) =>
      targetContentType === 'read-later' ? parseReadLaterItem(file) : parsePost(file)

    setAdminView('editor')
    setSuccessMessage(null)
    setError(null)

    const cachedFile = readCachedMarkdownFile(post.path, post.sha)
    if (cachedFile) {
      setIsOpeningPost(false)
      const resolvedDocument = resolveDocumentWithLocalDraft(parseOpenedFile(cachedFile))
      openDocument(resolvedDocument.savedPost, {
        draftPost: resolvedDocument.draftPost,
        successMessage: resolvedDocument.successMessage,
      })
      return
    }

    setIsOpeningPost(true)
    setActivePostPath(post.path)
    replaceDocument(null)

    try {
      const file = await fetchMarkdownFile(session, post.path)
      const resolvedDocument = resolveDocumentWithLocalDraft(parseOpenedFile(file))
      openDocument(resolvedDocument.savedPost, {
        draftPost: resolvedDocument.draftPost,
        successMessage: resolvedDocument.successMessage,
      })
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : `打开${getContentTypeLabel(targetContentType)}失败。`)
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

  const handleOpenAnnotations = () => {
    setSuccessMessage(null)
    setError(null)
    setAdminView('annotations')
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
      removeLocalDraft(post.path)

      const deletedContentType = getContentTypeFromPostLike(post)
      updatePostsForType(deletedContentType, (currentPosts) =>
        currentPosts.filter((currentPost) => currentPost.path !== post.path),
      )

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

      setError(caughtError instanceof Error ? caughtError.message : `删除${getContentTypeLabel(getContentTypeFromPostLike(post))}失败。`)
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
    const targetContentType = getContentTypeFromPostLike(post)

    if (!session || isTogglingPinned) {
      return
    }

    if (document?.path === post.path && !canNavigateAway) {
      setSuccessMessage(null)
      setError(`当前${getContentTypeLabel(targetContentType)}有未保存的修改，请先保存后再置顶。`)
      return
    }

    setIsTogglingPinned(true)
    setTogglingPinnedPostPath(post.path)
    setError(null)
    setSuccessMessage(null)

    try {
      const file = readCachedMarkdownFile(post.path, post.sha) ?? await fetchMarkdownFile(session, post.path)
      const openedPost = targetContentType === 'read-later' ? parseReadLaterItem(file) : parsePost(file)
      const updatedDocument = {
        ...openedPost,
        frontmatter: {
          ...openedPost.frontmatter,
          pinned: !openedPost.frontmatter.pinned,
        },
      }
      const savedContent = targetContentType === 'read-later'
        ? serializeReadLaterItem(updatedDocument as ParsedReadLaterItem)
        : serializePost(updatedDocument)
      const savedFile = await saveMarkdownFile(session, {
        path: updatedDocument.path,
        sha: updatedDocument.sha || undefined,
        content: savedContent,
      })
      const savedDocument: ParsedPost = {
        ...updatedDocument,
        path: savedFile.path,
        sha: savedFile.sha,
      }
      const savedPostIndexItem = targetContentType === 'read-later'
        ? parseReadLaterIndexItem({
            path: savedFile.path,
            sha: savedFile.sha,
            content: savedContent,
          })
        : parsePostIndexItem({
            path: savedFile.path,
            sha: savedFile.sha,
            content: savedContent,
          })

      updatePostsForType(targetContentType, (currentPosts) =>
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

      setError(caughtError instanceof Error ? caughtError.message : `更新${getContentTypeLabel(targetContentType)}置顶状态失败。`)
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
      const { targetContentType, savedDocument, savedPostIndexItem } = await saveDocumentToRepo(document)
      markSaved(savedDocument)
      removeLocalDraft(savedDocument.path)
      setActivePostPath(savedDocument.path)
      updatePostsForType(targetContentType, (currentPosts) =>
        sortPostIndex(
          [
            ...currentPosts.filter((post) => post.path !== document.path && post.path !== savedDocument.path),
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

      setError(caughtError instanceof Error ? caughtError.message : `保存${getContentTypeLabel(getContentTypeFromPostLike(document))}失败。`)
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

  const handleOpenReadLaterAnnotation = async (annotation: ReadLaterAnnotationIndexItem) => {
    if (!session || !confirmNavigation()) {
      return
    }

    const openAnnotationDocument = (file: { path: string; sha: string; content: string }) => {
      const resolvedDocument = resolveDocumentWithLocalDraft(parseReadLaterItem(file))
      openDocument(resolvedDocument.savedPost, {
        draftPost: resolvedDocument.draftPost,
        successMessage: resolvedDocument.successMessage,
      })
      setReadLaterTab('commentary')
      setActiveAnnotationId(annotation.annotationId)
      setEditingAnnotationId(null)
      setAnnotationScrollRequest((current) => current + 1)
    }

    setContentType('read-later')
    setAdminView('editor')
    setSuccessMessage(null)
    setError(null)

    const sourcePost = readLaterPosts.find((post) => post.path === annotation.postPath)
    const cachedFile = readCachedMarkdownFile(annotation.postPath, sourcePost?.sha)
    if (cachedFile) {
      setIsOpeningPost(false)
      openAnnotationDocument(cachedFile)
      return
    }

    setIsOpeningPost(true)
    setActivePostPath(annotation.postPath)
    replaceDocument(null)

    try {
      const file = await fetchMarkdownFile(session, annotation.postPath)
      openAnnotationDocument(file)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '打开批注原文失败。')
    } finally {
      setIsOpeningPost(false)
    }
  }

  const handleClearActiveAnnotation = () => {
    setActiveAnnotationId(null)
    setEditingAnnotationId(null)
  }

  const handleNavigateOutline = useCallback((targetId: string) => {
    setActiveOutlineTargetId(targetId)
    setReaderNavigationRequest((current) => ({
      targetId,
      requestId: (current?.requestId ?? 0) + 1,
    }))
  }, [])

  useEffect(() => {
    if (document?.contentType === 'read-later' && mode === 'preview') {
      return
    }

    setActiveOutlineTargetId(null)
  }, [document?.contentType, document?.path, mode])

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

  const saveDocumentToRepo = async (targetDocument: ParsedPost) => {
    if (!session) {
      throw new Error('GitHub 会话已过期，请重新登录。')
    }

    const targetContentType = getContentTypeFromPostLike(targetDocument)
    const content = targetContentType === 'read-later' ? serializeReadLaterItem(targetDocument as ParsedReadLaterItem) : serializePost(targetDocument)
    const savedFile = await saveMarkdownFile(session, {
      path: targetDocument.path,
      sha: targetDocument.sha || undefined,
      content,
    })
    const savedDocument: ParsedPost = {
      ...targetDocument,
      path: savedFile.path,
      sha: savedFile.sha,
    }
    const savedPostIndexItem = targetContentType === 'read-later'
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

    return {
      targetContentType,
      savedDocument,
      savedPostIndexItem,
    }
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
  }

  const handleCreateKnowledgeFromSelection = (quote: string) => {
    if (!document || !session) {
      return
    }

    const targetContentType = getContentTypeFromPostLike(document)
    if (targetContentType !== 'post' && targetContentType !== 'read-later' && targetContentType !== 'diary') {
      return
    }

    const normalizedQuote = quote.trim()
    if (!normalizedQuote) {
      return
    }

    void (async () => {
      setSuccessMessage(null)
      setError(null)

      try {
        const captureDate = new Date()
        const knowledgeDocument = createKnowledgeFromSelection(document, normalizedQuote, captureDate)
        const { targetContentType, savedPostIndexItem } = await saveDocumentToRepo(knowledgeDocument)

        updatePostsForType(targetContentType, (currentPosts) =>
          sortPostIndex(
            [
              ...currentPosts.filter((post) => post.path !== savedPostIndexItem.path),
              savedPostIndexItem,
            ],
            'date-desc',
          ),
        )
        setSuccessMessage(`已从《${document.frontmatter.title.trim() || '未命名稿件'}》保存知识点。`)
      } catch (caughtError) {
        if (caughtError instanceof GitHubAuthError) {
          handleAuthExpiry(caughtError.message)
          return
        }

        if (caughtError instanceof GitHubConflictError) {
          setError(caughtError.message)
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : '生成知识点失败。')
      }
    })()
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

  const findDuplicateReadLaterByUrl = (url: string, excludePath?: string | null) => {
    const normalizedTargetUrl = normalizeUrlForComparison(url)
    if (!normalizedTargetUrl) {
      return null
    }

    return postsByType['read-later'].find((post) => {
      if (excludePath && post.path === excludePath) {
        return false
      }

      return normalizeUrlForComparison(post.externalUrl || '') === normalizedTargetUrl
    }) || null
  }

  const handleQuickCollectReadLater = async () => {
    if (!session || isQuickCollectingReadLater) {
      return
    }

    const externalUrl = quickReadLaterUrl.trim()
    if (!externalUrl) {
      setError('请先粘贴原文链接。')
      return
    }

    if (!/^https?:\/\//i.test(externalUrl)) {
      setError('原文链接需以 http:// 或 https:// 开头。')
      return
    }

    const duplicatedPost = findDuplicateReadLaterByUrl(externalUrl)
    if (
      duplicatedPost &&
      !window.confirm(`已存在相同原文链接的待读《${duplicatedPost.title}》。仍要继续创建新草稿吗？`)
    ) {
      return
    }

    setIsQuickCollectingReadLater(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const imported = await importReadLaterFromUrl(session, externalUrl)
      const savedBaseDocument = createNewReadLaterItem()
      const draftDocument: ParsedReadLaterItem = {
        ...savedBaseDocument,
        body: imported.markdown,
        frontmatter: {
          ...savedBaseDocument.frontmatter,
          title: imported.title || savedBaseDocument.frontmatter.title,
          desc: imported.desc || savedBaseDocument.frontmatter.desc,
          source_name: imported.sourceName || savedBaseDocument.frontmatter.source_name,
          external_url: imported.finalUrl || imported.requestedUrl || externalUrl,
        },
      }

      const redirectedDuplicate = findDuplicateReadLaterByUrl(draftDocument.frontmatter.external_url, draftDocument.path)

      openDocument(savedBaseDocument, {
        draftPost: draftDocument,
        successMessage: redirectedDuplicate
          ? `检测到相同链接的待读《${redirectedDuplicate.title}》，已仍然创建新草稿。`
          : null,
      })
      setQuickReadLaterUrl('')
      setAdminView('editor')
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '快速收录失败。')
    } finally {
      setIsQuickCollectingReadLater(false)
    }
  }

  const handleOrganizeDiaryMaterials = async (selectedPosts: PostIndexItem[]) => {
    if (!session || isOrganizingDiaryMaterials) {
      return
    }

    if (selectedPosts.length === 0) {
      setSuccessMessage(null)
      setError('请先勾选要整理的日记。')
      return
    }

    setIsOrganizingDiaryMaterials(true)
    setDiaryMaterialResult(null)
    setSuccessMessage(null)
    setError(null)

    try {
      const entries: DiaryAiEntry[] = await Promise.all(
        selectedPosts.map(async (post) => {
          const file = readCachedMarkdownFile(post.path, post.sha) ?? await fetchMarkdownFile(session, post.path)
          const diary = parsePost(file)

          return {
            path: diary.path,
            title: diary.frontmatter.title || post.title,
            date: diary.frontmatter.date || post.date,
            body: diary.body,
          }
        }),
      )
      const result = await organizeDiaryMaterials(session, entries)
      setDiaryMaterialResult(result.materialMarkdown)
      setSuccessMessage(`已整理 ${entries.length} 篇日记素材。`)
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '日记素材整理失败。')
    } finally {
      setIsOrganizingDiaryMaterials(false)
    }
  }

  const handleOpenRecoveredDraft = async (path: string) => {
    if (!confirmNavigation()) {
      return
    }

    const storedDraft = readLocalDraft(path)
    if (!storedDraft || !hasRecoverableChanges(storedDraft.draftDocument, storedDraft.savedDocument)) {
      removeLocalDraft(path)
      setError('本地草稿不存在或已失效。')
      return
    }

    const nextContentType = getContentTypeFromPostLike(storedDraft.draftDocument)
    setContentType(nextContentType)
    openDocument(storedDraft.savedDocument || storedDraft.draftDocument, {
      draftPost: storedDraft.draftDocument,
      successMessage: '已恢复本地草稿。',
    })
    setAdminView('editor')
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
      const targetContentLabel = getContentTypeLabel(contentType)
      const targetCountUnit = getContentCountUnit(contentType)

      if (taxonomyConfirm.kind === 'rename') {
        const { type, oldName, newName } = taxonomyConfirm
        const result = await batchUpdatePostContents(
          session,
          affectedPaths,
          `Rename ${type} "${oldName}" to "${newName}"`,
          (content) => renameTaxonomyInContent(content, type, oldName, newName),
          (completed, total) => setBatchProgress(`正在更新 ${completed}/${total} ${targetCountUnit}${targetContentLabel}…`),
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
          setError(`重命名完成，但 ${result.failed.length} ${targetCountUnit}${targetContentLabel}更新失败。`)
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
          (completed, total) => setBatchProgress(`正在更新 ${completed}/${total} ${targetCountUnit}${targetContentLabel}…`),
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
          setError(`删除完成，但 ${result.failed.length} ${targetCountUnit}${targetContentLabel}更新失败。`)
        } else {
          setSuccessMessage(`已从所有${targetContentLabel}中删除${TAXONOMY_LABELS[type]}「${name}」。`)
        }
      }

      // Refresh post index to reflect the changes
      try {
        const indexedPosts =
          contentType === 'read-later'
            ? await buildReadLaterIndex(session)
            : contentType === 'diary'
              ? await buildDiaryIndex(session)
              : contentType === 'knowledge'
                ? await buildKnowledgeIndex(session)
              : await buildPostIndex(session)
        updatePostsForType(contentType, () => indexedPosts)
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

  const indexedLabel = getContentTypeLabel(contentType)
  const indexedCountUnit = getContentCountUnit(contentType)
  const loadingLabel = `正在加载${indexedLabel}…`
  const showIndexLoading = isIndexing && posts.length === 0

  const status = adminView === 'dashboard'
    ? isOrganizingDiaryMaterials
      ? '正在整理日记素材…'
      : isIndexing
      ? posts.length > 0
        ? `正在刷新${indexedLabel}… · 共 ${posts.length} ${indexedCountUnit}${indexedLabel}`
        : loadingLabel
      : `共 ${posts.length} ${indexedCountUnit}${indexedLabel}`
    : adminView === 'annotations'
      ? isAnnotationIndexing
        ? `正在聚合批注… · 已识别 ${readLaterAnnotationIndex.length} 条`
        : `共 ${readLaterAnnotationIndex.length} 条批注`
      : isOrganizingDiaryMaterials
        ? '正在整理日记素材…'
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
  const isAnnotationsView = adminView === 'annotations'
  const isPreviewing = mode === 'preview'
  const isReadLaterDocument = document?.contentType === 'read-later'
  const isReadLaterPreview = Boolean(isReadLaterDocument && isPreviewing)
  const hideTopBar = isReadLaterPreview && isReadLaterTopBarHidden
  const showImmersiveCanvas = Boolean(document) && (isImmersive || (isPreviewing && !isReadLaterDocument))
  const isPostListHidden = showImmersiveCanvas
  const showSettingsPanel = Boolean(document) && !showImmersiveCanvas
  const showDocumentFrame = Boolean(document) && !showImmersiveCanvas && !isReadLaterPreview

  return (
    <main className={`admin-shell${showImmersiveCanvas ? ' admin-shell--immersive' : ''}${isDark ? ' admin-shell--dark' : ''}${hideTopBar ? ' admin-shell--reader-top-bar-hidden' : ''}`}>
      <div className="admin-shell__glow admin-shell__glow--left" />
      <div className="admin-shell__glow admin-shell__glow--right" />
      {!hideTopBar ? (
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
          onOpenAnnotations={handleOpenAnnotations}
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
            setQuickReadLaterUrl('')
            setDiaryMaterialResult(null)
            setContentType(value)
            setAdminView('dashboard')
          }}
          contentType={contentType}
          searchInputRef={searchInputRef}
          currentActionContentType={activeDocumentPost ? getContentTypeFromPostLike(activeDocumentPost) : null}
          isCurrentPinned={Boolean(activeDocumentPost?.pinned)}
          isPinningCurrent={Boolean(activeDocumentPost && isTogglingPinned && togglingPinnedPostPath === activeDocumentPost.path)}
          isPinActionDisabled={
            !activeDocumentPost?.sha ||
            isDeletingPost ||
            isTogglingPinned ||
            (Boolean(activeDocumentPost) && activeDocumentPost.path === document?.path && !canNavigateAway)
          }
          onTogglePinnedCurrent={activeDocumentPost ? () => { void handleTogglePinned(activeDocumentPost) } : undefined}
          isDeletingCurrent={Boolean(activeDocumentPost && isDeletingPost && deletingPostPath === activeDocumentPost.path)}
          isDeleteActionDisabled={!activeDocumentPost?.sha || isDeletingPost || isTogglingPinned}
          onDeleteCurrent={activeDocumentPost ? () => handleDeletePost(activeDocumentPost) : undefined}
        />
      ) : null}
      {isDashboard ? (
        <section className="admin-shell__viewport">
          {successMessage ? <p className="success-message">{successMessage}</p> : null}
          {error ? <p className="error-message">{error}</p> : null}
          <PostDashboard
            posts={posts}
            search={search}
            isIndexing={showIndexLoading}
            contentType={contentType}
            recoverableDrafts={recoverableDrafts}
            quickCaptureUrl={quickReadLaterUrl}
            isQuickCapturing={isQuickCollectingReadLater}
            isDeleting={isDeletingPost}
            deletingPostPath={deletingPostPath}
            isTogglingPinned={isTogglingPinned}
            togglingPinnedPostPath={togglingPinnedPostPath}
            isOrganizingDiaryMaterials={isOrganizingDiaryMaterials}
            diaryMaterialResult={diaryMaterialResult}
            onOpenPost={handleOpenPost}
            onOpenRecoveredDraft={handleOpenRecoveredDraft}
            onNewPost={handleNewPost}
            onQuickCaptureUrlChange={setQuickReadLaterUrl}
            onQuickCapture={handleQuickCollectReadLater}
            onDeletePost={handleDeletePost}
            onTogglePinned={handleTogglePinned}
            onOrganizeDiaryMaterials={(selectedPosts) => { void handleOrganizeDiaryMaterials(selectedPosts) }}
            onSearchFocus={() => searchInputRef.current?.focus()}
          />
        </section>
      ) : isAnnotationsView ? (
        <section className="admin-shell__viewport">
          {successMessage ? <p className="success-message">{successMessage}</p> : null}
          {error ? <p className="error-message">{error}</p> : null}
          <ReadLaterAnnotationsView
            annotations={readLaterAnnotationIndex}
            isLoading={isAnnotationIndexing}
            search={search}
            onSearchChange={setSearch}
            onOpenAnnotation={(annotation) => { void handleOpenReadLaterAnnotation(annotation) }}
          />
        </section>
      ) : (
        <div className={`admin-layout${isReadLaterPreview ? ' admin-layout--reader' : ''}`}>
          <PostListPane
            posts={filteredPosts}
            hidden={isPostListHidden}
            contentType={contentType}
            activePostPath={activePostPath}
            document={document}
            documentContentFormat={documentContentFormat}
            activeOutlineTargetId={activeOutlineTargetId}
            isDeleting={isDeletingPost}
            deletingPostPath={deletingPostPath}
            isTogglingPinned={isTogglingPinned}
            togglingPinnedPostPath={togglingPinnedPostPath}
            disabledPinnedPostPath={document?.path && !canNavigateAway ? document.path : null}
            onOpenPost={handleOpenPost}
            onDeletePost={handleDeletePost}
            onTogglePinned={handleTogglePinned}
            onBackToList={handleBackToDashboard}
            onNavigateOutline={handleNavigateOutline}
            isTopBarHidden={hideTopBar}
            onToggleTopBar={() => setIsReadLaterTopBarHidden((current) => !current)}
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
                      contentFormat={documentContentFormat}
                      desc={document.frontmatter.desc}
                      cover={document.frontmatter.cover}
                      sourceName={document.frontmatter.source_name}
                      externalUrl={document.frontmatter.external_url}
                      readingStatus={document.frontmatter.reading_status}
                      sourceType={document.frontmatter.source_type}
                      sourceTitle={document.frontmatter.source_title}
                      sourcePath={document.frontmatter.source_path}
                      sourceUrl={document.frontmatter.source_url}
                      contentType={document.contentType}
                      previewImageUrls={previewImageUrls}
                      annotations={readLaterAnnotations}
                      activeAnnotationId={activeAnnotationId}
                      annotationScrollRequest={annotationScrollRequest}
                      navigationRequest={readerNavigationRequest}
                      onActiveOutlineTargetChange={setActiveOutlineTargetId}
                      onCreateAnnotation={handleCreateReadLaterAnnotation}
                      onCreateKnowledge={handleCreateKnowledgeFromSelection}
                      onSelectAnnotation={handleSelectAnnotation}
                      onClearActiveAnnotation={handleClearActiveAnnotation}
                      onDeleteAnnotation={handleDeleteAnnotation}
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
                  <p>{loadingLabel}</p>
                </section>
              ) : (
                <EmptyState error={error} />
              )}
            </div>
            {showSettingsPanel ? (
              <SettingsPanel
                document={document}
                validationErrors={validationErrors}
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
              ? `确定将${TAXONOMY_LABELS[taxonomyConfirm.type]}「${taxonomyConfirm.oldName}」重命名为「${taxonomyConfirm.newName}」吗？这将修改 ${taxonomyConfirm.affectedPaths.length} ${indexedCountUnit}${indexedLabel}。`
              : `确定删除${TAXONOMY_LABELS[taxonomyConfirm.type]}「${taxonomyConfirm.name}」吗？这将从 ${taxonomyConfirm.affectedPaths.length} ${indexedCountUnit}${indexedLabel}中移除该${TAXONOMY_LABELS[taxonomyConfirm.type]}。`
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
          title={`删除${getDeleteContentTypeLabel(getContentTypeFromPostLike(postDeleteConfirm.post))}`}
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
