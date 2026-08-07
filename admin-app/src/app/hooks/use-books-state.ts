import { useCallback, useEffect, useState } from 'react'
import {
  countBookAnnotations,
  deleteBook,
  getBookFile,
  listBookMetas,
  putBook,
  putBookMeta,
} from '../books/book-store'
import type { StoredBookMeta } from '../books/book-types'
import { importBookFile } from '../books/import-book'

export type BookReaderSession = {
  meta: StoredBookMeta
  fileBlob: Blob
  targetAnnotationId: string | null
}

export function useBooksState(
  isLoggedIn: boolean,
  adminView: string,
  setError: (msg: string | null) => void,
  setSuccessMessage: (msg: string | null) => void,
) {
  const [bookMetas, setBookMetas] = useState<StoredBookMeta[]>([])
  const [bookAnnotationCounts, setBookAnnotationCounts] = useState<Record<string, number>>({})
  const [isBooksLoading, setIsBooksLoading] = useState(false)
  const [isBookImporting, setIsBookImporting] = useState(false)
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null)
  const [activeBook, setActiveBook] = useState<BookReaderSession | null>(null)
  const [bookReaderSessions, setBookReaderSessions] = useState<BookReaderSession[]>([])
  const [isBookReaderOpen, setIsBookReaderOpen] = useState(false)
  const [isBookImmersive, setIsBookImmersive] = useState(false)

  const refreshBookShelf = useCallback(async () => {
    const [metas, counts] = await Promise.all([listBookMetas(), countBookAnnotations()])
    setBookMetas(metas)
    setBookAnnotationCounts(counts)
  }, [])

  useEffect(() => {
    if (!isLoggedIn || adminView !== 'books') {
      return
    }

    let cancelled = false
    setIsBooksLoading(true)
    void refreshBookShelf()
      .catch((refreshError) => {
        if (!cancelled) {
          setError(refreshError instanceof Error ? refreshError.message : '读取本地书架失败。')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsBooksLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [isLoggedIn, adminView, refreshBookShelf, setError])

  const handleImportBookFile = async (file: File) => {
    setIsBookImporting(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const imported = await importBookFile(file)
      await putBook(imported.meta, imported.file)
      await refreshBookShelf()
      setSuccessMessage(`已导入《${imported.meta.title}》，文件仅保存在本机。`)
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '导入电子书失败。')
    } finally {
      setIsBookImporting(false)
    }
  }

  const activateBookReader = useCallback((session: BookReaderSession) => {
    setBookReaderSessions((current) => {
      const next = [session, ...current.filter((item) => item.meta.id !== session.meta.id)]
      return next.slice(0, 2)
    })
    setActiveBook(session)
    setIsBookReaderOpen(true)
  }, [])

  const handleOpenBook = async (book: StoredBookMeta) => {
    setError(null)
    try {
      const file = await getBookFile(book.id)
      if (!file) {
        throw new Error('本地找不到这本书的文件，可能已被浏览器清理，请重新导入。')
      }
      const nextMeta: StoredBookMeta = { ...book, lastOpenedAt: new Date().toISOString() }
      void putBookMeta(nextMeta)
      activateBookReader({ meta: nextMeta, fileBlob: file.blob, targetAnnotationId: null })
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : '打开书籍失败。')
    }
  }

  const handleDeleteBook = async (book: StoredBookMeta) => {
    setDeletingBookId(book.id)
    setError(null)
    try {
      await deleteBook(book.id)
      if (activeBook?.meta.id === book.id) {
        setActiveBook(null)
        setIsBookReaderOpen(false)
      }
      setBookReaderSessions((current) => current.filter((item) => item.meta.id !== book.id))
      await refreshBookShelf()
      setSuccessMessage(`已删除《${book.title}》。`)
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除书籍失败。')
    } finally {
      setDeletingBookId(null)
    }
  }

  return {
    bookMetas,
    bookAnnotationCounts,
    isBooksLoading,
    isBookImporting,
    deletingBookId,
    activeBook,
    setActiveBook,
    bookReaderSessions,
    setBookReaderSessions,
    isBookReaderOpen,
    setIsBookReaderOpen,
    isBookImmersive,
    setIsBookImmersive,
    refreshBookShelf,
    handleImportBookFile,
    handleOpenBook,
    handleDeleteBook,
    activateBookReader,
  }
}
