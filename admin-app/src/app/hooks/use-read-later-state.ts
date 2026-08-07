import { useState } from 'react'
import type { SessionState } from '../session'
import type { ImportedReadLaterArticle } from '../read-later/import-client'
import { importReadLaterFromUrl } from '../read-later/import-client'

export function useReadLaterState(
  session: SessionState | null,
  setError: (msg: string | null) => void,
  setSuccessMessage: (msg: string | null) => void,
) {
  const [isImportingReadLater, setIsImportingReadLater] = useState(false)
  const [importedArticle, setImportedArticle] = useState<ImportedReadLaterArticle | null>(null)

  const handleImportArticle = async (url: string) => {
    if (!session) {
      setError('GitHub 会话已过期，请重新登录。')
      return null
    }

    setIsImportingReadLater(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const result = await importReadLaterFromUrl(session, url)
      setImportedArticle(result)
      setSuccessMessage(`已从网络解析《${result.title}》。`)
      return result
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : '解析网页失败。')
      return null
    } finally {
      setIsImportingReadLater(false)
    }
  }

  return {
    isImportingReadLater,
    importedArticle,
    setImportedArticle,
    handleImportArticle,
  }
}
