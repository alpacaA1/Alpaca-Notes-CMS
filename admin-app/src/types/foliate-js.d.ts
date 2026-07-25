declare module 'foliate-js/view.js' {
  export type FoliateBook = {
    metadata?: Record<string, unknown>
    toc?: Array<{ label: string; href: string | null; subitems?: unknown }> | null
    getCover?: () => Promise<Blob | null>
    [key: string]: unknown
  }

  export const makeBook: (file: unknown) => Promise<FoliateBook>

  export class View extends HTMLElement {
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
    book?: FoliateBook
    renderer?: HTMLElement & { setStyles?: (styles: string) => void }
  }
}

declare module 'foliate-js/overlayer.js' {
  export class Overlayer {
    static highlight: (rects: unknown, options?: Record<string, unknown>) => unknown
    static underline: (rects: unknown, options?: Record<string, unknown>) => unknown
    static outline: (rects: unknown, options?: Record<string, unknown>) => unknown
  }
}
