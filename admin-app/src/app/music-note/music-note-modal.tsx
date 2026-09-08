import { useEffect, useRef, useState } from 'react'
import type { MusicNoteData } from './music-note-types'

export interface MusicNoteModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: MusicNoteData) => void
}

export default function MusicNoteModal({
  isOpen,
  onClose,
  onSubmit,
}: MusicNoteModalProps) {
  const [songTitle, setSongTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [lyrics, setLyrics] = useState('')
  const [thoughts, setThoughts] = useState('')
  const songTitleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    // Auto focus song title input on open
    requestAnimationFrame(() => songTitleRef.current?.focus())
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSongTitle('')
      setArtist('')
      setLyrics('')
      setThoughts('')
    }
  }, [isOpen])

  if (!isOpen) return null

  const canSubmit = songTitle.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit({
      songTitle: songTitle.trim(),
      artist: artist.trim(),
      lyrics: lyrics.trim(),
      thoughts: thoughts.trim(),
    })
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="music-note-modal__overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="拾音">
      <div className="music-note-modal__container" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <header className="music-note-modal__header">
          <span className="music-note-modal__icon">🎵</span>
          <h2 className="music-note-modal__title">拾音</h2>
          <button type="button" className="music-note-modal__close" onClick={onClose} aria-label="关闭">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="music-note-modal__body">
          <label className="music-note-modal__field">
            <span className="music-note-modal__label">歌名 *</span>
            <input
              ref={songTitleRef}
              className="music-note-modal__input"
              type="text"
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              placeholder="这首歌叫什么"
            />
          </label>

          <label className="music-note-modal__field">
            <span className="music-note-modal__label">歌手 / 乐队</span>
            <input
              className="music-note-modal__input"
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="谁唱的"
            />
          </label>

          <label className="music-note-modal__field">
            <span className="music-note-modal__label">歌词摘录</span>
            <textarea
              className="music-note-modal__textarea"
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="打动你的那几句歌词"
              rows={3}
            />
          </label>

          <label className="music-note-modal__field">
            <span className="music-note-modal__label">我的感触</span>
            <textarea
              className="music-note-modal__textarea"
              value={thoughts}
              onChange={(e) => setThoughts(e.target.value)}
              placeholder="为什么这一刻被打动了"
              rows={3}
            />
          </label>
        </div>

        <footer className="music-note-modal__footer">
          <span className="music-note-modal__hint">⌘/Ctrl + Enter 快捷提交</span>
          <button
            type="button"
            className="music-note-modal__submit"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            记录
          </button>
        </footer>
      </div>
    </div>
  )
}
