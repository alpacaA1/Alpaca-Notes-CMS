import { useEffect, useMemo, useState } from 'react'
import { fetchPostFile, GitHubAuthError, GitHubConflictError, savePostFile } from './github-client'
import MarkdownEditor from './editor/markdown-editor'
import RichEditor from './editor/rich-editor'
import UnsupportedBanner from './editor/unsupported-banner'
import PreviewPane from './editor/preview-pane'
import { markdownToRichText, detectRichMarkdownSupport, richTextToMarkdown } from './editor/rich-markdown'
import { useEditorDocument, type EditorMode } from './editor/use-editor-document'
import TopBar from './layout/top-bar'
import PostListPane from './layout/post-list-pane'
import SettingsPanel from './layout/settings-panel'
import { getNextImmersiveMode } from './layout/immersive-mode'
import LoginGate from './login-gate'
import { createNewPost } from './posts/new-post'
import { buildPostIndex } from './posts/index-posts'
import { parsePost } from './posts/parse-post'
import type { ParsedPost } from './posts/parse-post'
import { serializePost } from './posts/serialize-post'
import type { PostIndexItem } from './posts/post-types'
import { AuthError, createSessionStore, loginWithPopup, readStoredSession } from './session'

type EditorChoice = Exclude<EditorMode, 'preview'>

function EmptyState({ error }: { error: string | null }) {
  return (
    <section className="hero-card">
      <p className="eyebrow">Custom admin</p>
      <h1>Alpaca Notes Admin</h1>
      <p>Select a post to start editing, or create a new draft.</p>
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
  const [lastEditorMode, setLastEditorMode] = useState<EditorChoice>('markdown')
  const [unsupportedMessage, setUnsupportedMessage] = useState<string | null>(null)
  const {
    document,
    mode,
    isDirty,
    publishLocked,
    hasUnsupportedRichContent,
    validationErrors,
    canNavigateAway,
    setMode,
    replaceDocument,
    updateFrontmatter,
    updateBody,
    validate,
    markSaved,
    setHasUnsupportedRichContent,
  } = useEditorDocument()

  const filteredPosts = posts.filter((post) => {
    const normalizedSearch = search.trim().toLowerCase()
    if (!normalizedSearch) {
      return true
    }

    return (
      post.title.toLowerCase().includes(normalizedSearch) ||
      (post.permalink || '').toLowerCase().includes(normalizedSearch)
    )
  })

  const documentBody = document?.body || null

  useEffect(() => {
    if (!document) {
      setHasUnsupportedRichContent(false)
      setUnsupportedMessage(null)
      return
    }

    const support = detectRichMarkdownSupport(document.body)
    setHasUnsupportedRichContent(!support.supported)
    setUnsupportedMessage(support.reason)

    if (!support.supported && mode === 'rich') {
      setLastEditorMode('markdown')
      setMode('markdown')
    }
  }, [document, documentBody, mode])

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
          sessionStore.logout()
          setSession(null)
          setPosts([])
          setActivePostPath(null)
          replaceDocument(null)
          setError(caughtError.message)
          return
        }

        setError(caughtError instanceof Error ? caughtError.message : 'Failed to load posts.')
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
    const support = detectRichMarkdownSupport(nextPost.body)
    const nextMode: EditorChoice = support.supported ? 'rich' : 'markdown'

    replaceDocument(nextPost)
    setActivePostPath(nextPost.path)
    setLastEditorMode(nextMode)
    setMode(nextMode)
    setHasUnsupportedRichContent(!support.supported)
    setUnsupportedMessage(support.reason)
    setError(null)
  }

  const confirmNavigation = () => {
    if (canNavigateAway) {
      return true
    }

    return window.confirm('You have unsaved changes. Discard them and continue?')
  }

  const handleLogin = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const nextSession = await loginWithPopup()
      sessionStore.setSession(nextSession)
      setSession(nextSession)
    } catch (caughtError) {
      const message =
        caughtError instanceof AuthError ? caughtError.message : 'GitHub authorization failed.'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = () => {
    sessionStore.logout()
    setSession(null)
    setPosts([])
    setActivePostPath(null)
    setIsOpeningPost(false)
    setError(null)
    replaceDocument(null)
    setLastEditorMode('markdown')
    setUnsupportedMessage(null)
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
    setError(null)

    try {
      const file = await fetchPostFile(session, post.path)
      applyDocument(parsePost(file))
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        sessionStore.logout()
        setSession(null)
        setPosts([])
        setActivePostPath(null)
        replaceDocument(null)
        setError(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : 'Failed to open post.')
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
      const nextPosts = await buildPostIndex(session)
      markSaved(savedDocument)
      setActivePostPath(savedFile.path)
      setPosts(nextPosts)
      setError('Saved.')
    } catch (caughtError) {
      if (caughtError instanceof GitHubAuthError) {
        sessionStore.logout()
        setSession(null)
        setPosts([])
        setActivePostPath(null)
        replaceDocument(null)
        setError(caughtError.message)
        return
      }

      if (caughtError instanceof GitHubConflictError) {
        setError(caughtError.message)
        return
      }

      setError(caughtError instanceof Error ? caughtError.message : 'Failed to save post.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTogglePreview = () => {
    if (!document) {
      return
    }

    if (mode === 'preview') {
      setMode(lastEditorMode)
      return
    }

    setLastEditorMode(mode)
    setMode('preview')
  }

  const handleSelectMode = (nextMode: EditorChoice) => {
    if (!document) {
      return
    }

    if (nextMode === 'rich' && hasUnsupportedRichContent) {
      return
    }

    setLastEditorMode(nextMode)
    setMode(nextMode)
  }

  const handleEditorChange = (value: string) => {
    if (mode === 'rich') {
      updateBody(richTextToMarkdown(value))
      return
    }

    updateBody(value)
  }

  const status = isSaving && document
    ? `Saving ${document.path}`
    : isOpeningPost && activePostPath
      ? `Opening ${activePostPath}`
      : document
        ? isDirty
          ? `Unsaved changes · ${document.path}`
          : `Editing ${document.path}`
        : isIndexing
          ? 'Loading posts…'
          : 'Ready'

  if (!session) {
    return <LoginGate isLoading={isLoading} error={error} onLogin={handleLogin} />
  }

  return (
    <main className="admin-shell">
      <TopBar
        search={search}
        onSearchChange={setSearch}
        onNewPost={handleNewPost}
        onSave={() => {
          void handleSave()
        }}
        onTogglePreview={handleTogglePreview}
        onToggleImmersive={() => setIsImmersive((current) => getNextImmersiveMode(current))}
        isPreviewing={mode === 'preview'}
        isImmersive={isImmersive}
        status={status}
        onLogout={handleLogout}
      />
      <div className="admin-layout">
        <PostListPane posts={filteredPosts} hidden={isImmersive} onOpenPost={handleOpenPost} />
        <section className="editor-layout">
          <div className="editor-stack">
            {document ? (
              <>
                <div className="editor-mode-bar">
                  <button
                    type="button"
                    aria-pressed={mode === 'rich'}
                    disabled={hasUnsupportedRichContent}
                    onClick={() => handleSelectMode('rich')}
                  >
                    Rich
                  </button>
                  <button
                    type="button"
                    aria-pressed={mode === 'markdown'}
                    onClick={() => handleSelectMode('markdown')}
                  >
                    Markdown
                  </button>
                </div>
                {error ? (
                  <p className={error === 'Saved.' ? 'success-message' : 'error-message'}>{error}</p>
                ) : null}
                {unsupportedMessage ? <UnsupportedBanner message={unsupportedMessage} /> : null}
                {mode === 'preview' ? (
                  <PreviewPane markdown={document.body} />
                ) : mode === 'rich' ? (
                  <RichEditor
                    value={markdownToRichText(document.body)}
                    onChange={handleEditorChange}
                  />
                ) : (
                  <MarkdownEditor value={document.body} onChange={handleEditorChange} />
                )}
              </>
            ) : isOpeningPost ? (
              <section className="hero-card">
                <p>Loading post…</p>
              </section>
            ) : (
              <EmptyState error={error} />
            )}
          </div>
          <SettingsPanel
            document={document}
            validationErrors={validationErrors}
            publishLocked={publishLocked}
            onFieldChange={updateFrontmatter}
          />
        </section>
      </div>
    </main>
  )
}
