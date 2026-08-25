export type StoredBookMeta = {
  id: string
  format?: 'epub' | 'pdf'
  title: string
  creator: string
  coverBlob: Blob | null
  coverSeed: number
  addedAt: string
  lastOpenedAt: string
  progressFraction: number
  progressCfi: string | null
  progressPage?: number | null
  pageCount?: number | null
}

export type StoredBookFile = {
  id: string
  blob: Blob
}

export type RemoteBookItem = {
  id: string
  title: string
  creator: string
  format?: 'epub' | 'pdf'
  coverSeed: number
  addedAt: string
  lastOpenedAt: string
  progressFraction: number
  progressCfi: string | null
  progressPage?: number | null
  pageCount?: number | null
  annotations: BookAnnotation[]
}

export type BooksLibraryData = {
  version: 1
  updatedAt: string
  books: RemoteBookItem[]
}

export type BookAnnotation = {
  id: string
  bookId: string
  value: string
  color: string
  note: string
  quote: string
  chapter: string
  createdAt: string
  updatedAt: string
  target?: {
    type: 'pdf'
    pageNumber: number
    rects: Array<{ left: number; top: number; width: number; height: number }>
  }
}

export type BookTocItem = {
  label: string
  href: string | null
  subitems: BookTocItem[] | null
}

export type BookRelocateDetail = {
  fraction?: number
  cfi?: string
  tocItem?: { label?: string } | null
}

export type BookSelectionInfo = {
  value: string
  quote: string
  chapter: string
  rect: { left: number; top: number; width: number; height: number }
}

export type FoliateViewElement = HTMLElement & {
  open: (book: unknown) => Promise<void>
  init: (options: { lastLocation?: unknown; showTextStart?: boolean }) => Promise<void>
  close: () => void
  prev: (distance?: number) => Promise<void>
  next: (distance?: number) => Promise<void>
  goLeft: () => Promise<void>
  goRight: () => Promise<void>
  goTo: (target: unknown) => Promise<unknown>
  goToFraction: (fraction: number) => Promise<void>
  deselect: () => void
  getCFI: (index: number, range: Range) => string
  addAnnotation: (annotation: { value: string; color?: string; note?: string }, remove?: boolean) => Promise<unknown>
  deleteAnnotation: (annotation: { value: string }) => Promise<unknown>
  showAnnotation: (annotation: { value: string }) => Promise<unknown>
  lastLocation?: { cfi?: string | null }
  book?: {
    metadata?: Record<string, unknown>
    toc?: BookTocItem[] | null
    getCover?: () => Promise<Blob | null>
  }
  renderer?: HTMLElement & {
    setStyles?: (styles: string) => void
    render?: () => void
  }
}
