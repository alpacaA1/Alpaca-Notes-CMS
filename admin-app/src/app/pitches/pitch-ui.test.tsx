import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { PostIndexItem } from '../posts/post-types'
import * as githubClientModule from '../github-client'
import * as postsModule from '../posts/index-posts'
import * as sessionModule from '../session'

const samplePitchItem: PostIndexItem = {
  path: 'source/_pitches/2026-04-05-my-pitch.md',
  sha: 'sha-pitch-1',
  title: '如何写出有深度的思考文章',
  date: '2026-04-05 10:00:00',
  desc: '灵感记录',
  published: false,
  hasExplicitPublished: false,
  categories: [],
  tags: ['写作方法'],
  permalink: null,
  cover: null,
  contentType: 'pitch',
  pitchStatus: 'open',
  pitchInspiration: '阅读某篇文章后的感触',
}

const samplePitchContent = `---
title: 如何写出有深度的思考文章
date: 2026-04-05 10:00:00
pitch: true
pitch_status: open
pitch_inspiration: 阅读某篇文章后的感触
tags:
  - 写作方法
---

这是选题的核心想法与大纲构思。`

describe('App pitch workflow', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('switches to pitch tab and lists pitch items in kanban', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'test-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(postsModule, 'buildPitchIndex').mockResolvedValue([samplePitchItem])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: samplePitchItem.path,
      sha: samplePitchItem.sha,
      content: samplePitchContent,
    })

    render(<App />)

    // Wait for the app to finish initial load
    await waitFor(() => {
      expect(screen.queryByText('加载中…')).toBeNull()
    })

    // Click on the "灵感库" top bar switcher
    const pitchRadio = screen.getByRole('radio', { name: '灵感' })
    fireEvent.click(pitchRadio)

    // Check that the pitch title appears in the kanban card
    await waitFor(() => {
      expect(screen.getByText('如何写出有深度的思考文章')).toBeTruthy()
      expect(screen.getAllByText('收集中').length).toBeGreaterThanOrEqual(1)
    })
  })

  it('opens in-place quick pitch modal and allows quick recording', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'test-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(postsModule, 'buildPitchIndex').mockResolvedValue([])
    const saveMock = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: 'source/_pitches/2026-04-05-120000.md',
      sha: 'new-sha',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('加载中…')).toBeNull()
    })

    // Click on the "灵感库" switcher
    fireEvent.click(screen.getByRole('radio', { name: '灵感' }))

    // Click on "新建灵感" button in TopBar
    const newPitchBtns = await screen.findAllByRole('button', { name: /新建灵感/ })
    fireEvent.click(newPitchBtns[0])

    // Should open quick pitch modal without navigating away
    await waitFor(() => {
      expect(screen.getByText('快速记录灵感')).toBeTruthy()
    })

    // Type title and inspiration
    const titleInput = screen.getByPlaceholderText('一两句话记录你的灵感与想法…')
    fireEvent.change(titleInput, { target: { value: '建立长期写作反馈回路' } })

    const inspirationInput = screen.getByPlaceholderText('例如：看《某本书》第3章、某条推文、散步时的感触')
    fireEvent.change(inspirationInput, { target: { value: '与朋友聊天时的感触' } })

    // Click "保存灵感"
    const submitBtn = screen.getByRole('button', { name: '保存灵感' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalled()
      expect(screen.getByText('建立长期写作反馈回路')).toBeTruthy()
    })
  })

  it.skip('allows opening pitch in editor and configuring settings', async () => {
    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'test-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(postsModule, 'buildPitchIndex').mockResolvedValue([samplePitchItem])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: samplePitchItem.path,
      sha: samplePitchItem.sha,
      content: samplePitchContent,
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('加载中…')).toBeNull()
    })

    // Click on the "灵感库" switcher
    fireEvent.click(screen.getByRole('radio', { name: '灵感' }))

    // Open existing pitch card
    const card = await screen.findByText('如何写出有深度的思考文章')
    fireEvent.click(card)

    await waitFor(() => {
      expect(githubClientModule.fetchMarkdownFile).toHaveBeenCalledWith(
        { token: 'test-token' },
        samplePitchItem.path,
      )
    })

    // Switch to preview mode
    const previewRadio = screen.getByRole('radio', { name: /预览/ })
    fireEvent.click(previewRadio)

    // Verify left-side table of contents outline is visible and reader layout is active
    await waitFor(() => {
      expect(screen.getByText('内容目录')).toBeTruthy()
      expect(screen.getByRole('button', { name: '← 返回灵感' })).toBeTruthy()
      expect(screen.getByRole('link', { name: '回到顶部' })).toBeTruthy()
    })
  })

  it('drags pitch from writing status to done status and saves updated frontmatter', async () => {
    const writingPitchItem: PostIndexItem = {
      path: 'source/_pitches/2026-04-05-writing-pitch.md',
      sha: 'sha-pitch-w',
      title: '写作中的技术思考',
      date: '2026-04-05 10:00:00',
      desc: '灵感记录',
      published: false,
      hasExplicitPublished: false,
      categories: [],
      tags: ['技术'],
      permalink: null,
      cover: null,
      contentType: 'pitch',
      pitchStatus: 'writing',
    }

    const writingPitchContent = `---
title: 写作中的技术思考
date: 2026-04-05 10:00:00
pitch: true
pitch_status: writing
tags:
  - 技术
---

写作中的技术思考内容。`

    vi.spyOn(sessionModule, 'readStoredSession').mockReturnValue({ token: 'test-token' })
    vi.spyOn(postsModule, 'buildPostIndex').mockResolvedValue([])
    vi.spyOn(postsModule, 'buildPitchIndex').mockResolvedValue([writingPitchItem])
    vi.spyOn(githubClientModule, 'fetchMarkdownFile').mockResolvedValue({
      path: writingPitchItem.path,
      sha: writingPitchItem.sha,
      content: writingPitchContent,
    })
    const saveMock = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: writingPitchItem.path,
      sha: 'new-sha-done',
    })

    render(<App />)

    await waitFor(() => {
      expect(screen.queryByText('加载中…')).toBeNull()
    })

    fireEvent.click(screen.getByRole('radio', { name: '灵感' }))

    await waitFor(() => {
      expect(screen.getByText('写作中的技术思考')).toBeTruthy()
    })

    const card = screen.getByText('写作中的技术思考').closest('article')
    const kanbanBoard = screen.getByLabelText('灵感看板')
    const doneCol = kanbanBoard.querySelector('.post-dashboard__kanban-col--done')

    if (!card || !doneCol) {
      throw new Error('missing elements for drag test')
    }

    const dataTransferData = new Map<string, string>()
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn((type: string, value: string) => {
        dataTransferData.set(type, value)
      }),
      getData: vi.fn((type: string) => dataTransferData.get(type) || ''),
    }

    fireEvent.dragStart(card, { dataTransfer })
    fireEvent.dragOver(doneCol, { dataTransfer })
    fireEvent.drop(doneCol, { dataTransfer })

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalledWith(
        { token: 'test-token' },
        expect.objectContaining({
          path: writingPitchItem.path,
          content: expect.stringContaining('pitch_status: done'),
        }),
      )
      expect(screen.getByText(/已将灵感《写作中的技术思考》移动到「已完成」/)).toBeTruthy()
    })
  })
})
