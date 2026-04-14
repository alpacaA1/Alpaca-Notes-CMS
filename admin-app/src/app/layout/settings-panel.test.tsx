import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsPanel from './settings-panel'
import { createNewPost } from '../posts/new-post'
import type { ParsedPost } from '../posts/parse-post'
import type { PostValidationErrors } from '../posts/post-types'

function createExistingPost(): ParsedPost {
  return {
    path: 'source/_posts/existing.md',
    sha: 'sha-existing',
    hasExplicitPublished: true,
    hasExplicitPermalink: false,
    frontmatter: {
      title: 'Existing post',
      date: '2026-04-03 12:00:00',
      desc: 'Existing desc',
      published: true,
      categories: ['专业'],
      tags: ['产品'],
    },
    body: 'Existing body',
  }
}

type RenderSettingsPanelOptions = {
  document?: ParsedPost
  validationErrors?: PostValidationErrors
  publishLocked?: boolean
  availableCategories?: string[]
  availableTags?: string[]
}

function renderControlledSettingsPanel({
  document = createNewPost(new Date(2026, 3, 3, 10, 11, 12)),
  validationErrors = {},
  publishLocked = false,
  availableCategories = ['专业', '思考'],
  availableTags = ['产品', '记录'],
}: RenderSettingsPanelOptions = {}) {
  const onFieldChange = vi.fn()

  function Harness() {
    const [currentDocument, setCurrentDocument] = useState(document)

    return (
      <SettingsPanel
        document={currentDocument}
        validationErrors={validationErrors}
        publishLocked={publishLocked}
        availableCategories={availableCategories}
        availableTags={availableTags}
        onFieldChange={(field, value) => {
          onFieldChange(field, value)
          setCurrentDocument((current) =>
            current
              ? {
                  ...current,
                  frontmatter: {
                    ...current.frontmatter,
                    [field]: value,
                  } as ParsedPost['frontmatter'],
                }
              : current,
          )
        }}
      />
    )
  }

  render(<Harness />)

  return { onFieldChange }
}

describe('settings panel', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('edits title date desc published taxonomy selections and permalink', () => {
    const { onFieldChange } = renderControlledSettingsPanel()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'New title' } })
    fireEvent.change(screen.getByLabelText('日期'), {
      target: { value: '2026-04-03T10:12:13' },
    })
    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: 'New desc' } })
    fireEvent.click(screen.getByRole('checkbox'))

    fireEvent.click(screen.getByRole('button', { name: '选择分类' }))
    fireEvent.change(screen.getByLabelText('搜索分类'), { target: { value: '思' } })
    fireEvent.click(screen.getByRole('option', { name: '思考' }))
    expect(screen.getByRole('button', { name: '移除分类 思考' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '选择标签' }))
    fireEvent.click(screen.getByRole('option', { name: '记录' }))
    expect(screen.getByRole('button', { name: '移除标签 记录' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '移除分类 思考' }))
    fireEvent.change(screen.getByLabelText('永久链接'), { target: { value: 'new-title/' } })

    expect(onFieldChange).toHaveBeenCalledWith('title', 'New title')
    expect(onFieldChange).toHaveBeenCalledWith('date', '2026-04-03 10:12:13')
    expect(onFieldChange).toHaveBeenCalledWith('desc', 'New desc')
    expect(onFieldChange).toHaveBeenCalledWith('published', true)
    expect(onFieldChange).toHaveBeenCalledWith('categories', ['思考'])
    expect(onFieldChange).toHaveBeenCalledWith('categories', [])
    expect(onFieldChange).toHaveBeenCalledWith('tags', ['记录'])
    expect(onFieldChange).toHaveBeenCalledWith('permalink', 'new-title/')
  })

  it('shows validation errors for required fields', () => {
    render(
      <SettingsPanel
        document={createNewPost(new Date(2026, 3, 3, 10, 11, 12))}
        validationErrors={{
          title: '请填写标题。',
          desc: '请填写摘要。',
          permalink: '首次保存前请填写永久链接。',
        }}
        publishLocked={false}
        availableCategories={[]}
        availableTags={[]}
        onFieldChange={vi.fn()}
      />,
    )

    expect(screen.getByText('请填写标题。')).toBeTruthy()
    expect(screen.getByText('请填写摘要。')).toBeTruthy()
    expect(screen.getByText('首次保存前请填写永久链接。')).toBeTruthy()
  })

  it('shows permalink validation errors for absolute URLs', () => {
    render(
      <SettingsPanel
        document={createNewPost(new Date(2026, 3, 3, 10, 11, 12))}
        validationErrors={{
          permalink: '永久链接请填写站内相对路径，例如 zhenai/。',
        }}
        publishLocked={false}
        availableCategories={[]}
        availableTags={[]}
        onFieldChange={vi.fn()}
      />,
    )

    expect(screen.getByText('永久链接请填写站内相对路径，例如 zhenai/。')).toBeTruthy()
  })

  it('keeps existing taxonomy selections visible and removable when indexed options are empty for existing posts', () => {
    const { onFieldChange } = renderControlledSettingsPanel({
      document: createExistingPost(),
      publishLocked: true,
      availableCategories: [],
      availableTags: [],
    })

    expect((screen.getByLabelText('日期') as HTMLInputElement).value).toBe('2026-04-03T12:00')
    expect(screen.getByPlaceholderText('旧文章可留空')).toBeTruthy()
    expect(screen.getByRole('button', { name: '移除分类 专业' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '移除标签 产品' })).toBeTruthy()
    expect(screen.getByRole('checkbox').hasAttribute('disabled')).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '选择分类' }))
    expect(screen.getByText('暂无已索引的分类。')).toBeTruthy()
    expect(screen.queryByLabelText('搜索分类')).toBe(null)

    fireEvent.click(screen.getByRole('button', { name: '移除分类 专业' }))

    fireEvent.click(screen.getByRole('button', { name: '选择标签' }))
    expect(screen.getByText('暂无已索引的标签。')).toBeTruthy()
    expect(screen.queryByLabelText('搜索标签')).toBe(null)

    fireEvent.click(screen.getByRole('button', { name: '移除标签 产品' }))

    expect(onFieldChange).toHaveBeenCalledWith('categories', [])
    expect(onFieldChange).toHaveBeenCalledWith('tags', [])
  })
})
