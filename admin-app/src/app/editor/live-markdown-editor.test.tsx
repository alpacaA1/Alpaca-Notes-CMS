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
        previewMarkdown={value}
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

  it('renders live markdown content in the same editing canvas without the full preview header', async () => {
    const editor = renderControlledLiveEditor('')

    fireEvent.change(editor, {
      target: {
        value: '## 需求背景\n\n- 列表项\n\n![示意图](/Alpaca-Notes-CMS/images/2026/05/demo.png)\n\n[[post:ref|参考文章]]',
      },
    })

    expect(screen.queryByText('预览标题')).toBeNull()
    expect(screen.queryByRole('navigation', { name: '文章目录' })).toBeNull()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '需求背景' })).toBeTruthy()
      expect(screen.getByText('列表项')).toBeTruthy()
      expect(screen.getByAltText('示意图')).toBeTruthy()
      expect(screen.getByText('参考文章')).toBeTruthy()
    })
  })
})
