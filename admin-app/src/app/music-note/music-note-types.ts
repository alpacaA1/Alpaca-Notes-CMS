export interface MusicNoteData {
  songTitle: string
  artist: string
  lyrics: string
  thoughts: string
}

export interface MusicNoteRecord {
  id: string
  createdAt: string // ISO string
  data: MusicNoteData
}
