import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MusicNoteModal from './music-note-modal'
import * as searchClient from './music-search-client'

describe('MusicNoteModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders and supports manual entry', () => {
    const handleSubmit = vi.fn()
    const handleClose = vi.fn()

    render(<MusicNoteModal isOpen={true} onClose={handleClose} onSubmit={handleSubmit} />)

    const titleInput = screen.getByPlaceholderText(/这首歌叫什么/i)
    const artistInput = screen.getByPlaceholderText(/谁唱的/i)
    const lyricsInput = screen.getByPlaceholderText(/打动你的那几句歌词/i)
    const thoughtsInput = screen.getByPlaceholderText(/为什么这一刻被打动了/i)
    const submitBtn = screen.getByRole('button', { name: '记录' }) as HTMLButtonElement

    expect(submitBtn.disabled).toBe(true)

    fireEvent.change(titleInput, { target: { value: '晴天' } })
    fireEvent.change(artistInput, { target: { value: '周杰伦' } })
    fireEvent.change(lyricsInput, { target: { value: '从前从前 有个人爱你很久' } })
    fireEvent.change(thoughtsInput, { target: { value: '回味无穷' } })

    expect(submitBtn.disabled).toBe(false)

    fireEvent.click(submitBtn)

    expect(handleSubmit).toHaveBeenCalledWith({
      songTitle: '晴天',
      artist: '周杰伦',
      lyrics: '从前从前 有个人爱你很久',
      thoughts: '回味无穷',
    })
    expect(handleClose).toHaveBeenCalled()
  })

  it('searches online and populates title and artist without altering lyrics', async () => {
    const mockSearchResults = [
      { id: '1', title: '平凡之路', artist: '朴树', album: '猎户星座' },
    ]
    vi.spyOn(searchClient, 'searchMusicOnline').mockResolvedValue(mockSearchResults)

    const handleSubmit = vi.fn()
    const handleClose = vi.fn()

    render(<MusicNoteModal isOpen={true} onClose={handleClose} onSubmit={handleSubmit} />)

    const titleInput = screen.getByPlaceholderText(/这首歌叫什么/i) as HTMLInputElement
    const artistInput = screen.getByPlaceholderText(/谁唱的/i) as HTMLInputElement
    const lyricsInput = screen.getByPlaceholderText(/打动你的那几句歌词/i) as HTMLTextAreaElement

    // Type in song title
    fireEvent.change(titleInput, { target: { value: '平凡之路' } })

    // Click search button
    const searchBtn = screen.getByRole('button', { name: /检索歌曲/i })
    fireEvent.click(searchBtn)

    // Wait for candidate to appear
    await waitFor(() => {
      expect(screen.getByText('朴树')).toBeTruthy()
    })

    // Click candidate
    const candidateBtn = screen.getByText('朴树').closest('button')
    expect(candidateBtn).not.toBeNull()
    fireEvent.click(candidateBtn!)

    // Check title and artist are populated
    expect(titleInput.value).toBe('平凡之路')
    expect(artistInput.value).toBe('朴树')
    // Check lyrics remains untouched/empty
    expect(lyricsInput.value).toBe('')
  })
})
