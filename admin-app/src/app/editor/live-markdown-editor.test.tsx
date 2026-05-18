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
      expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
      const editor = screen.getByRole('textbox', { name: 'Markdown 标题编辑器' })
      expect(editor.textContent).toBe('需求背景')
      expect(editor.parentElement?.textContent).toContain('## ')
    })
  })

  it('reactivates a heading node when clicking the rendered heading line itself', async () => {
    renderControlledLiveEditor('### 一\n\n第二段')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '一' })).toBeTruthy()
      expect(screen.getByText('第二段')).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('heading', { name: '一' }))

    await waitFor(() => {
      const editor = screen.getByRole('textbox', { name: 'Markdown 标题编辑器' })
      expect(editor.textContent).toBe('一')
      expect(editor.parentElement?.textContent).toContain('### ')
    })
  })

  it('splits an active heading editor into a rendered heading and a fresh paragraph block', async () => {
    function Harness() {
      const [value, setValue] = useState('### 一')

      return (
        <LiveMarkdownEditor
          value={value}
          documentKey="heading-split-doc"
          title="预览标题"
          date="2026-05-17 09:00:00"
          contentType="post"
          contentFormat="markdown"
          onChange={setValue}
        />
      )
    }

    render(<Harness />)

    const editor = await screen.findByRole('textbox', { name: 'Markdown 标题编辑器' })
    editor.focus()

    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(editor)
    range.collapse(false)
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '一' })).toBeTruthy()
      expect((screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement).value).toBe('')
    })
  })

  it('splits a typed heading when the caret is inside the heading text node end', async () => {
    const editor = renderControlledLiveEditor('')

    fireEvent.change(editor, {
      target: { value: '### 一天渡口上看到 但是都是12的撒啥是多少 sd' },
    })

    const headingEditor = await screen.findByRole('textbox', { name: 'Markdown 标题编辑器' })
    const headingTextNode = headingEditor.firstChild
    if (!headingTextNode) {
      throw new Error('Missing heading text node.')
    }

    headingEditor.focus()
    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(headingTextNode, headingTextNode.textContent?.length ?? 0)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.keyDown(headingEditor, { key: 'Enter' })

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '一天渡口上看到 但是都是12的撒啥是多少 sd' })).toBeTruthy()
      expect((screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement).value).toBe('')
    })
  })

  it('uses a rendered rich paragraph editor for inline markdown paragraphs to keep layout stable', async () => {
    function Harness() {
      const [value, setValue] = useState('这是一段 **加粗内容** 和 [链接标题](https://example.com)')

      return (
        <LiveMarkdownEditor
          value={value}
          documentKey="rich-paragraph-doc"
          title="预览标题"
          date="2026-05-17 09:00:00"
          contentType="post"
          contentFormat="markdown"
          onChange={setValue}
        />
      )
    }

    render(<Harness />)

    const editor = await screen.findByRole('textbox', { name: 'Markdown 段落编辑器' })
    expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
    expect(editor.textContent).toContain('加粗内容')
    expect(editor.textContent).toContain('链接标题')
    expect(editor.textContent).not.toContain('**')
    expect(editor.textContent).not.toContain('https://example.com')
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

  it('keeps list editing in the current node when pressing Enter inside a list', () => {
    const editor = renderControlledLiveEditor('- 第一项')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect((screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement).value).toBe('- 第一项\n- ')
    expect(screen.queryByText('第一项')).toBeNull()
  })
})
