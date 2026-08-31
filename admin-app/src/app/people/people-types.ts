export type PersonMoment = {
  id: string
  date: string
  content: string
  createdAt: string
}

export type PersonEntry = {
  id: string
  name: string
  aliases: string[]
  relationship: string
  tags: string[]
  birthday: string
  notes: string
  moments: PersonMoment[]
  createdAt: string
  updatedAt: string
}

export type PeopleLibraryData = {
  version: 1
  updatedAt: string
  people: PersonEntry[]
}

export function createPersonEntry(): PersonEntry {
  const now = new Date().toISOString()
  return {
    id: `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    aliases: [],
    relationship: '',
    tags: [],
    birthday: '',
    notes: '',
    moments: [],
    createdAt: now,
    updatedAt: now,
  }
}
