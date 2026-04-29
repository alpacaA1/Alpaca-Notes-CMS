import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SettingsPanel from './settings-panel'
import { createNewPost } from '../posts/new-post'
import type { ParsedPost } from '../posts/parse-post'
import type { PostValidationErrors } from '../posts/post-types'
import { createNewReadLaterItem, createReadLaterBody } from '../read-later/new-item'

const annotation = {
  id: 'annotation-1',
  sectionKey: 'articleExcerpt' as const,
  quote: '这是一段很长很长的高亮内容，用来展示高亮卡片的摘录区域。'.repeat(4),
  prefix: '前文',
  suffix: '后文',
  note: '已有批注',
  createdAt: '2026-04-29T08:00:00.000Z',
  updatedAt: '2026-04-29T08:00:00.000Z',
}

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
      pinned: false,
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
  contentType?: 'post' | 'read-later'
}

function renderControlledSettingsPanel({
  document = createNewPost(new Date(2026, 3, 3, 10, 11, 12)),
  validationErrors = {},
  publishLocked = false,
  availableCategories = ['专业', '思考'],
  availableTags = ['产品', '记录'],
  contentType = 'post',
}: RenderSettingsPanelOptions = {}) {
  const onFieldChange = vi.fn()
  const onBodyChange = vi.fn()

  function Harness() {
    const [currentDocument, setCurrentDocument] = useState(document)

    return (
      <SettingsPanel
        document={currentDocument}
        validationErrors={validationErrors}
        publishLocked={publishLocked}
        contentType={contentType}
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
        onBodyChange={(body) => {
          onBodyChange(body)
          setCurrentDocument((current) =>
            current
              ? {
                  ...current,
                  body,
                }
              : current,
          )
        }}
      />
    )
  }

  render(<Harness />)

  return { onFieldChange, onBodyChange }
}

describe('settings panel', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('edits title date desc published pinned taxonomy selections and permalink', () => {
    const { onFieldChange } = renderControlledSettingsPanel()

    fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'New title' } })
    fireEvent.change(screen.getByLabelText('日期'), {
      target: { value: '2026-04-03T10:12:13' },
    })
    fireEvent.change(screen.getByLabelText('摘要'), { target: { value: 'New desc' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '已发布' }))
    fireEvent.click(screen.getByRole('checkbox', { name: '置顶' }))

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
    expect(onFieldChange).toHaveBeenCalledWith('pinned', true)
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
        contentType="post"
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
        contentType="post"
        availableCategories={[]}
        availableTags={[]}
        onFieldChange={vi.fn()}
      />,
    )

    expect(screen.getByText('永久链接请填写站内相对路径，例如 zhenai/。')).toBeTruthy()
  })

  it('renders read-later settings and updates external metadata fields', () => {
    const onImportFromUrl = vi.fn()
    const { onFieldChange } = renderControlledSettingsPanel({
      document: createNewReadLaterItem(new Date(2026, 3, 3, 10, 11, 12)),
      contentType: 'read-later',
    })

    cleanup()
    render(
      <SettingsPanel
        document={createNewReadLaterItem(new Date(2026, 3, 3, 10, 11, 12))}
        validationErrors={{}}
        publishLocked={false}
        contentType="read-later"
        availableCategories={[]}
        availableTags={[]}
        onFieldChange={onFieldChange}
        onImportFromUrl={onImportFromUrl}
      />,
    )

    expect(screen.queryByText('待读设置')).toBeNull()
    expect(screen.queryByText('当前待读')).toBeNull()
    expect(screen.getByRole('tab', { name: '信息' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '评论' })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: '已发布' })).toBeNull()
    expect(screen.queryByLabelText('永久链接')).toBeNull()
    expect(screen.getByLabelText('站内详情链接')).toBeTruthy()

    const importButton = screen.getByRole('button', { name: '从链接导入正文' }) as HTMLButtonElement
    expect(importButton.disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('原文链接'), { target: { value: 'https://example.com/article' } })
    fireEvent.change(screen.getByLabelText('来源'), { target: { value: 'Example Source' } })
    fireEvent.change(screen.getByLabelText('阅读状态'), { target: { value: 'reading' } })

    expect(onFieldChange).toHaveBeenCalledWith('external_url', 'https://example.com/article')
    expect(onFieldChange).toHaveBeenCalledWith('source_name', 'Example Source')
    expect(onFieldChange).toHaveBeenCalledWith('reading_status', 'reading')
  })

  it('enables and triggers read-later import button', () => {
    const onImportFromUrl = vi.fn()
    render(
      <SettingsPanel
        document={{
          ...createNewReadLaterItem(new Date(2026, 3, 3, 10, 11, 12)),
          frontmatter: {
            ...createNewReadLaterItem(new Date(2026, 3, 3, 10, 11, 12)).frontmatter,
            external_url: 'https://example.com/article',
          },
        }}
        validationErrors={{}}
        publishLocked={false}
        contentType="read-later"
        availableCategories={[]}
        availableTags={[]}
        onFieldChange={vi.fn()}
        onImportFromUrl={onImportFromUrl}
        isImportingFromUrl
      />,
    )

    const importingButton = screen.getByRole('button', { name: '导入中…' }) as HTMLButtonElement
    expect(importingButton.disabled).toBe(true)

    cleanup()
    render(
      <SettingsPanel
        document={{
          ...createNewReadLaterItem(new Date(2026, 3, 3, 10, 11, 12)),
          frontmatter: {
            ...createNewReadLaterItem(new Date(2026, 3, 3, 10, 11, 12)).frontmatter,
            external_url: 'https://example.com/article',
          },
        }}
        validationErrors={{}}
        publishLocked={false}
        contentType="read-later"
        availableCategories={[]}
        availableTags={[]}
        onFieldChange={vi.fn()}
        onImportFromUrl={onImportFromUrl}
      />,
    )

    const importButton = screen.getByRole('button', { name: '从链接导入正文' }) as HTMLButtonElement
    expect(importButton.disabled).toBe(false)
    fireEvent.click(importButton)
    expect(onImportFromUrl).toHaveBeenCalledTimes(1)
  })

  it('switches read-later sidebar to a single document note editor and preserves existing sections on save', () => {
    const { onBodyChange } = renderControlledSettingsPanel({
      document: {
        ...createNewReadLaterItem(new Date(2026, 3, 3, 10, 11, 12)),
        body: createReadLaterBody({
          articleExcerpt: '# 原始正文\n\n第二段',
          summary: '已有总结',
          commentary: '',
        }),
      },
      contentType: 'read-later',
    })

    fireEvent.click(screen.getByRole('tab', { name: '评论' }))

    expect(screen.queryByLabelText('标题')).toBeNull()
    expect(screen.queryByLabelText('原文摘录')).toBeNull()
    expect(screen.queryByLabelText('我的总结')).toBeNull()
    expect(screen.queryByLabelText('我的评论')).toBeNull()
    expect(screen.getByText('Document note')).toBeTruthy()
    expect(screen.getByText('Add a document note...')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Document note' }))
    fireEvent.change(screen.getByLabelText('Document note'), { target: { value: '补一条评论' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onBodyChange).toHaveBeenCalledWith(
      createReadLaterBody({
        articleExcerpt: '# 原始正文\n\n第二段',
        summary: '已有总结',
        commentary: '补一条评论',
      }),
    )
    expect(screen.getByRole('button', { name: 'Document note' })).toBeTruthy()
    expect(screen.getByText('补一条评论')).toBeTruthy()
  })

  it('renders highlight cards and saves highlight notes in commentary tab', () => {
    const onSaveAnnotationNote = vi.fn()
    const onCancelAnnotationEdit = vi.fn()

    render(
      <SettingsPanel
        document={createNewReadLaterItem(new Date(2026, 3, 3, 10, 11, 12))}
        validationErrors={{}}
        publishLocked={false}
        contentType="read-later"
        availableCategories={[]}
        availableTags={[]}
        onFieldChange={vi.fn()}
        readLaterTab="commentary"
        annotations={[annotation]}
        activeAnnotationId={annotation.id}
        editingAnnotationId={annotation.id}
        onSaveAnnotationNote={onSaveAnnotationNote}
        onCancelAnnotationEdit={onCancelAnnotationEdit}
      />,
    )

    expect(screen.getByText('Highlights')).toBeTruthy()
    expect(screen.getByText(annotation.quote)).toBeTruthy()
    expect(screen.getByText(annotation.quote).className).toContain('settings-panel__annotation-quote')
    expect(screen.getByLabelText('Highlight document note')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Highlight document note'), { target: { value: '新的高亮批注' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSaveAnnotationNote).toHaveBeenCalledWith(annotation.id, '新的高亮批注')
  })

  it('does not show delete action in the active highlight card', () => {
    render(
      <SettingsPanel
        document={createNewReadLaterItem(new Date(2026, 3, 3, 10, 11, 12))}
        validationErrors={{}}
        publishLocked={false}
        contentType="read-later"
        availableCategories={[]}
        availableTags={[]}
        onFieldChange={vi.fn()}
        readLaterTab="commentary"
        annotations={[annotation]}
        activeAnnotationId={annotation.id}
      />,
    )

    expect(screen.queryByRole('button', { name: '删除高亮' })).toBeNull()
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
    expect((screen.getByRole('checkbox', { name: '已发布' }) as HTMLInputElement).disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: '置顶' }) as HTMLInputElement).checked).toBe(false)

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
