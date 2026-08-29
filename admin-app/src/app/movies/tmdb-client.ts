import { TMDB_PROXY_URL } from '../config'
import type { SessionState } from '../session'

export type TmdbMovieResult = {
  id: number
  title: string
  originalTitle: string
  year: string
  director: string
  coverUrl: string
  genres: string[]
}

export async function searchTmdbMovies(session: SessionState, query: string): Promise<TmdbMovieResult[]> {
  const url = new URL(TMDB_PROXY_URL)
  url.searchParams.set('query', query.trim())
  const response = await fetch(url, { headers: { Authorization: `Bearer ${session.token}` } })
  const payload = await response.json().catch(() => ({})) as { results?: TmdbMovieResult[]; message?: string }
  if (!response.ok) throw new Error(payload.message || 'TMDB 搜索失败。')
  return Array.isArray(payload.results) ? payload.results : []
}
