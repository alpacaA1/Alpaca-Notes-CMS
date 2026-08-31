import { PEOPLE_DATA_PATH } from '../config'
import { fetchTextFile, saveTextFile } from '../github-client'
import type { SessionState } from '../session'
import type { PeopleLibraryData, PersonEntry } from './people-types'

export function parsePeopleLibrary(content: string): PeopleLibraryData {
  try {
    const value = JSON.parse(content) as Partial<PeopleLibraryData>
    return {
      version: 1,
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
      people: Array.isArray(value.people)
        ? value.people.filter((person): person is PersonEntry => Boolean(person && typeof person.id === 'string' && typeof person.name === 'string'))
        : [],
    }
  } catch {
    throw new Error('云端人物簿数据格式错误，无法解析。')
  }
}

export async function fetchPeopleLibrary(session: SessionState): Promise<{ data: PeopleLibraryData; sha?: string }> {
  try {
    const file = await fetchTextFile(session, PEOPLE_DATA_PATH)
    return { data: parsePeopleLibrary(file.content), sha: file.sha }
  } catch (error) {
    if (error instanceof Error && (error.message === 'Not Found' || error.message.toLowerCase().includes('not found'))) {
      return { data: { version: 1, updatedAt: new Date().toISOString(), people: [] } }
    }
    throw error
  }
}

export async function savePeopleLibrary(session: SessionState, people: PersonEntry[], sha?: string) {
  return saveTextFile(session, {
    path: PEOPLE_DATA_PATH,
    content: `${JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), people }, null, 2)}\n`,
    sha,
  })
}
