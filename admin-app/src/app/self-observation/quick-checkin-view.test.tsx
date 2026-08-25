import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as githubClientModule from '../github-client'
import * as indexPostsModule from '../posts/index-posts'
import QuickCheckinView from './quick-checkin-view'
import { getPendingObservationCount } from './self-observation-outbox'

describe('QuickCheckinView', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    vi.spyOn(indexPostsModule, 'buildDiaryIndex').mockResolvedValue([])
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders emotion checkin by default with submit button disabled until an emotion is picked', () => {
    render(<QuickCheckinView />)

    expect(screen.getByText('我现在')).toBeTruthy()
    expect(screen.getByRole('button', { name: '烦' })).toBeTruthy()

    const submitBtn = screen.getByRole('button', { name: '先记下来' }) as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)

    // Tap "烦"
    fireEvent.click(screen.getByRole('button', { name: '烦' }))
    expect(submitBtn.disabled).toBe(false)

    // Tap "烦" again to deselect
    fireEvent.click(screen.getByRole('button', { name: '烦' }))
    expect(submitBtn.disabled).toBe(true)
  })

  it('allows selecting up to 3 emotions and records to outbox on submit', async () => {
    const saveSpy = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: 'source/diary/20260825000000.md',
      sha: 'sha-saved-1',
      content: 'content',
    })

    render(<QuickCheckinView session={{ token: 'mock-token' }} />)

    fireEvent.click(screen.getByRole('button', { name: '烦' }))
    fireEvent.click(screen.getByRole('button', { name: '紧张' }))
    fireEvent.click(screen.getByRole('button', { name: '说不清' }))

    // Expand "补充一句（可选）"
    fireEvent.click(screen.getByRole('button', { name: /补充一句/ }))
    const textarea = screen.getByPlaceholderText('发生了什么…')
    fireEvent.change(textarea, { target: { value: '开会时被临时提问' } })

    // Pick "我想"
    fireEvent.click(screen.getByRole('button', { name: '停一下' }))

    // Submit
    const submitBtn = screen.getByRole('button', { name: '先记下来' })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('已记录。')).toBeTruthy()
    })

    expect(saveSpy).toHaveBeenCalledTimes(1)
    const savedContent = saveSpy.mock.calls[0]?.[1]?.content
    expect(savedContent).toContain('## 自我观察')
    expect(savedContent).toContain('- 我现在：烦、紧张、说不清')
    expect(savedContent).toContain('- 发生了什么：开会时被临时提问')
    expect(savedContent).toContain('- 我想：停一下')
  })

  it('opens drawer on 其他, selects drawer item and auto closes', async () => {
    render(<QuickCheckinView />)

    fireEvent.click(screen.getByRole('button', { name: '其他' }))
    expect(screen.getByRole('dialog', { name: '选择更多情绪词' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '委屈' }))
    expect(screen.queryByRole('dialog', { name: '选择更多情绪词' })).toBeNull()

    // "委屈" is now visible in the primary chips list and selected
    const weiquBtn = screen.getByRole('button', { name: '委屈' })
    expect(weiquBtn.className).toContain('is-selected')
  })

  it('switches to behavior mode and records behavior attempt', async () => {
    const saveSpy = vi.spyOn(githubClientModule, 'saveMarkdownFile').mockResolvedValue({
      path: 'source/diary/20260825000000.md',
      sha: 'sha-saved-1',
      content: 'content',
    })

    render(<QuickCheckinView session={{ token: 'mock-token' }} />)

    // Switch to behavior mode
    fireEvent.click(screen.getByRole('button', { name: '行为记录' }))
    expect(screen.getByText('我做了')).toBeTruthy()

    const submitBtn = screen.getByRole('button', { name: '记录这次尝试' }) as HTMLButtonElement
    expect(submitBtn.disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '表达需求' }))
    expect(submitBtn.disabled).toBe(false)

    const textarea = screen.getByPlaceholderText(/我说想早点回去/)
    fireEvent.change(textarea, { target: { value: '主动说了自己的真实想法' } })

    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('已记录。')).toBeTruthy()
    })

    expect(saveSpy).toHaveBeenCalledTimes(1)
    const savedContent = saveSpy.mock.calls[0]?.[1]?.content
    expect(savedContent).toContain('## 自我观察')
    expect(savedContent).toContain('行为尝试')
    expect(savedContent).toContain('- 我做了：表达需求')
    expect(savedContent).toContain('- 实际发生了什么：主动说了自己的真实想法')
  })
})
