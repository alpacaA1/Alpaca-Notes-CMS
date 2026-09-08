import { describe, expect, it } from 'vitest'
import {
  appendMusicNoteToDiaryBody,
  formatMusicNoteBlock,
  generateMusicNoteId,
  hasMusicNoteId,
} from './music-note-format'
import type { MusicNoteRecord } from './music-note-types'

describe('music-note-format', () => {
  it('generates a valid unique music note id', () => {
    const fixedDate = new Date(2026, 8, 8, 14, 30, 0)
    const id = generateMusicNoteId(fixedDate)
    expect(id).toMatch(/^mn_20260908_143000_[a-z0-9]+$/)
  })

  it('formats minimal music note record', () => {
    const record: MusicNoteRecord = {
      id: 'mn-101',
      createdAt: '2026-09-08T14:30:00.000Z',
      data: {
        songTitle: '晴天',
        artist: '',
        lyrics: '',
        thoughts: '',
      },
    }

    const block = formatMusicNoteBlock(record)
    expect(block).toContain('<!-- alpaca:music-note id="mn-101" version="1" -->')
    expect(block).toContain('### 🎵')
    expect(block).toContain('拾音')
    expect(block).toContain('> 🎤 **歌名**：晴天')
    expect(block).not.toContain('歌手')
    expect(block).not.toContain('歌词摘录')
    expect(block).not.toContain('我的感触')
    expect(block).toContain('<!-- /alpaca:music-note -->')
  })

  it('formats full music note record with all fields', () => {
    const record: MusicNoteRecord = {
      id: 'mn-102',
      createdAt: '2026-09-08T14:30:00.000Z',
      data: {
        songTitle: '晴天',
        artist: '周杰伦',
        lyrics: '从前从前 有个人爱你很久\n但偏偏 风渐渐 把距离吹得好远',
        thoughts: '想起很多以前的事。',
      },
    }

    const block = formatMusicNoteBlock(record)
    expect(block).toContain('> 🎤 **歌名**：晴天')
    expect(block).toContain('> 🎸 **歌手**：周杰伦')
    expect(block).toContain('> 🎶 **歌词摘录**：')
    expect(block).toContain('> 从前从前 有个人爱你很久')
    expect(block).toContain('💭 **我的感触**：想起很多以前的事。')
  })

  it('checks if a music note id exists in diary body', () => {
    const diary = `## 拾音\n\n<!-- alpaca:music-note id="mn-101" version="1" -->\n### 🎵 14:30 · 拾音\n<!-- /alpaca:music-note -->`
    expect(hasMusicNoteId(diary, 'mn-101')).toBe(true)
    expect(hasMusicNoteId(diary, 'mn-999')).toBe(false)
    expect(hasMusicNoteId('', 'mn-101')).toBe(false)
  })

  it('appends music note under ## 拾音 for empty, non-existing, and existing sections', () => {
    const mn1 = `<!-- alpaca:music-note id="mn-1" version="1" -->\n### 🎵 10:00 · 拾音\n> 🎤 **歌名**：晴天\n<!-- /alpaca:music-note -->`
    const mn2 = `<!-- alpaca:music-note id="mn-2" version="1" -->\n### 🎵 14:00 · 拾音\n> 🎤 **歌名**：后来\n<!-- /alpaca:music-note -->`

    // Case 1: Empty
    const result1 = appendMusicNoteToDiaryBody('', mn1)
    expect(result1).toBe(`## 拾音\n\n${mn1}\n`)

    // Case 2: Existing diary without ## 拾音
    const result2 = appendMusicNoteToDiaryBody('日常记录。', mn1)
    expect(result2).toBe(`日常记录。\n\n## 拾音\n\n${mn1}\n`)

    // Case 3: Existing diary with ## 拾音
    const result3 = appendMusicNoteToDiaryBody(result2, mn2)
    expect(result3).toBe(`日常记录。\n\n## 拾音\n\n${mn1}\n\n${mn2}\n`)

    // Case 4: Existing diary with ## 拾音 followed by another ## 待读摘录
    const bodyWithNext = `## 拾音\n\n${mn1}\n\n## 待读摘录\n\n### 🔖 11:00\n> 摘录`
    const result4 = appendMusicNoteToDiaryBody(bodyWithNext, mn2)
    expect(result4).toBe(`## 拾音\n\n${mn1}\n\n${mn2}\n\n## 待读摘录\n\n### 🔖 11:00\n> 摘录\n`)
  })
})
