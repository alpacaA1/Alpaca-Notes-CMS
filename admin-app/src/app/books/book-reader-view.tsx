import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import type {
  BookAnnotation,
  BookRelocateDetail,
  BookSelectionInfo,
  BookTocItem,
  FoliateViewElement,
  StoredBookMeta,
} from './book-types'
import {
  deleteBookAnnotation,
  listBookAnnotations,
  putBookAnnotation,
  putBookMeta,
} from './book-store'
import {
  BOOK_HIGHLIGHT_COLOR,
  createBookAnnotationId,
  formatBookProgress,
  normalizeBookQuote,
} from './book-utils'

type BookReaderViewProps = {
  meta: StoredBookMeta
  fileBlob: Blob
  onBack: () => void
  onProgressChange: (meta: StoredBookMeta) => void
  onAnnotationsChange: (bookId: string, count: number) => void
  onImmersiveChange?: (isImmersive: boolean) => void
}

type ReaderTab = 'info' | 'notes'

const READER_STYLES = `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
        font-family: 'Noto Serif SC', 'Songti SC', 'Source Han Serif SC', 'SimSun', serif;
    }
    p, li, blockquote, dd {
        line-height: 1.8;
        text-align: justify;
        widows: 2;
    }
    [align="left"] { text-align: left; }
    [align="right"] { text-align: right; }
    [align="center"] { text-align: center; }
    [align="justify"] { text-align: justify; }
    pre {
        white-space: pre-wrap !important;
    }
    img {
        max-width: 100% !important;
    }
    aside[epub|type~="endnote"],
    aside[epub|type~="footnote"],
    aside[epub|type~="note"],
    aside[epub|type~="rearnote"] {
        display: none;
    }
`

function formatBookDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function resolveFrameOffset(doc: Document) {
  let left = 0
  let top = 0
  let win: (Window & { frameElement?: Element | null }) | null = doc.defaultView
  while (win && win.frameElement) {
    const rect = (win.frameElement as HTMLElement).getBoundingClientRect()
    left += rect.left
    top += rect.top
    win = win.parent as typeof win
  }
  return { left, top }
}

function TocList({
  items,
  currentChapter,
  onNavigate,
  depth = 0,
}: {
  items: BookTocItem[]
  currentChapter: string
  onNavigate: (href: string) => void
  depth?: number
}) {
  return (
    <ul className={`book-reader__toc-list${depth > 0 ? ' book-reader__toc-list--nested' : ''}`}>
      {items.map((item, index) => {
        const label = (item.label || '').trim() || `章节 ${index + 1}`
        const isActive = label === currentChapter
        return (
          <li key={`${label}-${index}`}>
            {item.href ? (
              <button
                type="button"
                className={`book-reader__toc-item${isActive ? ' is-active' : ''}`}
                onClick={() => onNavigate(item.href as string)}
              >
                {label}
              </button>
            ) : (
              <span className="book-reader__toc-item book-reader__toc-item--static">{label}</span>
            )}
            {Array.isArray(item.subitems) && item.subitems.length > 0 ? (
              <TocList
                items={item.subitems as BookTocItem[]}
                currentChapter={currentChapter}
                onNavigate={onNavigate}
                depth={depth + 1}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export default function BookReaderView({
  meta,
  fileBlob,
  onBack,
  onProgressChange,
  onAnnotationsChange,
  onImmersiveChange,
}: BookReaderViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const rightMountRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<FoliateViewElement | null>(null)
  const annotationsRef = useRef<BookAnnotation[]>([])
  const metaRef = useRef<StoredBookMeta>(meta)
  const chapterRef = useRef('')
  const persistTimerRef = useRef<number | null>(null)
  const selectionDebounceRef = useRef<number | null>(null)
  const annotationCardRefs = useRef(new Map<string, HTMLElement | null>())
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toc, setToc] = useState<BookTocItem[]>([])
  const [currentChapter, setCurrentChapter] = useState('')
  const [fraction, setFraction] = useState(meta.progressFraction)
  const [annotations, setAnnotations] = useState<BookAnnotation[]>([])
  const [tab, setTab] = useState<ReaderTab>('notes')
  const [selectionInfo, setSelectionInfo] = useState<BookSelectionInfo | null>(null)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [isImmersive, setIsImmersive] = useState(false)
  const [isTocOpen, setIsTocOpen] = useState(true)

  metaRef.current = meta
  annotationsRef.current = annotations

  useEffect(() => () => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current)
    }
    if (selectionDebounceRef.current !== null) {
      window.clearTimeout(selectionDebounceRef.current)
    }
  }, [])

  useEffect(() => {
    onImmersiveChange?.(isImmersive)
  }, [isImmersive, onImmersiveChange])

  useEffect(() => {
    if (!isReady) {
      return
    }
    const view = viewRef.current
    if (!view?.renderer) {
      return
    }
    // 进入/退出聚焦后画布尺寸变化，foliate 的 ResizeObserver 偶尔不触发重新分栏，主动重排一次。
    const handle = window.setTimeout(() => {
      try {
        view.renderer?.render?.()
      } catch {
        // 忽略重排异常
      }
    }, 80)
    return () => {
      window.clearTimeout(handle)
    }
  }, [isImmersive, isReady])

  useEffect(() => {
    let cancelled = false
    let view: FoliateViewElement | null = null
    let rightView: FoliateViewElement | null = null
    let isRightViewReady = false
    let rightSyncVersion = 0

    const configurePageView = (pageView: FoliateViewElement) => {
      pageView.style.width = '100%'
      pageView.style.height = '100%'
      pageView.style.display = 'block'
      pageView.renderer?.setAttribute('flow', 'paginated')
      pageView.renderer?.setAttribute('max-column-count', '1')
      pageView.renderer?.setAttribute('max-inline-size', '560px')
      pageView.renderer?.setAttribute('gap', '0%')
      pageView.renderer?.setAttribute('margin', '28px')
      pageView.renderer?.setStyles?.(READER_STYLES)
    }

    const syncRightPage = async (cfi?: string | null) => {
      if (!rightView || !isRightViewReady || !cfi) {
        return
      }
      const version = ++rightSyncVersion
      await rightView.goTo(cfi)
      if (cancelled || version !== rightSyncVersion) {
        return
      }
      await rightView.next()
    }

    const setup = async () => {
      try {
        await import('foliate-js/view.js')
        const { Overlayer } = await import('foliate-js/overlayer.js')
        if (cancelled || !mountRef.current || !rightMountRef.current) {
          return
        }

        view = document.createElement('foliate-view') as FoliateViewElement
        rightView = document.createElement('foliate-view') as FoliateViewElement
        mountRef.current.append(view)
        rightMountRef.current.append(rightView)
        viewRef.current = view

        const storedAnnotations = await listBookAnnotations(meta.id)
        if (!cancelled) {
          annotationsRef.current = storedAnnotations
          setAnnotations(storedAnnotations)
        }

        // IndexedDB 取回的是无名 Blob，foliate-js 解析时会读取 file.name，包一层 File。
        const namedFile = new File([fileBlob], `${meta.title || 'book'}.epub`, { type: 'application/epub+zip' })
        const rightNamedFile = new File([fileBlob], `${meta.title || 'book'}.epub`, { type: 'application/epub+zip' })
        await Promise.all([view.open(namedFile), rightView.open(rightNamedFile)])
        if (cancelled) {
          return
        }

        configurePageView(view)
        configurePageView(rightView)

        const handleKeydown = (event: KeyboardEvent) => {
          const target = event.target as HTMLElement | null
          if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
            return
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            void view?.goLeft()
          } else if (event.key === 'ArrowRight') {
            event.preventDefault()
            void view?.goRight()
          } else if (event.key === 'Escape') {
            setIsImmersive(false)
            setSelectionInfo(null)
          }
        }

        view.addEventListener('load', (event) => {
          const { doc, index } = (event as CustomEvent<{ doc: Document; index: number }>).detail
          doc.addEventListener('keydown', handleKeydown)
          doc.addEventListener('selectionchange', () => {
            if (selectionDebounceRef.current !== null) {
              window.clearTimeout(selectionDebounceRef.current)
            }
            selectionDebounceRef.current = window.setTimeout(() => {
              selectionDebounceRef.current = null
              const selection = doc.defaultView?.getSelection()
              if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                return
              }
              const quote = normalizeBookQuote(selection.toString())
              if (!quote) {
                return
              }
              try {
                const range = selection.getRangeAt(0)
                const value = view?.getCFI(index, range)
                if (!value) {
                  return
                }
                const rect = range.getBoundingClientRect()
                const offset = resolveFrameOffset(doc)
                setSelectionInfo({
                  value,
                  quote,
                  chapter: chapterRef.current,
                  rect: {
                    left: offset.left + rect.left,
                    top: offset.top + rect.top,
                    width: rect.width,
                    height: rect.height,
                  },
                })
              } catch {
                // 忽略无法生成 CFI 的选区
              }
            }, 120)
          })
        })

        view.addEventListener('relocate', (event) => {
          const detail = (event as CustomEvent<BookRelocateDetail>).detail
          const nextFraction = typeof detail.fraction === 'number' ? detail.fraction : 0
          const nextChapter = detail.tocItem?.label?.trim() ?? ''
          chapterRef.current = nextChapter
          setCurrentChapter(nextChapter)
          setFraction(nextFraction)
          setSelectionInfo(null)

          if (persistTimerRef.current !== null) {
            window.clearTimeout(persistTimerRef.current)
          }
          const cfi = detail.cfi ?? null
          void syncRightPage(cfi).catch(() => {
            // 右页同步失败时保持当前页，避免影响左页阅读和进度保存。
          })
          persistTimerRef.current = window.setTimeout(() => {
            persistTimerRef.current = null
            const latest = metaRef.current
            const nextMeta: StoredBookMeta = {
              ...latest,
              progressFraction: nextFraction,
              progressCfi: cfi ?? latest.progressCfi,
              lastOpenedAt: new Date().toISOString(),
            }
            void putBookMeta(nextMeta).then(() => onProgressChange(nextMeta))
          }, 1200)
        })

        view.addEventListener('create-overlay', () => {
          // 新章节渲染完成后重绘全部批注；addAnnotation 会先 remove 再 add，天然幂等。
          for (const annotation of annotationsRef.current) {
            void view?.addAnnotation(annotation)
          }
        })

        rightView.addEventListener('create-overlay', () => {
          for (const annotation of annotationsRef.current) {
            void rightView?.addAnnotation(annotation)
          }
        })

        rightView.addEventListener('draw-annotation', (event) => {
          const { draw, annotation } = (event as CustomEvent<{
            draw: (func: unknown, options?: Record<string, unknown>) => void
            annotation: { color?: string }
          }>).detail
          draw(Overlayer.highlight, { color: annotation.color || BOOK_HIGHLIGHT_COLOR })
        })

        view.addEventListener('draw-annotation', (event) => {
          const { draw, annotation } = (event as CustomEvent<{
            draw: (func: unknown, options?: Record<string, unknown>) => void
            annotation: { color?: string }
          }>).detail
          draw(Overlayer.highlight, { color: annotation.color || BOOK_HIGHLIGHT_COLOR })
        })

        view.addEventListener('show-annotation', (event) => {
          const { value } = (event as CustomEvent<{ value: string }>).detail
          const annotation = annotationsRef.current.find((item) => item.value === value)
          if (!annotation) {
            return
          }
          setActiveAnnotationId(annotation.id)
          setTab('notes')
          window.setTimeout(() => {
            annotationCardRefs.current.get(annotation.id)?.scrollIntoView({ block: 'nearest' })
          }, 50)
        })

        setToc((view.book?.toc ?? []) as BookTocItem[])
        await view.init({
          lastLocation: meta.progressCfi || undefined,
          showTextStart: false,
        })
        await rightView.init({
          lastLocation: view.lastLocation?.cfi || meta.progressCfi || undefined,
          showTextStart: false,
        })
        isRightViewReady = true
        await syncRightPage(view.lastLocation?.cfi || meta.progressCfi)

        if (!cancelled) {
          setIsReady(true)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : '打开书籍失败。')
        }
      }
    }

    void setup()

    return () => {
      cancelled = true
      try {
        view?.close()
        view?.remove()
        rightView?.close()
        rightView?.remove()
      } catch {
        // 忽略卸载异常
      }
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id, fileBlob])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        void viewRef.current?.goLeft()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        void viewRef.current?.goRight()
      } else if (event.key === 'Escape') {
        setIsImmersive(false)
        setSelectionInfo(null)
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  const notifyAnnotationsChanged = useCallback((next: BookAnnotation[]) => {
    annotationsRef.current = next
    setAnnotations(next)
    onAnnotationsChange(meta.id, next.length)
  }, [meta.id, onAnnotationsChange])

  const handleCreateAnnotation = useCallback((withNote: boolean) => {
    const view = viewRef.current
    if (!view || !selectionInfo) {
      return
    }

    const now = new Date().toISOString()
    const annotation: BookAnnotation = {
      id: createBookAnnotationId(),
      bookId: meta.id,
      value: selectionInfo.value,
      color: BOOK_HIGHLIGHT_COLOR,
      note: '',
      quote: selectionInfo.quote,
      chapter: selectionInfo.chapter || chapterRef.current,
      createdAt: now,
      updatedAt: now,
    }

    void view.addAnnotation(annotation)
    view.deselect()
    setSelectionInfo(null)
    void putBookAnnotation(annotation).then(async () => {
      const next = await listBookAnnotations(meta.id)
      notifyAnnotationsChanged(next)
    })

    if (withNote) {
      setTab('notes')
      setActiveAnnotationId(annotation.id)
      setEditingNoteId(annotation.id)
      setNoteDraft('')
      window.setTimeout(() => {
        annotationCardRefs.current.get(annotation.id)?.scrollIntoView({ block: 'nearest' })
      }, 80)
    }
  }, [meta.id, notifyAnnotationsChanged, selectionInfo])

  const handleDeleteAnnotation = useCallback((annotation: BookAnnotation) => {
    const view = viewRef.current
    void view?.deleteAnnotation(annotation)
    void deleteBookAnnotation(annotation.id).then(async () => {
      const next = await listBookAnnotations(meta.id)
      notifyAnnotationsChanged(next)
    })
    if (activeAnnotationId === annotation.id) {
      setActiveAnnotationId(null)
    }
    if (editingNoteId === annotation.id) {
      setEditingNoteId(null)
    }
  }, [activeAnnotationId, editingNoteId, meta.id, notifyAnnotationsChanged])

  const handleSaveNote = useCallback((annotation: BookAnnotation) => {
    const next: BookAnnotation = {
      ...annotation,
      note: noteDraft.trim(),
      updatedAt: new Date().toISOString(),
    }
    void viewRef.current?.addAnnotation(next)
    void putBookAnnotation(next).then(async () => {
      const list = await listBookAnnotations(meta.id)
      notifyAnnotationsChanged(list)
    })
    setEditingNoteId(null)
    setNoteDraft('')
  }, [meta.id, notifyAnnotationsChanged, noteDraft])

  const handleLocateAnnotation = useCallback((annotation: BookAnnotation) => {
    setActiveAnnotationId(annotation.id)
    void viewRef.current?.showAnnotation(annotation)
  }, [])

  const handleNavigateToc = useCallback((href: string) => {
    void viewRef.current?.goTo(href)
  }, [])

  const handleBackToTop = useCallback(() => {
    void viewRef.current?.goToFraction(0)
  }, [])

  const handleProgressSlider = useCallback((value: number) => {
    void viewRef.current?.goToFraction(value)
  }, [])

  const handleTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    const touch = event.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (event: ReactTouchEvent<HTMLElement>) => {
    const start = touchStartRef.current
    touchStartRef.current = null
    if (!start) {
      return
    }
    const touch = event.changedTouches[0]
    const dx = touch.clientX - start.x
    const dy = touch.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) {
      return
    }
    if (dx < 0) {
      void viewRef.current?.goRight()
    } else {
      void viewRef.current?.goLeft()
    }
  }

  const selectionPopoverStyle = useMemo(() => {
    if (!selectionInfo) {
      return undefined
    }
    const center = Math.min(Math.max(selectionInfo.rect.left + selectionInfo.rect.width / 2, 88), window.innerWidth - 88)
    const showBelow = selectionInfo.rect.top < 72
    return {
      left: `${center}px`,
      top: showBelow ? `${selectionInfo.rect.top + selectionInfo.rect.height + 10}px` : `${selectionInfo.rect.top - 10}px`,
      transform: showBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)',
    }
  }, [selectionInfo])

  const notedCount = useMemo(() => annotations.filter((annotation) => annotation.note.trim().length > 0).length, [annotations])

  return (
    <div className={`book-reader${isImmersive ? ' book-reader--immersive' : ''}${isReady ? ' is-ready' : ''}`}>
      {!isImmersive ? (
        <div className="book-reader__header">
          <button type="button" className="book-reader__back-btn" onClick={onBack}>
            ← 返回书架
          </button>
          <div className="book-reader__header-title">
            <strong title={meta.title}>{meta.title}</strong>
            {currentChapter ? <span title={currentChapter}>{currentChapter}</span> : null}
          </div>
          <div className="book-reader__header-actions">
            <button
              type="button"
              className={`book-reader__header-btn${isTocOpen ? ' is-active' : ''}`}
              aria-pressed={isTocOpen}
              onClick={() => setIsTocOpen((current) => !current)}
            >
              目录
            </button>
            <button
              type="button"
              className="book-reader__header-btn"
              onClick={() => setIsImmersive(true)}
            >
              聚焦
            </button>
          </div>
        </div>
      ) : null}

      <div className="book-reader__body">
        {!isImmersive && isTocOpen ? (
          <aside className="book-reader__toc" aria-label="内容目录">
            <div className="book-reader__toc-header">
              <span>内容目录</span>
              <button type="button" className="book-reader__toc-top" onClick={handleBackToTop}>
                回到顶部
              </button>
            </div>
            {toc.length > 0 ? (
              <div className="book-reader__toc-body">
                <TocList items={toc} currentChapter={currentChapter} onNavigate={handleNavigateToc} />
              </div>
            ) : (
              <p className="book-reader__toc-empty">这本书没有提供目录。</p>
            )}
          </aside>
        ) : null}

        <section
          className="book-reader__canvas"
          aria-label="书页"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="book-reader__spread">
            <div ref={mountRef} className="book-reader__view" />
            <div ref={rightMountRef} className="book-reader__view book-reader__view--right" />
          </div>
          {!isReady && !loadError ? (
            <div className="book-reader__loading">
              <div className="book-reader__loading-bar" />
              <p>正在解析书籍…</p>
            </div>
          ) : null}
          {loadError ? (
            <div className="book-reader__loading">
              <p className="book-reader__load-error">{loadError}</p>
              <button type="button" className="book-reader__back-btn" onClick={onBack}>返回书架</button>
            </div>
          ) : null}
        </section>

        {!isImmersive ? (
          <aside className="book-reader__sidebar" aria-label="书籍侧栏">
            <div className="book-reader__tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'info'}
                className={`book-reader__tab${tab === 'info' ? ' is-active' : ''}`}
                onClick={() => setTab('info')}
              >
                信息
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'notes'}
                className={`book-reader__tab${tab === 'notes' ? ' is-active' : ''}`}
                onClick={() => setTab('notes')}
              >
                评论{annotations.length > 0 ? ` · ${annotations.length}` : ''}
              </button>
            </div>

            {tab === 'info' ? (
              <div className="book-reader__info" role="tabpanel">
                <dl>
                  <div><dt>书名</dt><dd>{meta.title}</dd></div>
                  <div><dt>作者</dt><dd>{meta.creator}</dd></div>
                  <div><dt>当前章节</dt><dd>{currentChapter || '—'}</dd></div>
                  <div><dt>阅读进度</dt><dd>{formatBookProgress(fraction)}</dd></div>
                  <div><dt>批注</dt><dd>{annotations.length} 条 · {notedCount} 条评论</dd></div>
                  <div><dt>导入时间</dt><dd>{formatBookDateTime(meta.addedAt) || '—'}</dd></div>
                </dl>
                <p className="book-reader__info-hint">书籍文件只保存在本机浏览器，不会上传到仓库。</p>
              </div>
            ) : (
              <div className="book-reader__notes" role="tabpanel">
                {annotations.length === 0 ? (
                  <div className="book-reader__notes-empty">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    </svg>
                    <p>选中正文即可开始批注</p>
                  </div>
                ) : (
                  <ul className="book-reader__notes-list">
                    {annotations.map((annotation) => {
                      const isActive = annotation.id === activeAnnotationId
                      const isEditing = annotation.id === editingNoteId
                      return (
                        <li key={annotation.id}>
                          <article
                            ref={(element) => {
                              annotationCardRefs.current.set(annotation.id, element)
                            }}
                            className={`book-reader__note-card${isActive ? ' is-active' : ''}`}
                          >
                            <button
                              type="button"
                              className="book-reader__note-quote"
                              onClick={() => handleLocateAnnotation(annotation)}
                              title="定位到原文"
                            >
                              {annotation.quote}
                            </button>
                            <p className="book-reader__note-meta">
                              {annotation.chapter || '未知章节'} · {formatBookDateTime(annotation.updatedAt)}
                            </p>
                            {isEditing ? (
                              <div className="book-reader__note-editor">
                                <textarea
                                  value={noteDraft}
                                  autoFocus
                                  rows={3}
                                  placeholder="写下你的想法…"
                                  onChange={(event) => setNoteDraft(event.target.value)}
                                />
                                <div className="book-reader__note-editor-actions">
                                  <button type="button" onClick={() => handleSaveNote(annotation)}>保存</button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingNoteId(null)
                                      setNoteDraft('')
                                    }}
                                  >
                                    取消
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className={`book-reader__note-text${annotation.note.trim() ? '' : ' book-reader__note-text--empty'}`}>
                                {annotation.note.trim() || '暂未写评论'}
                              </p>
                            )}
                            {!isEditing ? (
                              <div className="book-reader__note-actions">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingNoteId(annotation.id)
                                    setNoteDraft(annotation.note)
                                    setActiveAnnotationId(annotation.id)
                                  }}
                                >
                                  {annotation.note.trim() ? '编辑评论' : '写评论'}
                                </button>
                                <button type="button" onClick={() => handleLocateAnnotation(annotation)}>定位</button>
                                <button
                                  type="button"
                                  className="book-reader__note-delete"
                                  onClick={() => handleDeleteAnnotation(annotation)}
                                >
                                  删除
                                </button>
                              </div>
                            ) : null}
                          </article>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {isReady ? (
        <div className={`book-reader__pager${isImmersive ? ' book-reader__pager--immersive' : ''}`}>
          <button type="button" aria-label="上一页" onClick={() => void viewRef.current?.goLeft()}>‹</button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={fraction}
            aria-label="阅读进度"
            onChange={(event) => handleProgressSlider(Number(event.target.value))}
          />
          <span className="book-reader__pager-label">{formatBookProgress(fraction)}</span>
          <button type="button" aria-label="下一页" onClick={() => void viewRef.current?.goRight()}>›</button>
          {isImmersive ? (
            <button type="button" className="book-reader__pager-exit" onClick={() => setIsImmersive(false)}>
              退出聚焦
            </button>
          ) : null}
        </div>
      ) : null}

      {selectionInfo && selectionPopoverStyle ? (
        <div className="book-reader__selection-popover" style={selectionPopoverStyle} role="toolbar" aria-label="批注操作">
          <button type="button" onClick={() => handleCreateAnnotation(false)}>
            <span className="book-reader__selection-icon book-reader__selection-icon--highlight" aria-hidden="true" />
            高亮
          </button>
          <button type="button" onClick={() => handleCreateAnnotation(true)}>
            <span className="book-reader__selection-icon book-reader__selection-icon--note" aria-hidden="true" />
            笔记
          </button>
        </div>
      ) : null}
    </div>
  )
}
