import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BookAnnotation, BookSelectionInfo, StoredBookMeta } from './book-types'
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
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker'

const createPdfWorker = () => new PdfWorker()

type PdfReaderViewProps = {
  meta: StoredBookMeta
  fileBlob: Blob
  targetAnnotationId?: string | null
  onBack: () => void
  onProgressChange: (meta: StoredBookMeta) => void
  onAnnotationsChange: (bookId: string, count: number) => void
  onImmersiveChange?: (isImmersive: boolean) => void
}

type ReaderTab = 'info' | 'notes'

type PdfDocumentProxy = {
  numPages: number
  getPage: (pageNumber: number) => Promise<PdfPageProxy>
  destroy?: () => Promise<void>
}

type PdfJsModule = {
  GlobalWorkerOptions: {
    workerPort: Worker | null
  }
  getDocument: (options: { data: ArrayBuffer }) => { promise: Promise<PdfDocumentProxy> }
}

type PdfPageProxy = {
  getViewport: (options: { scale: number }) => PdfViewport
  render: (options: {
    canvasContext: CanvasRenderingContext2D
    viewport: PdfViewport
    transform?: [number, number, number, number, number, number]
  }) => { promise: Promise<void>; cancel?: () => void }
  getTextContent: () => Promise<{ items: PdfTextItem[] }>
}

type PdfViewport = {
  width: number
  height: number
  transform: number[]
}

type PdfTextItem = {
  str?: string
  transform?: number[]
  width?: number
  height?: number
}

type CachedPdfPage = {
  canvas: HTMLCanvasElement
  viewport: PdfViewport
  scale: number
  textItems: PdfTextItem[]
}

type PdfSurfaceSelection = {
  pageNumber: number
  quote: string
  rects: Array<{ left: number; top: number; width: number; height: number }>
  rect: { left: number; top: number; width: number; height: number }
}

type PdfPageSurfaceProps = {
  pdf: PdfDocumentProxy
  pageNumber: number
  cache: Map<number, CachedPdfPage>
  annotations: BookAnnotation[]
  onError: (message: string) => void
  onSelect: (selection: PdfSurfaceSelection) => void
}

function PdfPageSurface({ pdf, pageNumber, cache, annotations, onError, onSelect }: PdfPageSurfaceProps) {
  const frameRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    let task: { promise: Promise<void>; cancel?: () => void } | null = null

    const render = async () => {
      try {
        const frame = frameRef.current
        const canvas = canvasRef.current
        const textLayer = textLayerRef.current
        if (!frame || !canvas || !textLayer) return

        let cached = cache.get(pageNumber)
        if (!cached) {
          const page = await pdf.getPage(pageNumber)
          if (cancelled) return
          const baseViewport = page.getViewport({ scale: 1 })
          const scale = Math.min(
            Math.max(Math.min((frame.clientWidth - 24) / baseViewport.width, (frame.clientHeight - 24) / baseViewport.height), 0.2),
            2,
          )
          const viewport = page.getViewport({ scale })
          const ratio = window.devicePixelRatio || 1
          const renderCanvas = document.createElement('canvas')
          renderCanvas.width = Math.floor(viewport.width * ratio)
          renderCanvas.height = Math.floor(viewport.height * ratio)
          const context = renderCanvas.getContext('2d')
          if (!context) return
          task = page.render({
            canvasContext: context,
            viewport,
            transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
          })
          await task.promise
          if (cancelled) return
          const textContent = await page.getTextContent()
          cached = { canvas: renderCanvas, viewport, scale, textItems: textContent.items }
          cache.set(pageNumber, cached)
        }
        if (cancelled) return

        canvas.width = cached.canvas.width
        canvas.height = cached.canvas.height
        canvas.style.width = `${cached.viewport.width}px`
        canvas.style.height = `${cached.viewport.height}px`
        const content = contentRef.current
        if (!content) return
        content.style.width = `${cached.viewport.width}px`
        content.style.height = `${cached.viewport.height}px`
        const visibleContext = canvas.getContext('2d')
        if (!visibleContext) return
        visibleContext.setTransform(1, 0, 0, 1, 0, 0)
        visibleContext.drawImage(cached.canvas, 0, 0)
        textLayer.style.width = `${cached.viewport.width}px`
        textLayer.style.height = `${cached.viewport.height}px`
        textLayer.replaceChildren()
        const fragment = document.createDocumentFragment()
        for (const item of cached.textItems) {
          if (!item.str || !item.transform) continue
          const transform = multiplyTransform(cached.viewport.transform, item.transform)
          const span = document.createElement('span')
          span.textContent = item.str
          span.style.left = `${transform[4]}px`
          span.style.top = `${transform[5]}px`
          span.style.fontSize = `${Math.max(Math.hypot(transform[2], transform[3]), 8)}px`
          span.style.transform = `scaleX(${item.width ? Math.max((item.width * cached.scale) / Math.max(item.str.length * Math.max(Math.hypot(transform[0], transform[1]), 1), 1), 0.4) : 1})`
          span.style.transformOrigin = '0 0'
          fragment.append(span)
        }
        textLayer.append(fragment)
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
          onError(error instanceof Error ? error.message : '渲染 PDF 页面失败。')
        }
      }
    }

    void render()
    return () => {
      cancelled = true
      task?.cancel?.()
    }
  }, [cache, onError, pageNumber, pdf])

  const handleSelection = useCallback(() => {
    const selection = window.getSelection()
    const textLayer = textLayerRef.current
    const content = contentRef.current
    if (!selection || !textLayer || !content || selection.isCollapsed || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (!textLayer.contains(range.commonAncestorContainer)) return
    const quote = normalizeBookQuote(selection.toString())
    if (!quote) return
    const pageRect = content.getBoundingClientRect()
    const rects = Array.from(range.getClientRects()).map((rect) => ({
      left: (rect.left - pageRect.left) / pageRect.width,
      top: (rect.top - pageRect.top) / pageRect.height,
      width: rect.width / pageRect.width,
      height: rect.height / pageRect.height,
    })).filter((rect) => rect.width > 0.001 && rect.height > 0.001)
    if (rects.length === 0) return
    const rect = range.getBoundingClientRect()
    onSelect({ pageNumber, quote, rects, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } })
  }, [onSelect, pageNumber])

  return (
    <div ref={frameRef} className="pdf-reader__surface" data-page-number={pageNumber}>
      <div ref={contentRef} className="pdf-reader__page-content" onMouseUp={handleSelection}>
        <canvas ref={canvasRef} className="pdf-reader__canvas-layer" />
        <div className="pdf-reader__highlight-layer">
          {annotations.filter((annotation) => annotation.target?.type === 'pdf' && annotation.target.pageNumber === pageNumber).flatMap((annotation) =>
            (annotation.target?.rects || []).map((rect, index) => (
              <span
                key={`${annotation.id}-${index}`}
                className="pdf-reader__highlight"
                style={{
                  left: `${rect.left * 100}%`,
                  top: `${rect.top * 100}%`,
                  width: `${rect.width * 100}%`,
                  height: `${rect.height * 100}%`,
                  backgroundColor: annotation.color || BOOK_HIGHLIGHT_COLOR,
                  opacity: 0.42,
                }}
              />
            )),
          )}
        </div>
        <div ref={textLayerRef} className="pdf-reader__text-layer" />
      </div>
    </div>
  )
}

function formatBookDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function clampPage(pageNumber: number, pageCount: number) {
  return Math.min(Math.max(Math.round(pageNumber), 1), Math.max(pageCount, 1))
}

function multiplyTransform(left: number[], right: number[]) {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ]
}

function getPageFraction(pageNumber: number, pageCount: number) {
  if (pageCount <= 1) {
    return 0
  }
  return (clampPage(pageNumber, pageCount) - 1) / (pageCount - 1)
}

function clampSpreadStart(pageNumber: number, pageCount: number) {
  const clamped = clampPage(pageNumber, pageCount)
  return clamped % 2 === 0 ? clamped - 1 : clamped
}

export default function PdfReaderView({
  meta,
  fileBlob,
  targetAnnotationId,
  onBack,
  onProgressChange,
  onAnnotationsChange,
  onImmersiveChange,
}: PdfReaderViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pageLayerRef = useRef<HTMLDivElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const pdfRef = useRef<PdfDocumentProxy | null>(null)
  const metaRef = useRef(meta)
  const annotationCardRefs = useRef(new Map<string, HTMLElement | null>())
  const activeRenderTaskRef = useRef<{ promise: Promise<void>; cancel?: () => void } | null>(null)
  const pdfPageCacheRef = useRef(new Map<number, CachedPdfPage>())
  const readerPageFrameRef = useRef<{ width: number; height: number } | null>(null)

  const [isReady, setIsReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pageCount, setPageCount] = useState(meta.pageCount || 0)
  const [pageNumber, setPageNumber] = useState(meta.progressPage || 1)
  const [annotations, setAnnotations] = useState<BookAnnotation[]>([])
  const [selectionInfo, setSelectionInfo] = useState<BookSelectionInfo | null>(null)
  const [selectionTarget, setSelectionTarget] = useState<PdfSurfaceSelection | null>(null)
  const [tab, setTab] = useState<ReaderTab>('notes')
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(targetAnnotationId || null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [isImmersive, setIsImmersive] = useState(false)
  const [scale, setScale] = useState(1)
  const [pdfDocument, setPdfDocument] = useState<PdfDocumentProxy | null>(null)

  metaRef.current = meta

  useEffect(() => {
    onImmersiveChange?.(isImmersive)
  }, [isImmersive, onImmersiveChange])

  useEffect(() => {
    let cancelled = false
    let worker: Worker | null = null
    const loadPdf = async () => {
      try {
        const pdfjs = await import('pdfjs-dist') as PdfJsModule
        worker = createPdfWorker()
        pdfjs.GlobalWorkerOptions.workerPort = worker
        const [pdf, storedAnnotations] = await Promise.all([
          pdfjs.getDocument({ data: await fileBlob.arrayBuffer() }).promise,
          listBookAnnotations(meta.id),
        ])
        if (cancelled) {
          void pdf.destroy?.()
          return
        }
        pdfRef.current = pdf
        setPdfDocument(pdf)
        setPageCount(pdf.numPages)
        setPageNumber(clampSpreadStart(meta.progressPage || 1, pdf.numPages))
        setAnnotations(storedAnnotations)
        setIsReady(true)
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : '打开 PDF 失败。')
        }
      }
    }

    void loadPdf()

    return () => {
      cancelled = true
      void pdfRef.current?.destroy?.()
      pdfRef.current = null
      setPdfDocument(null)
      worker?.terminate()
      worker = null
      pdfPageCacheRef.current.clear()
      readerPageFrameRef.current = null
    }
  }, [fileBlob, meta.id])

  useEffect(() => {
    if (!isReady || !pdfRef.current || !canvasRef.current || !pageLayerRef.current || !textLayerRef.current || pageCount <= 0) {
      return
    }

    let cancelled = false
    let renderTask: { promise: Promise<void>; cancel?: () => void } | null = null

    const renderPage = async () => {
      try {
        const previousTask = activeRenderTaskRef.current
        if (previousTask) {
          try {
            previousTask.cancel?.()
            await previousTask.promise
          } catch {
            // The previous page was intentionally cancelled before reusing its canvas.
          }
          if (activeRenderTaskRef.current === previousTask) {
            activeRenderTaskRef.current = null
          }
        }
        if (cancelled) {
          return
        }

        const pdf = pdfRef.current
        const canvas = canvasRef.current
        const pageLayer = pageLayerRef.current
        const textLayer = textLayerRef.current
        if (!pdf || !canvas || !pageLayer || !textLayer) {
          return
        }

        const ratio = window.devicePixelRatio || 1
        let cachedPage = pdfPageCacheRef.current.get(pageNumber)
        if (!cachedPage) {
          const page = await pdf.getPage(pageNumber)
          if (cancelled) {
            return
          }
          const scrollContainer = pageLayer.parentElement
          const availableWidth = Math.max((scrollContainer?.clientWidth || 760) - 36, 240)
          const viewportHeight = window.innerHeight - (isImmersive ? 92 : 210)
          const availableHeight = Math.max(
            Math.min((scrollContainer?.clientHeight || viewportHeight) - 36, viewportHeight),
            240,
          )
          const baseViewport = page.getViewport({ scale: 1 })
          const fixedFrame = readerPageFrameRef.current
          const nextScale = fixedFrame
            ? Math.min(fixedFrame.width / baseViewport.width, fixedFrame.height / baseViewport.height)
            : Math.min(
              Math.max(Math.min(availableWidth / baseViewport.width, availableHeight / baseViewport.height), 0.25),
              1.7,
            )
          const viewport = page.getViewport({ scale: nextScale })
          if (!fixedFrame) {
            readerPageFrameRef.current = { width: viewport.width, height: viewport.height }
          }
          const renderCanvas = document.createElement('canvas')
          renderCanvas.width = Math.floor(viewport.width * ratio)
          renderCanvas.height = Math.floor(viewport.height * ratio)
          const renderContext = renderCanvas.getContext('2d')
          if (!renderContext) {
            return
          }
          renderTask = page.render({
            canvasContext: renderContext,
            viewport,
            transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
          })
          activeRenderTaskRef.current = renderTask
          await renderTask.promise
          if (activeRenderTaskRef.current === renderTask) {
            activeRenderTaskRef.current = null
          }
          const textContent = await page.getTextContent()
          cachedPage = { canvas: renderCanvas, viewport, scale: nextScale, textItems: textContent.items }
          pdfPageCacheRef.current.set(pageNumber, cachedPage)
        }
        if (cancelled) {
          return
        }

        canvas.width = cachedPage.canvas.width
        canvas.height = cachedPage.canvas.height
        canvas.style.width = `${cachedPage.viewport.width}px`
        canvas.style.height = `${cachedPage.viewport.height}px`
        pageLayer.style.width = `${cachedPage.viewport.width}px`
        pageLayer.style.height = `${cachedPage.viewport.height}px`
        textLayer.style.width = `${cachedPage.viewport.width}px`
        textLayer.style.height = `${cachedPage.viewport.height}px`
        const context = canvas.getContext('2d')
        if (!context) {
          return
        }
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.drawImage(cachedPage.canvas, 0, 0)
        textLayer.replaceChildren()
        const fragment = document.createDocumentFragment()
        for (const item of cachedPage.textItems) {
          if (!item.str || !item.transform) {
            continue
          }
          const transform = multiplyTransform(cachedPage.viewport.transform, item.transform)
          const span = document.createElement('span')
          span.textContent = item.str
          span.style.left = `${transform[4]}px`
          span.style.top = `${transform[5]}px`
          span.style.fontSize = `${Math.max(Math.hypot(transform[2], transform[3]), 8)}px`
          span.style.transform = `scaleX(${item.width ? Math.max((item.width * cachedPage.scale) / Math.max(item.str.length * Math.max(Math.hypot(transform[0], transform[1]), 1), 1), 0.4) : 1})`
          span.style.transformOrigin = '0 0'
          fragment.append(span)
        }
        textLayer.append(fragment)
        setScale(cachedPage.scale)
        setSelectionInfo(null)
      } catch (error) {
        if (activeRenderTaskRef.current === renderTask) {
          activeRenderTaskRef.current = null
        }
        if (!cancelled && !(error instanceof Error && error.name === 'RenderingCancelledException')) {
          setLoadError(error instanceof Error ? error.message : '渲染 PDF 页面失败。')
        }
      }
    }

    void renderPage()

    return () => {
      cancelled = true
      try {
        if (activeRenderTaskRef.current === renderTask) {
          renderTask?.cancel?.()
        }
      } catch {
        // 忽略取消渲染异常
      }
    }
  }, [isReady, isImmersive, pageCount, pageNumber])

  useEffect(() => {
    if (!isReady || pageCount <= 0) {
      return
    }
    const latest = metaRef.current
    const nextMeta: StoredBookMeta = {
      ...latest,
      format: 'pdf',
      progressPage: pageNumber,
      pageCount,
      progressFraction: getPageFraction(pageNumber, pageCount),
      lastOpenedAt: new Date().toISOString(),
    }
    void putBookMeta(nextMeta).then(() => onProgressChange(nextMeta))
  }, [isReady, onProgressChange, pageCount, pageNumber])

  useEffect(() => {
    if (!targetAnnotationId || annotations.length === 0) {
      return
    }
    const annotation = annotations.find((item) => item.id === targetAnnotationId)
    if (!annotation?.target || annotation.target.type !== 'pdf') {
      return
    }
    setPageNumber(clampPage(annotation.target.pageNumber, pageCount || annotation.target.pageNumber))
    setActiveAnnotationId(annotation.id)
    setTab('notes')
  }, [annotations, pageCount, targetAnnotationId])

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        return
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setPageNumber((current) => clampSpreadStart(current - 2, pageCount || 1))
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        setPageNumber((current) => clampSpreadStart(current + 2, pageCount || 1))
      } else if (event.key === 'Escape') {
        setIsImmersive(false)
        setSelectionInfo(null)
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [pageCount])

  const notifyAnnotationsChanged = useCallback((next: BookAnnotation[]) => {
    setAnnotations(next)
    onAnnotationsChange(meta.id, next.length)
  }, [meta.id, onAnnotationsChange])

  const handleSurfaceSelection = useCallback((selection: PdfSurfaceSelection) => {
    setSelectionTarget(selection)
    setSelectionInfo({
      value: `pdf:${selection.pageNumber}:${Date.now().toString(36)}`,
      quote: selection.quote,
      chapter: `第 ${selection.pageNumber} 页`,
      rect: selection.rect,
    })
  }, [])

  const handleSelection = useCallback(() => {
    const selection = window.getSelection()
    const pageLayer = pageLayerRef.current
    const textLayer = textLayerRef.current
    if (!selection || !pageLayer || !textLayer || selection.isCollapsed || selection.rangeCount === 0) {
      setSelectionInfo(null)
      return
    }

    const range = selection.getRangeAt(0)
    if (!textLayer.contains(range.commonAncestorContainer)) {
      setSelectionInfo(null)
      return
    }

    const quote = normalizeBookQuote(selection.toString())
    if (!quote) {
      setSelectionInfo(null)
      return
    }

    const pageRect = pageLayer.getBoundingClientRect()
    const rects = Array.from(range.getClientRects())
      .map((rect) => ({
        left: (rect.left - pageRect.left) / pageRect.width,
        top: (rect.top - pageRect.top) / pageRect.height,
        width: rect.width / pageRect.width,
        height: rect.height / pageRect.height,
      }))
      .filter((rect) => rect.width > 0.001 && rect.height > 0.001)

    if (rects.length === 0) {
      setSelectionInfo(null)
      return
    }

    const firstRect = range.getBoundingClientRect()
    setSelectionInfo({
      value: `pdf:${pageNumber}:${Date.now().toString(36)}`,
      quote,
      chapter: `第 ${pageNumber} 页`,
      rect: {
        left: firstRect.left,
        top: firstRect.top,
        width: firstRect.width,
        height: firstRect.height,
      },
    })
  }, [pageNumber])

  const currentPageAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.target?.type === 'pdf' && annotation.target.pageNumber === pageNumber),
    [annotations, pageNumber],
  )

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

  const handleCreateAnnotation = useCallback((withNote: boolean) => {
    if (!selectionInfo || !selectionTarget) {
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
      chapter: `第 ${selectionTarget.pageNumber} 页`,
      createdAt: now,
      updatedAt: now,
      target: {
        type: 'pdf',
        pageNumber: selectionTarget.pageNumber,
        rects: selectionTarget.rects,
      },
    }

    window.getSelection()?.removeAllRanges()
    setSelectionInfo(null)
    setSelectionTarget(null)
    notifyAnnotationsChanged([...annotations, annotation])
    void putBookAnnotation(annotation).then(async () => {
      const next = await listBookAnnotations(meta.id)
      notifyAnnotationsChanged(next)
    }).catch(() => {
      notifyAnnotationsChanged(annotations)
      setLoadError('保存 PDF 批注失败，请重试。')
    })

    if (withNote) {
      setTab('notes')
      setActiveAnnotationId(annotation.id)
      setEditingNoteId(annotation.id)
      setNoteDraft('')
    }
  }, [annotations, meta.id, notifyAnnotationsChanged, selectionInfo, selectionTarget])

  const handleDeleteAnnotation = useCallback((annotation: BookAnnotation) => {
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
    void putBookAnnotation(next).then(async () => {
      const list = await listBookAnnotations(meta.id)
      notifyAnnotationsChanged(list)
    })
    setEditingNoteId(null)
    setNoteDraft('')
  }, [meta.id, notifyAnnotationsChanged, noteDraft])

  const handleLocateAnnotation = useCallback((annotation: BookAnnotation) => {
    if (annotation.target?.type === 'pdf') {
      setPageNumber(clampSpreadStart(annotation.target.pageNumber, pageCount || annotation.target.pageNumber))
    }
    setActiveAnnotationId(annotation.id)
  }, [pageCount])

  const notedCount = useMemo(() => annotations.filter((annotation) => annotation.note.trim().length > 0).length, [annotations])
  const fraction = pageCount > 0 ? getPageFraction(pageNumber, pageCount) : 0

  return (
    <div className={`book-reader pdf-reader${isImmersive ? ' book-reader--immersive' : ''}${isReady ? ' is-ready' : ''}`}>
      {!isImmersive ? (
        <div className="book-reader__header">
          <button type="button" className="book-reader__back-btn" onClick={onBack}>
            ← 返回书架
          </button>
          <div className="book-reader__header-title">
            <strong title={meta.title}>{meta.title}</strong>
            <span>{pageCount > 0 ? `第 ${pageNumber}${pageNumber < pageCount ? `-${pageNumber + 1}` : ''} / ${pageCount} 页` : 'PDF'}</span>
          </div>
          <div className="book-reader__header-actions">
            <button type="button" className="book-reader__header-btn" onClick={() => setIsImmersive(true)}>
              聚焦
            </button>
          </div>
        </div>
      ) : null}

      <div className="book-reader__body">
        {!isImmersive ? (
          <aside className="book-reader__toc" aria-label="PDF 导航">
            <div className="book-reader__toc-header">
              <span>页面</span>
              <button type="button" className="book-reader__toc-top" onClick={() => setPageNumber(1)}>
                回到首页
              </button>
            </div>
            <div className="pdf-reader__page-jump">
              <input
                type="number"
                min={1}
                max={pageCount || 1}
                value={pageNumber}
                aria-label="页码"
                step={2}
                onChange={(event) => setPageNumber(clampSpreadStart(Number(event.target.value), pageCount || 1))}
              />
              <span>/ {pageCount || '—'}</span>
            </div>
            <p className="book-reader__toc-empty">PDF 第一版支持文本高亮和页码定位，目录解析后续再做。</p>
          </aside>
        ) : null}

        <section className="book-reader__canvas pdf-reader__canvas" aria-label="PDF 书页">
          <div className="pdf-reader__scroll">
            {pdfDocument ? (
              <div className="pdf-reader__spread">
                <PdfPageSurface
                  pdf={pdfDocument}
                  pageNumber={pageNumber}
                  cache={pdfPageCacheRef.current}
                  annotations={annotations}
                  onError={setLoadError}
                  onSelect={handleSurfaceSelection}
                />
                {pageNumber < pageCount ? (
                  <PdfPageSurface
                    pdf={pdfDocument}
                    pageNumber={pageNumber + 1}
                    cache={pdfPageCacheRef.current}
                    annotations={annotations}
                    onError={setLoadError}
                    onSelect={handleSurfaceSelection}
                  />
                ) : <div className="pdf-reader__surface pdf-reader__surface--empty" />}
              </div>
            ) : null}
          </div>
          {!isReady && !loadError ? (
            <div className="book-reader__loading">
              <div className="book-reader__loading-bar" />
              <p>正在解析 PDF…</p>
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
          <aside className="book-reader__sidebar" aria-label="PDF 侧栏">
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
                  <div><dt>格式</dt><dd>PDF</dd></div>
                  <div><dt>当前页</dt><dd>{pageCount > 0 ? `${pageNumber} / ${pageCount}` : '—'}</dd></div>
                  <div><dt>阅读进度</dt><dd>{formatBookProgress(fraction)}</dd></div>
                  <div><dt>批注</dt><dd>{annotations.length} 条 · {notedCount} 条评论</dd></div>
                  <div><dt>导入时间</dt><dd>{formatBookDateTime(meta.addedAt) || '—'}</dd></div>
                </dl>
                <p className="book-reader__info-hint">扫描版 PDF 没有文本层时无法高亮。</p>
              </div>
            ) : (
              <div className="book-reader__notes" role="tabpanel">
                {annotations.length === 0 ? (
                  <div className="book-reader__notes-empty">
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    </svg>
                    <p>选中 PDF 文本即可开始批注</p>
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
                              {annotation.chapter || '未知页码'} · {formatBookDateTime(annotation.updatedAt)}
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
          <button type="button" aria-label="上一组" onClick={() => setPageNumber((current) => clampSpreadStart(current - 2, pageCount || 1))}>‹</button>
          <input
            type="range"
            min={1}
            max={pageCount || 1}
            step={2}
            value={pageNumber}
            aria-label="阅读进度"
            onChange={(event) => setPageNumber(clampSpreadStart(Number(event.target.value), pageCount || 1))}
          />
          <span className="book-reader__pager-label">{pageNumber}{pageNumber < pageCount ? `-${pageNumber + 1}` : ''} / {pageCount || '—'}</span>
          <button type="button" aria-label="下一组" onClick={() => setPageNumber((current) => clampSpreadStart(current + 2, pageCount || 1))}>›</button>
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
      <span className="pdf-reader__scale-probe" aria-hidden="true">{scale}</span>
    </div>
  )
}
