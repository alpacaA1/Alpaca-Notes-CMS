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
    Reflect.deleteProperty(document, 'caretRangeFromPoint')
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

  it('places the caret near the clicked position when reactivating a rendered paragraph', async () => {
    renderControlledLiveEditor('第一段长文本\n\n最后段')

    await waitFor(() => {
      expect(screen.getByText('第一段长文本')).toBeTruthy()
    })

    const paragraph = screen.getByText('第一段长文本')
    const paragraphText = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode()
    if (!paragraphText) {
      throw new Error('Missing rendered paragraph text node.')
    }

    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => {
        const range = document.createRange()
        range.setStart(paragraphText, 2)
        range.collapse(true)
        return range
      },
    })

    fireEvent.click(paragraph, { clientX: 160, clientY: 120 })

    await waitFor(() => {
      const editor = screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement
      expect(editor.value).toBe('第一段长文本')
      expect(editor.selectionStart).toBe(2)
      expect(editor.selectionEnd).toBe(2)
    })
  })

  it('places the caret inside the heading text when reactivating a rendered heading', async () => {
    renderControlledLiveEditor('### 标题内容\n\n最后段')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '标题内容' })).toBeTruthy()
    })

    const heading = screen.getByRole('heading', { name: '标题内容' })
    const headingText = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT).nextNode()
    if (!headingText) {
      throw new Error('Missing rendered heading text node.')
    }

    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => {
        const range = document.createRange()
        range.setStart(headingText, 2)
        range.collapse(true)
        return range
      },
    })

    fireEvent.click(heading, { clientX: 180, clientY: 120 })

    await waitFor(() => {
      const editor = screen.getByRole('textbox', { name: 'Markdown 标题编辑器' })
      const selection = window.getSelection()
      expect(editor.textContent).toBe('标题内容')
      expect(selection?.anchorNode).toBe(editor.firstChild)
      expect(selection?.anchorOffset).toBe(2)
    })
  })

  it('keeps a cross-block text selection instead of activating a rendered block', async () => {
    const editor = renderControlledLiveEditor('第一段\n\n第二段\n\n第三段')

    await waitFor(() => {
      expect(screen.getByText('第一段')).toBeTruthy()
      expect(screen.getByText('第二段')).toBeTruthy()
    })

    const firstBlock = screen.getByText('第一段').closest('.single-pane-live-editor__block')
    const secondBlock = screen.getByText('第二段').closest('.single-pane-live-editor__block')
    const firstTextNode = screen.getByText('第一段').firstChild
    const secondTextNode = screen.getByText('第二段').firstChild

    if (!firstBlock || !secondBlock || !firstTextNode || !secondTextNode) {
      throw new Error('Missing rendered paragraph blocks.')
    }

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(firstTextNode, 0)
    range.setEnd(secondTextNode, '第二段'.length)
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(firstBlock)

    expect(selection?.toString()).toContain('第一段')
    expect(selection?.toString()).toContain('第二段')
    expect((screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement).value).toBe(editor.value)
    expect(screen.getByText('第一段')).toBeTruthy()
  })

  it('restores selection across the active textarea boundary when dragging upward', async () => {
    const editor = renderControlledLiveEditor('## 二、剧情和情感\n\n1. 引子是阿嬷的孙子\n2. 到了泰国后四处打听\n3. 此时切换到南枝的视角')

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '二、剧情和情感' })).toBeTruthy()
      expect(editor.value).toContain('1. 引子')
    })

    Object.defineProperty(editor, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 120,
        y: 240,
        top: 240,
        left: 120,
        right: 900,
        bottom: 520,
        width: 780,
        height: 280,
        toJSON: () => ({}),
      }),
    })

    Object.defineProperty(document, 'caretRangeFromPoint', {
      configurable: true,
      value: () => {
        const headingText = screen.getByRole('heading', { name: '二、剧情和情感' }).firstChild
        if (!headingText) {
          throw new Error('Missing heading text node.')
        }

        const range = document.createRange()
        range.setStart(headingText, 0)
        range.collapse(true)
        return range
      },
    })

    editor.focus()
    fireEvent.mouseDown(editor, { button: 0, clientX: 180, clientY: 500 })
    editor.setSelectionRange(0, '1. 引子是阿嬷的孙子\n2. 到了泰国后四处打听'.length)
    fireEvent.mouseMove(document, { clientX: 140, clientY: 200 })

    await waitFor(() => {
      expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
      const selectedText = window.getSelection()?.toString() || ''
      expect(selectedText).toContain('二、剧情和情感')
      expect(selectedText).toContain('1. 引子是阿嬷的孙子')
      expect(selectedText).toContain('2. 到了泰国后四处打听')
    })

    fireEvent.mouseUp(document, { clientX: 140, clientY: 200 })
  })

  it('selects the whole live document with the select-all shortcut', async () => {
    const editor = renderControlledLiveEditor('第一段\n\n第二段\n\n第三段')

    await waitFor(() => {
      expect(screen.getByText('第一段')).toBeTruthy()
      expect(screen.getByText('第二段')).toBeTruthy()
      expect(editor.value).toBe('第三段')
    })

    editor.focus()
    fireEvent.keyDown(editor, { key: 'a', metaKey: true })

    await waitFor(() => {
      expect(screen.queryByLabelText('Markdown 编辑器')).toBeNull()
      const selectedText = window.getSelection()?.toString() || ''
      expect(selectedText).toContain('第一段')
      expect(selectedText).toContain('第二段')
      expect(selectedText).toContain('第三段')
    })
  })

  it('deletes a selected rendered range with Delete', async () => {
    renderControlledLiveEditor('第一段\n\n第二段\n\n第三段')

    await waitFor(() => {
      expect(screen.getByText('第一段')).toBeTruthy()
      expect(screen.getByText('第二段')).toBeTruthy()
    })

    const firstTextNode = screen.getByText('第一段').firstChild
    const secondTextNode = screen.getByText('第二段').firstChild
    if (!firstTextNode || !secondTextNode) {
      throw new Error('Missing rendered paragraph text nodes.')
    }

    const selection = window.getSelection()
    const range = document.createRange()
    range.setStart(firstTextNode, 1)
    range.setEnd(secondTextNode, 2)
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.keyDown(document, { key: 'Delete' })

    await waitFor(() => {
      const editor = screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement
      expect(editor.value).toBe('第段')
    })
    expect(screen.queryByText('第一段')).toBeNull()
    expect(screen.queryByText('第二段')).toBeNull()
    expect(screen.getByText('第三段')).toBeTruthy()
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

  it('undoes and redoes a live editor block kind switch with ctrl shortcuts', async () => {
    const editor = renderControlledLiveEditor('')

    fireEvent.change(editor, {
      target: { value: '### 新标题' },
    })

    const headingEditor = await screen.findByRole('textbox', { name: 'Markdown 标题编辑器' })
    headingEditor.focus()
    fireEvent.keyDown(headingEditor, { key: 'z', ctrlKey: true })

    const plainEditor = await screen.findByLabelText('Markdown 编辑器') as HTMLTextAreaElement
    expect(plainEditor.value).toBe('')

    fireEvent.keyDown(plainEditor, { key: 'y', ctrlKey: true })

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Markdown 标题编辑器' }).textContent).toBe('新标题')
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
