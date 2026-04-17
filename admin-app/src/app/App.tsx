import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchPostFile, GitHubAuthError, GitHubConflictError, savePostFile, uploadImageFile } from './github-client'
import { buildImageMarkdown, buildImageUploadDescriptor } from './editor/image-upload'
import MarkdownEditor from './editor/markdown-editor'
import PreviewPane from './editor/preview-pane'
import { useEditorDocument } from './editor/use-editor-document'
import TopBar from './layout/top-bar'
import PostListPane from './layout/post-list-pane'
import SettingsPanel from './layout/settings-panel'
import { getNextImmersiveMode } from './layout/immersive-mode'
import LoginGate from './login-gate'
import { createNewPost } from './posts/new-post'
import { buildPostIndex, collectPostIndexFacets, filterPostIndex, parsePostIndexItem, sortPostIndex } from './posts/index-posts'
import { parsePost } from './posts/parse-post'
import type { ParsedPost } from './posts/parse-post'
import { serializePost } from './posts/serialize-post'
import type { PostIndexItem } from './posts/post-types'
import { AuthError, createSessionStore, loginWithPopup, readStoredSession } from './session'

const SAVE_SUCCESS_MESSAGE = '已保存。'

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

export default function App() {
  const sessionStore = useMemo(() => createSessionStore(readStoredSession()), [])
  const [session, setSession] = useState(() => sessionStore.getSession())
  const [posts, setPosts] = useState<PostIndexItem[]>([])
  const [activePostPath, setActivePostPath] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isImmersive, setIsImmersive] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isIndexing, setIsIndexing] = useState(false)
  const [isOpeningPost, setIsOpeningPost] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [previewImageUrls, setPreviewImageUrls] = useState<Record<string, string>>({})
  const previewObjectUrlsRef = useRef<string[]>([])
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
        const indexedPosts = await buildPostIndex(session)
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

        setError(caughtError instanceof Error ? caughtError.message : '加载文章列表失败。')
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
  }, [session, sessionStore])

  const applyDocument = (nextPost: ParsedPost) => {
    resetPreviewImageUrls()
    replaceDocument(nextPost)
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

    applyDocument(createNewPost())
  }

  const handleOpenPost = async (post: PostIndexItem) => {
    if (!session || !confirmNavigation()) {
      return
    }

    setIsOpeningPost(true)
    setActivePostPath(post.path)
    setSuccessMessage(null)
    setError(null)

    try {
      const file = await fetchPostFile(session, post.path)
      applyDocument(parsePost(file))
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        handleAuthExpiry(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : '打开文章失败。')
    } finally {
      setIsOpeningPost(false)
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
      const content = serializePost(document)
      const savedFile = await savePostFile(session, {
        path: document.path,
        sha: document.sha || undefined,
        content,
      })
      const savedDocument: ParsedPost = {
        ...document,
        path: savedFile.path,
        sha: savedFile.sha,
      }
      const savedPostIndexItem = parsePostIndexItem({
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

      setError(caughtError instanceof Error ? caughtError.message : '保存文章失败。')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTogglePreview = () => {
    if (!document) {
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

  const saveLabel = isSaving ? '保存中…' : document ? (isDirty ? '保存' : '已保存') : '保存'
  const isSaveDisabled = !document || isSaving || !isDirty
  const isSaveQuiet = Boolean(document) && !isDirty && !isSaving

  const status = isSaving && document
    ? `正在保存 ${document.path}`
    : isOpeningPost && activePostPath
      ? `正在打开 ${activePostPath}`
      : document
        ? isDirty
          ? `未保存修改 · ${document.path}`
          : `编辑中 · ${document.path}`
        : isIndexing
          ? '正在加载文章…'
          : '已就绪'

  if (!session) {
    return <LoginGate isLoading={isLoading} error={error} onLogin={handleLogin} />
  }

  const isPreviewing = mode === 'preview'
  const showImmersiveCanvas = Boolean(document) && (isImmersive || isPreviewing)
  const isPostListHidden = showImmersiveCanvas
  const showSettingsPanel = Boolean(document) && !showImmersiveCanvas
  const showDocumentFrame = Boolean(document) && !showImmersiveCanvas

  return (
    <main className={`admin-shell${showImmersiveCanvas ? ' admin-shell--immersive' : ''}`}>
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
        saveLabel={saveLabel}
        isSaveDisabled={isSaveDisabled}
        isSaveQuiet={isSaveQuiet}
        status={status}
        onLogout={handleLogout}
      />
      <div className="admin-layout">
        <PostListPane
          posts={filteredPosts}
          hidden={isPostListHidden}
          activePostPath={activePostPath}
          onOpenPost={handleOpenPost}
        />
        <section className={`editor-layout${showSettingsPanel ? '' : ' editor-layout--single'}`}>
          <div className="editor-stack">
            {document ? (
              <>
                {showDocumentFrame ? (
                  <section className="editor-frame">
                    <div className="editor-frame__header">
                      <div>
                        <p className="editor-frame__eyebrow">当前稿件</p>
                        <h1>{document.frontmatter.title?.trim() || '未命名草稿'}</h1>
                      </div>
                    </div>
                    <div className="editor-frame__meta">
                      <span>{document.path}</span>
                      <span>{mode === 'preview' ? '预览模式' : '编辑模式'}</span>
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
                    previewImageUrls={previewImageUrls}
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
                <p>正在加载文章…</p>
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
              availableCategories={availableCategories}
              availableTags={availableTags}
              onFieldChange={handleFrontmatterChange}
            />
          ) : null}
        </section>
      </div>
    </main>
  )
}
