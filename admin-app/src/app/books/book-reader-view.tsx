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
  readBookReaderLayout,
  saveBookReaderLayout,
  type BookReaderLayout,
} from './book-utils'

type BookReaderViewProps = {
  meta: StoredBookMeta
  fileBlob: Blob
  readingFontSize?: number
  readingFontWeight?: number
  readingFontFamily?: string
  onBack: () => void
  onProgressChange: (meta: StoredBookMeta) => void
  onAnnotationsChange: (bookId: string, count: number) => void
  onImmersiveChange?: (isImmersive: boolean) => void
  onCreatePostFromAnnotations?: (bookId: string) => void
  isActive?: boolean
}

type ReaderTab = 'info' | 'notes'

const DEFAULT_FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'

async function findCfiForQuote(view: FoliateViewElement, rawQuote: string): Promise<string | null> {
  const quote = rawQuote.trim().replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ')
  if (!quote || typeof view.search !== 'function') {
    return null
  }

  // Generate candidate query snippets (from longer to shorter for precision)
  const candidates: string[] = []
  if (quote.length > 40) {
    candidates.push(quote.slice(0, 35))
    candidates.push(quote.slice(5, 40))
  }
  if (quote.length > 20) {
    candidates.push(quote.slice(0, 20))
  } else {
    candidates.push(quote)
  }

  for (const query of candidates) {
    if (!query || query.length < 3) continue
    try {
      const searchIter = view.search({ query })
      for await (const result of searchIter) {
        if (result && typeof result === 'object') {
          if ('subitems' in result && Array.isArray((result as { subitems?: { cfi?: string }[] }).subitems)) {
            const subitems = (result as { subitems: { cfi?: string }[] }).subitems
            if (subitems.length > 0 && subitems[0]?.cfi) {
              const matchedCfi = subitems[0].cfi
              view.clearSearch?.()
              return matchedCfi
            }
          } else if ('cfi' in result && typeof (result as { cfi?: string }).cfi === 'string') {
            const matchedCfi = (result as { cfi: string }).cfi
            view.clearSearch?.()
            return matchedCfi
          }
        }
      }
      view.clearSearch?.()
    } catch {
      view.clearSearch?.()
    }
  }

  return null
}

function getReaderStyles(fontFamily?: string, fontSize?: number, fontWeight?: number) {
  const family = fontFamily || "'Noto Serif SC', 'Songti SC', 'Source Han Serif SC', 'SimSun', serif"
  const size = fontSize ? `${fontSize}px` : '1rem'
  const weight = fontWeight ? String(fontWeight) : '400'

  return `
    @namespace epub "http://www.idpf.org/2007/ops";
    html {
        font-family: ${family};
        font-size: ${size};
        font-weight: ${weight};
    }
    p, li, blockquote, dd, div {
        font-family: ${family};
        font-size: ${size};
        font-weight: ${weight};
        line-height: 1.85;
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
    /* 部分 EPUB（如 calibre 导出）用 .section/.page 包裹正文并设 overflow:hidden，
       这会让该块成为不可分页的单体，foliate 的多栏分页无法把整章拆成多页，
       表现为「整章塞进一列」。强制可滚动，恢复分栏分页。 */
    .section, .page, .calibre1, .calibre2 {
        overflow: visible !important;
    }
    /* 优雅超细半透明滚动条，融入纸质色系 */
    ::-webkit-scrollbar {
        width: 5px;
        height: 5px;
    }
    ::-webkit-scrollbar-track {
        background: transparent;
    }
    ::-webkit-scrollbar-thumb {
        background: rgba(141, 113, 77, 0.22);
        border-radius: 999px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background: rgba(141, 113, 77, 0.45);
    }
    * {
        scrollbar-width: thin;
        scrollbar-color: rgba(141, 113, 77, 0.22) transparent;
    }
`
}

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
  readingFontSize,
  readingFontWeight,
  readingFontFamily,
  onBack,
  onProgressChange,
  onAnnotationsChange,
  onImmersiveChange,
  onCreatePostFromAnnotations,
  isActive = true,
}: BookReaderViewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<FoliateViewElement | null>(null)
  const annotationsRef = useRef<BookAnnotation[]>([])
  const metaRef = useRef<StoredBookMeta>(meta)
  const chapterRef = useRef('')
  const persistTimerRef = useRef<number | null>(null)
  const selectionDebounceRef = useRef<number | null>(null)
  const wheelAdvanceFrameRef = useRef<number | null>(null)
  const didScrollDuringWheelRef = useRef(false)
  const wheelAdvanceLockedRef = useRef(false)
  const annotationCardRefs = useRef(new Map<string, HTMLElement | null>())
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const layoutRef = useRef<BookReaderLayout>(readBookReaderLayout())
  const activeRef = useRef(isActive)

  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toc, setToc] = useState<BookTocItem[]>([])
  const [currentChapter, setCurrentChapter] = useState('')
  const [fraction, setFraction] = useState(meta.progressFraction)
  const [annotations, setAnnotations] = useState<BookAnnotation[]>([])
  const [tab, setTab] = useState<ReaderTab>('notes')
  const [selectionInfo, setSelectionInfo] = useState<BookSelectionInfo | null>(null)
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null)
  const [locatingAnnotationId, setLocatingAnnotationId] = useState<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [isImmersive, setIsImmersive] = useState(false)
  const [isTocOpen, setIsTocOpen] = useState(true)
  const [layout, setLayout] = useState<BookReaderLayout>(() => readBookReaderLayout())

  metaRef.current = meta
  annotationsRef.current = annotations
  layoutRef.current = layout
  activeRef.current = isActive

  useEffect(() => () => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current)
    }
    if (selectionDebounceRef.current !== null) {
      window.clearTimeout(selectionDebounceRef.current)
    }
    if (wheelAdvanceFrameRef.current !== null) {
      window.cancelAnimationFrame(wheelAdvanceFrameRef.current)
    }
  }, [])

  useEffect(() => {
    onImmersiveChange?.(isImmersive)
  }, [isImmersive, onImmersiveChange])

  useEffect(() => {
    if (!isReady || !isActive) {
      return
    }
    const view = viewRef.current
    if (!view?.renderer) {
      return
    }
    // 聚焦/目录切换后画布尺寸变化，foliate 的 ResizeObserver 偶尔不触发重新分栏，主动重排一次。
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
  }, [isActive, isImmersive, isTocOpen, isReady])

  useEffect(() => {
    if (!isReady || !viewRef.current?.renderer) return
    const view = viewRef.current
    const renderer = view.renderer
    if (!renderer) return
    const location = view.lastLocation?.cfi
    renderer.setAttribute('flow', layout)
    renderer.removeAttribute('max-column-count')
    if (layout === 'paginated') {
      renderer.setAttribute('max-column-count', '2')
    }
    renderer.render?.()
    if (location) {
      window.setTimeout(() => void view.goTo(location), 0)
    }
  }, [isReady, layout])

  useEffect(() => {
    if (!isReady || !viewRef.current?.renderer) return
    const view = viewRef.current
    if (!view.renderer?.setStyles) return
    const styles = getReaderStyles(readingFontFamily, readingFontSize, readingFontWeight)
    view.renderer.setStyles(styles)
  }, [isReady, readingFontFamily, readingFontSize, readingFontWeight])

  useEffect(() => {
    let cancelled = false
    let view: FoliateViewElement | null = null
    let cleanupWheelNavigation: (() => void) | undefined

    const configurePageView = (pageView: FoliateViewElement) => {
      pageView.style.width = '100%'
      pageView.style.height = '100%'
      pageView.style.display = 'block'
      // 单 view 双栏跨页：宽屏显示左右两页连续内容，窄屏自动降为单栏。
      // 不要用两个独立 foliate-view 拼双页——next() 同步不可靠，会出现整章一列或左右重复。
      pageView.renderer?.setAttribute('flow', layoutRef.current)
      if (layoutRef.current === 'paginated') {
        pageView.renderer?.setAttribute('max-column-count', '2')
      }
      pageView.renderer?.setAttribute('max-inline-size', '720px')
      pageView.renderer?.setAttribute('gap', '5%')
      pageView.renderer?.setAttribute('margin', '24px')
      pageView.renderer?.setStyles?.(getReaderStyles(readingFontFamily, readingFontSize, readingFontWeight))
    }

    const setup = async () => {
      try {
        await import('foliate-js/view.js')
        const { Overlayer } = await import('foliate-js/overlayer.js')
        if (cancelled || !mountRef.current) {
          return
        }

        view = document.createElement('foliate-view') as FoliateViewElement
        mountRef.current.append(view)
        viewRef.current = view

        const storedAnnotations = await listBookAnnotations(meta.id)
        if (!cancelled) {
          annotationsRef.current = storedAnnotations
          setAnnotations(storedAnnotations)
        }

        // IndexedDB 取回的是无名 Blob，foliate-js 解析时会读取 file.name，包一层 File。
        const namedFile = new File([fileBlob], `${meta.title || 'book'}.epub`, { type: 'application/epub+zip' })
        await view.open(namedFile)
        if (cancelled) {
          return
        }

        configurePageView(view)

        // foliate 的 scrolled flow 只负责当前 spine 文档的原生滚动；封面等
        // 内容高度不足一屏的文档不会产生 scroll 事件，也就无法自然进入下一项。
        // 仅当一次向下滚轮没有造成任何原生滚动时，补一次 next() 来连接下一项。
        const wheelListeners = new Map<Document, (event: WheelEvent) => void>()
        const handleRendererScroll = () => {
          didScrollDuringWheelRef.current = true
        }
        view.renderer?.addEventListener('scroll', handleRendererScroll)
        cleanupWheelNavigation = () => {
          view?.renderer?.removeEventListener('scroll', handleRendererScroll)
          for (const [doc, listener] of wheelListeners) {
            doc.removeEventListener('wheel', listener as unknown as EventListener)
          }
          wheelListeners.clear()
        }

        const handleKeydown = (event: KeyboardEvent) => {
          if (!activeRef.current) return
          const target = event.target as HTMLElement | null
          if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
            return
          }
          if (layoutRef.current === 'paginated' && event.key === 'ArrowLeft') {
            event.preventDefault()
            void view?.goLeft()
          } else if (layoutRef.current === 'paginated' && event.key === 'ArrowRight') {
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
          const handleWheel = (wheelEvent: WheelEvent) => {
            if (
              !activeRef.current
              || layoutRef.current !== 'scrolled'
              || wheelEvent.deltaY <= 0
              || wheelEvent.ctrlKey
              || wheelAdvanceFrameRef.current !== null
            ) {
              return
            }

            didScrollDuringWheelRef.current = false
            wheelAdvanceFrameRef.current = window.requestAnimationFrame(() => {
              wheelAdvanceFrameRef.current = null
              if (
                !activeRef.current
                || layoutRef.current !== 'scrolled'
                || didScrollDuringWheelRef.current
                || wheelAdvanceLockedRef.current
              ) {
                return
              }
              wheelAdvanceLockedRef.current = true
              void view?.next().finally(() => {
                wheelAdvanceLockedRef.current = false
              })
            })
          }
          doc.addEventListener('wheel', handleWheel, { passive: true })
          wheelListeners.set(doc, handleWheel)
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

        if (!cancelled) {
          setIsReady(true)

          // 自动为未锚定（如微信读书导入）的划线匹配当前 EPUB 的 CFI 并绘制高亮
          const unanchored = storedAnnotations.filter(
            (ann) => ann.quote && (!ann.value || !ann.value.startsWith('epubcfi(')),
          )
          if (unanchored.length > 0 && typeof view.search === 'function') {
            void (async () => {
              let changed = false
              for (const ann of unanchored) {
                if (cancelled) break
                const foundCfi = await findCfiForQuote(view, ann.quote)
                if (foundCfi) {
                  ann.value = foundCfi
                  void view.addAnnotation(ann)
                  await putBookAnnotation(ann)
                  changed = true
                }
              }
              if (changed && !cancelled) {
                const updatedList = await listBookAnnotations(meta.id)
                notifyAnnotationsChanged(updatedList)
              }
            })()
          }
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
      cleanupWheelNavigation?.()
      try {
        view?.close()
        view?.remove()
      } catch {
        // 忽略卸载异常
      }
      viewRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.id, fileBlob])

  useEffect(() => {
    if (!isActive) return
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        return
      }
      if (layout === 'paginated' && event.key === 'ArrowLeft') {
        event.preventDefault()
        void viewRef.current?.goLeft()
      } else if (layout === 'paginated' && event.key === 'ArrowRight') {
        event.preventDefault()
        void viewRef.current?.goRight()
      } else if (event.key === 'Escape') {
        setIsImmersive(false)
        setSelectionInfo(null)
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [isActive, layout])

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

  const handleLocateAnnotation = useCallback(
    async (annotation: BookAnnotation) => {
      setActiveAnnotationId(annotation.id)
      const view = viewRef.current
      if (!view) return

      // 1. 如果已有有效的 CFI 坐标，直接定位跳转
      if (annotation.value && annotation.value.startsWith('epubcfi(')) {
        void view.showAnnotation(annotation)
        return
      }

      // 2. 如果无 CFI 坐标（如微信读书导入），根据摘录文本实时检索并锚定
      if (annotation.quote && typeof view.search === 'function') {
        setLocatingAnnotationId(annotation.id)
        try {
          const foundCfi = await findCfiForQuote(view, annotation.quote)
          if (foundCfi) {
            const nextAnn: BookAnnotation = {
              ...annotation,
              value: foundCfi,
              updatedAt: new Date().toISOString(),
            }
            void view.addAnnotation(nextAnn)
            void view.showAnnotation(nextAnn)
            void putBookAnnotation(nextAnn)

            const list = await listBookAnnotations(meta.id)
            notifyAnnotationsChanged(list)
            return
          }
        } finally {
          setLocatingAnnotationId(null)
        }
      }

      // 3. 兜底方案：如果章节名称与目录项匹配，跳转到对应章节
      if (annotation.chapter && view.goTo) {
        const matchedToc = (view.book?.toc || []).find(
          (item) =>
            item.label?.trim() === annotation.chapter?.trim() ||
            annotation.chapter?.trim().includes(item.label?.trim() || ''),
        )
        if (matchedToc?.href) {
          void view.goTo(matchedToc.href)
        }
      }
    },
    [meta.id, notifyAnnotationsChanged],
  )

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
    if (layout !== 'paginated') return
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

  const handleLayoutChange = (nextLayout: BookReaderLayout) => {
    setLayout(nextLayout)
    saveBookReaderLayout(nextLayout)
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
            <div className="book-reader__layout-switch" role="group" aria-label="阅读布局">
              <button type="button" className={layout === 'paginated' ? 'is-active' : ''} onClick={() => handleLayoutChange('paginated')}>双页</button>
              <button type="button" className={layout === 'scrolled' ? 'is-active' : ''} onClick={() => handleLayoutChange('scrolled')}>滚动</button>
            </div>
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
              onClick={async () => {
                const { exportBookAnnotationsToMarkdown } = await import('./book-store')
                const markdown = await exportBookAnnotationsToMarkdown(meta.id)
                const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
                const url = URL.createObjectURL(blob)
                const link = document.createElement('a')
                link.href = url
                link.download = `《${meta.title}》读书笔记.md`
                link.click()
                URL.revokeObjectURL(url)
              }}
              title="导出当前电子书划线批注为 Markdown 笔记"
            >
              导出笔记
            </button>
            {onCreatePostFromAnnotations ? (
              <button
                type="button"
                className="book-reader__header-btn"
                onClick={() => onCreatePostFromAnnotations(meta.id)}
                title="基于当前划线批注生成新稿件草稿"
              >
                转为草稿
              </button>
            ) : null}
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
          <div ref={mountRef} className="book-reader__view" />
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
                              onClick={() => { void handleLocateAnnotation(annotation) }}
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
                                <button
                                  type="button"
                                  onClick={() => { void handleLocateAnnotation(annotation) }}
                                  disabled={locatingAnnotationId === annotation.id}
                                >
                                  {locatingAnnotationId === annotation.id ? '定位中…' : '定位'}
                                </button>
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
          {layout === 'paginated' ? <button type="button" aria-label="上一页" onClick={() => void viewRef.current?.goLeft()}>‹</button> : null}
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
          {layout === 'paginated' ? <button type="button" aria-label="下一页" onClick={() => void viewRef.current?.goRight()}>›</button> : null}
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
