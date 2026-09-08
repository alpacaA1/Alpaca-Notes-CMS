import type { MusicNoteRecord } from './music-note-types'

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

export function generateMusicNoteId(date: Date = new Date()): string {
  const yyyy = date.getFullYear()
  const MM = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  const randomSuffix = Math.random().toString(36).slice(2, 6)
  return `mn_${yyyy}${MM}${dd}_${hh}${mm}${ss}_${randomSuffix}`
}

export function formatMusicNoteBlock(record: MusicNoteRecord): string {
  const date = new Date(record.createdAt)
  const timeStr = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  const boundaryStart = `<!-- alpaca:music-note id="${record.id}" version="1" -->`
  const boundaryEnd = `<!-- /alpaca:music-note -->`

  const heading = `### 🎵 ${timeStr} · 拾音`
  const lines: string[] = [heading, '']

  const songTitle = (record.data.songTitle || '').trim()
  lines.push(`> 🎤 **歌名**：${songTitle || '未命名'}`)

  const artist = (record.data.artist || '').trim()
  if (artist) {
    lines.push(`> 🎸 **歌手**：${artist}`)
  }

  const lyrics = (record.data.lyrics || '').trim()
  if (lyrics) {
    lines.push('')
    const lyricsLines = lyrics.split('\n').map((line) => (line.trim() ? `> ${line}` : '>')).join('\n')
    lines.push(`> 🎶 **歌词摘录**：`)
    lines.push(lyricsLines)
  }

  const thoughts = (record.data.thoughts || '').trim()
  if (thoughts) {
    lines.push('')
    lines.push(`💭 **我的感触**：${thoughts}`)
  }

  return `${boundaryStart}\n\n${lines.join('\n')}\n\n${boundaryEnd}`
}

export function hasMusicNoteId(diaryBody: string, id: string): boolean {
  if (!diaryBody || !id) return false
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`<!--\\s*alpaca:music-note[^>]*id=["']${escapedId}["']`, 'i')
  return pattern.test(diaryBody)
}

const DIARY_MUSIC_NOTE_HEADING_PATTERN = /^##\s+(?:🎵\s*)?拾音\s*$/m

export function appendMusicNoteToDiaryBody(existingBody: string, musicNoteBlock: string): string {
  const trimmed = (existingBody || '').trim()
  if (!trimmed) {
    return `## 拾音\n\n${musicNoteBlock}\n`
  }

  const match = trimmed.match(DIARY_MUSIC_NOTE_HEADING_PATTERN)
  if (!match || match.index === undefined) {
    return `${trimmed}\n\n## 拾音\n\n${musicNoteBlock}\n`
  }

  const headingStartIndex = match.index
  const afterHeadingIndex = headingStartIndex + match[0].length
  const restOfContent = trimmed.slice(afterHeadingIndex)

  // Find if there is a subsequent Level 2 heading (e.g. \n## Heading)
  const nextH2Match = restOfContent.match(/\n(##\s+[^\n]+)/)
  if (nextH2Match && nextH2Match.index !== undefined) {
    const insertPosition = afterHeadingIndex + nextH2Match.index
    const beforeInsert = trimmed.slice(0, insertPosition).trimEnd()
    const afterInsert = trimmed.slice(insertPosition).trimStart()
    return `${beforeInsert}\n\n${musicNoteBlock}\n\n${afterInsert}\n`
  }

  return `${trimmed}\n\n${musicNoteBlock}\n`
}
