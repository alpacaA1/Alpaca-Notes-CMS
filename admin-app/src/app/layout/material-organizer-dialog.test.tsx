import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MaterialOrganizerDialog from './material-organizer-dialog'
import type { PostIndexItem } from '../posts/post-types'

const diaryPosts: PostIndexItem[] = [
  {
    path: 'source/diary/20260510010101.md',
    sha: 'sha-diary-1',
    title: '五月十日日记',
    date: '2026-05-10 01:01:01',
    desc: '整理周报素材',
    published: false,
    hasExplicitPublished: true,
    categories: [],
    tags: [],
    permalink: null,
    cover: null,
  },
  {
    path: 'source/diary/20260511010101.md',
    sha: 'sha-diary-2',
    title: '五月十一日日记',
    date: '2026-05-11 01:01:01',
    desc: '写完周报',
    published: false,
    hasExplicitPublished: true,
    categories: [],
    tags: [],
    permalink: null,
    cover: null,
  },
  {
    path: 'source/diary/20260430010101.md',
    sha: 'sha-diary-3',
    title: '四月末日记',
    date: '2026-04-30 01:01:01',
    desc: '收尾工作',
    published: false,
    hasExplicitPublished: true,
    categories: [],
    tags: [],
    permalink: null,
    cover: null,
  },
]

const readLaterPosts: PostIndexItem[] = [
  {
    path: 'source/read-later/20260510-a.md',
    sha: 'sha-rl-1',
    title: '五月十日待读',
    date: '2026-05-10 09:30:00',
    desc: '',
    published: false,
    hasExplicitPublished: false,
    categories: [],
    tags: [],
    permalink: null,
    cover: null,
    sourceName: 'A Source',
  },
  {
    path: 'source/read-later/20260430-a.md',
    sha: 'sha-rl-2',
    title: '四月末待读',
    date: '2026-04-30 09:30:00',
    desc: '',
    published: false,
    hasExplicitPublished: false,
    categories: [],
    tags: [],
    permalink: null,
    cover: null,
    sourceName: 'B Source',
  },
]

function renderDialog(initialSelectedDiaryPaths: string[] = []) {
  function Harness() {
    const [selectedMaterialPaths, setSelectedMaterialPaths] = useState({
      diary: initialSelectedDiaryPaths,
      'read-later': [] as string[],
    })

    return (
      <MaterialOrganizerDialog
        diaryPosts={diaryPosts}
        readLaterPosts={readLaterPosts}
        selectedMaterialPaths={selectedMaterialPaths}
        onSelectedMaterialPathsChange={(type, paths) => {
          setSelectedMaterialPaths((current) => ({
            ...current,
            [type]: paths,
          }))
        }}
        onClearSelectedMaterials={() => {
          setSelectedMaterialPaths({
            diary: [],
            'read-later': [],
          })
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
  }

  render(<Harness />)
}

describe('material organizer dialog', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('filters diary and read-later materials by year, month, and day', () => {
    renderDialog()

    fireEvent.change(screen.getByLabelText('筛选年份'), { target: { value: '2026' } })
    fireEvent.change(screen.getByLabelText('筛选月份'), { target: { value: '05' } })
    fireEvent.change(screen.getByLabelText('筛选日期'), { target: { value: '10' } })

    expect(screen.getByText('五月十日日记')).toBeTruthy()
    expect(screen.getByText('五月十日待读')).toBeTruthy()
    expect(screen.queryByText('五月十一日日记')).toBeNull()
    expect(screen.queryByText('四月末日记')).toBeNull()
    expect(screen.queryByText('四月末待读')).toBeNull()
    expect(screen.getByText('当前显示 1 篇日记 · 1 条待读')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '清空日期筛选' }))

    expect((screen.getByLabelText('筛选年份') as HTMLSelectElement).value).toBe('')
    expect((screen.getByLabelText('筛选月份') as HTMLSelectElement).value).toBe('')
    expect((screen.getByLabelText('筛选日期') as HTMLSelectElement).value).toBe('')
    expect(screen.getByText('五月十一日日记')).toBeTruthy()
    expect(screen.getByText('四月末待读')).toBeTruthy()
  })

  it('applies section full select and clear only to the currently visible diary items', () => {
    renderDialog([diaryPosts[2].path])

    fireEvent.change(screen.getByLabelText('筛选年份'), { target: { value: '2026' } })
    fireEvent.change(screen.getByLabelText('筛选月份'), { target: { value: '05' } })
    fireEvent.change(screen.getByLabelText('筛选日期'), { target: { value: '10' } })

    const diarySection = screen.getByRole('region', { name: '日记' })

    fireEvent.click(within(diarySection).getByRole('button', { name: '全选' }))
    expect(screen.getByText('当前已选 2 篇日记')).toBeTruthy()
    expect(within(diarySection).getByText('1/2 条当前已显示')).toBeTruthy()

    fireEvent.click(within(diarySection).getByRole('button', { name: '清空' }))
    expect(screen.getByText('当前已选 1 篇日记')).toBeTruthy()
    expect(within(diarySection).getByText('0/1 条当前已显示')).toBeTruthy()
  })
})
