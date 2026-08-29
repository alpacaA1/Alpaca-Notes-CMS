export type MovieStatus = 'wish' | 'watched'

export type MovieEntry = {
  id: string
  title: string
  originalTitle: string
  year: string
  director: string
  coverUrl: string
  sourceUrl: string
  status: MovieStatus
  rating: number | null
  watchedAt: string
  tags: string[]
  reflection: string
  createdAt: string
  updatedAt: string
}

export type MoviesLibraryData = {
  version: 1
  updatedAt: string
  movies: MovieEntry[]
}

export function createMovieEntry(): MovieEntry {
  const now = new Date().toISOString()
  return {
    id: `movie-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: '', originalTitle: '', year: '', director: '', coverUrl: '', sourceUrl: '',
    status: 'watched', rating: null, watchedAt: now.slice(0, 10), tags: [], reflection: '',
    createdAt: now, updatedAt: now,
  }
}
