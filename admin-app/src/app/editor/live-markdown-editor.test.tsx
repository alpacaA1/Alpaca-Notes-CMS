import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import LiveMarkdownEditor from './live-markdown-editor'

function renderControlledLiveEditor(initialValue: string) {
  function Harness() {
    const [value, setValue] = useState(initialValue)

    return (
      <LiveMarkdownEditor
        value={value}
        documentKey="test-doc"
        title="预览标题"
        date="2026-05-17 09:00:00"
        contentType="post"
        contentFormat="markdown"
        previewImageUrls={{
          '/Alpaca-Notes-CMS/images/2026/05/demo.png': 'blob://preview-demo',
        }}
        onChange={setValue}
        resolveInternalReferenceTitle={(targetKey) => (targetKey === 'post:ref' ? '参考文章' : null)}
      />
    )
  }

  render(<Harness />)
  return screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement
}

describe('LiveMarkdownEditor', () => {
  afterEach(() => {
    cleanup()
  })

  it('keeps a single editable block while previous blocks are rendered in the same canvas', async () => {
    const editor = renderControlledLiveEditor('## 需求背景\n\n- 列表项\n\n[[post:ref|参考文章]]')

    expect(screen.queryByText('预览标题')).toBeNull()
    expect(screen.queryByRole('navigation', { name: '文章目录' })).toBeNull()
    expect(screen.getAllByLabelText('Markdown 编辑器')).toHaveLength(1)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '需求背景' })).toBeTruthy()
      expect(screen.getByText('列表项')).toBeTruthy()
    })

    expect(editor.value).toBe('[[post:ref|参考文章]]')

    const headingBlock = screen.getByRole('heading', { name: '需求背景' }).closest('.single-pane-live-editor__block')
    if (!headingBlock) {
      throw new Error('Missing heading preview block.')
    }

    fireEvent.click(headingBlock)

    await waitFor(() => {
      expect((screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement).value).toBe('## 需求背景')
    })
  })

  it('commits the current block into preview and opens a new editable block after pressing Enter', async () => {
    const editor = renderControlledLiveEditor('')

    fireEvent.change(editor, {
      target: {
        value: '![示意图](/Alpaca-Notes-CMS/images/2026/05/demo.png)\n\n[[post:ref|参考文章]]',
      },
    })

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByAltText('示意图')).toBeTruthy()
      expect(screen.getByText('参考文章')).toBeTruthy()
      expect((screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement).value).toBe('')
    })
  })
})
