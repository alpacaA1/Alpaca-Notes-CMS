import { MOVIES_DATA_PATH } from '../config'
import { fetchTextFile, saveTextFile } from '../github-client'
import type { SessionState } from '../session'
import type { MovieEntry, MoviesLibraryData } from './movie-types'

export function parseMoviesLibrary(content: string): MoviesLibraryData {
  try {
    const value = JSON.parse(content) as Partial<MoviesLibraryData>
    return {
      version: 1,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
      movies: Array.isArray(value.movies) ? value.movies.filter((movie): movie is MovieEntry => Boolean(movie && typeof movie.id === 'string' && typeof movie.title === 'string')) : [],
    }
  } catch {
    throw new Error('云端光影数据格式错误，无法解析。')
  }
}

export async function fetchMoviesLibrary(session: SessionState): Promise<{ data: MoviesLibraryData; sha?: string }> {
  try {
    const file = await fetchTextFile(session, MOVIES_DATA_PATH)
    return { data: parseMoviesLibrary(file.content), sha: file.sha }
  } catch (error) {
    if (error instanceof Error && (error.message === 'Not Found' || error.message.toLowerCase().includes('not found'))) {
      return { data: { version: 1, updatedAt: new Date().toISOString(), movies: [] } }
    }
    throw error
  }
}

export async function saveMoviesLibrary(session: SessionState, movies: MovieEntry[], sha?: string) {
  return saveTextFile(session, {
    path: MOVIES_DATA_PATH,
    content: `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), movies }, null, 2)}\n`,
    sha,
  })
}
