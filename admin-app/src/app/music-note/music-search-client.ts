export interface MusicSearchResult {
  id: string
  title: string
  artist: string
  album?: string
}

interface LrclibTrack {
  id: number
  trackName: string
  artistName: string
  albumName?: string
}

interface ITunesTrack {
  trackId: number
  trackName: string
  artistName: string
  collectionName?: string
}

export async function searchMusicOnline(query: string): Promise<MusicSearchResult[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  // 1. Try LRCLIB first
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(trimmed)}`, {
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (res.ok) {
      const data = (await res.json()) as LrclibTrack[]
      if (Array.isArray(data) && data.length > 0) {
        const seen = new Set<string>()
        const results: MusicSearchResult[] = []

        for (const item of data) {
          const title = (item.trackName || '').trim()
          const artist = (item.artistName || '').trim()
          if (!title) continue
          const key = `${title.toLowerCase()}___${artist.toLowerCase()}`
          if (seen.has(key)) continue
          seen.add(key)

          results.push({
            id: `lrclib-${item.id}`,
            title,
            artist,
            album: item.albumName?.trim(),
          })

          if (results.length >= 6) break
        }

        if (results.length > 0) {
          return results
        }
      }
    }
  } catch {
    // Fall back to iTunes
  }

  // 2. Fallback to iTunes Search API
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(trimmed)}&entity=song&limit=6`,
      { signal: controller.signal },
    )
    clearTimeout(timer)

    if (res.ok) {
      const data = await res.json()
      const results: MusicSearchResult[] = []
      const seen = new Set<string>()

      if (Array.isArray(data.results)) {
        for (const item of data.results as ITunesTrack[]) {
          const title = (item.trackName || '').trim()
          const artist = (item.artistName || '').trim()
          if (!title) continue
          const key = `${title.toLowerCase()}___${artist.toLowerCase()}`
          if (seen.has(key)) continue
          seen.add(key)

          results.push({
            id: `itunes-${item.trackId}`,
            title,
            artist,
            album: item.collectionName?.trim(),
          })
        }
      }

      return results
    }
  } catch {
    // Both failed
  }

  return []
}
