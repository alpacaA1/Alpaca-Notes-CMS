import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarkdownEditor from './markdown-editor'

const appStyles = readFileSync(join(process.cwd(), 'src/styles/app.css'), 'utf8')

function renderControlledEditor(initialValue: string) {
  function Harness() {
    const [value, setValue] = useState(initialValue)
    return <MarkdownEditor value={value} onChange={setValue} />
  }

  render(<Harness />)
  return screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement
}

function renderControlledEditorWithUpload(
  initialValue: string,
  onUploadImage: (file: File) => Promise<{ markdown: string }>,
) {
  function Harness() {
    const [value, setValue] = useState(initialValue)
    return <MarkdownEditor value={value} onChange={setValue} onUploadImage={onUploadImage} />
  }

  render(<Harness />)
  return {
    editor: screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement,
    uploadButton: screen.getByRole('button', { name: '上传图片' }) as HTMLButtonElement,
    uploadInput: screen.getByLabelText('上传图片文件') as HTMLInputElement,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, resolve, reject }
}

function createImageFile() {
  return new File(['image'], 'pasted-image.png', { type: 'image/png' })
}

function createClipboardData({
  text = '',
  items = [],
  files = [],
}: {
  text?: string
  items?: Array<{ kind: string; type: string; getAsFile: () => File | null }>
  files?: File[]
}) {
  return {
    getData: (type: string) => (type === 'text/plain' ? text : ''),
    items,
    files,
  }
}

describe('markdown editor', () => {
  afterEach(() => {
    cleanup()
  })

  it('inserts indentation when pressing Tab', () => {
    const editor = renderControlledEditor('1. aaa\na. item')

    editor.focus()
    editor.setSelectionRange(7, 7)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(editor.value).toBe('1. aaa\n  a. item')
    expect(editor.selectionStart).toBe(9)
    expect(editor.selectionEnd).toBe(9)
  })

  it('indents empty list items when pressing Tab', () => {
    const editor = renderControlledEditor('- 12\n- ')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(editor.value).toBe('- 12\n  - ')
    expect(editor.selectionStart).toBe(editor.value.length)
    expect(editor.selectionEnd).toBe(editor.value.length)
    expect(document.activeElement).toBe(editor)
  })

  it('stops Tab from bubbling to parent handlers', () => {
    const onParentKeyDown = vi.fn()

    render(
      <div onKeyDown={onParentKeyDown}>
        <MarkdownEditor value="- " onChange={() => {}} />
      </div>,
    )

    const editor = screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement
    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(onParentKeyDown).not.toHaveBeenCalled()
  })

  it('converts empty ordered items to alphabetic markers when indenting with Tab', () => {
    const editor = renderControlledEditor('1. aaa\n2. ')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(editor.value).toBe('1. aaa\n  a. ')
    expect(editor.selectionStart).toBe(editor.value.length)
    expect(editor.selectionEnd).toBe(editor.value.length)
  })

  it('converts alphabetic ordered items to roman markers when indenting with Tab', () => {
    const editor = renderControlledEditor('1. aaa\n  a. item')

    editor.focus()
    editor.setSelectionRange(7, 7)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(editor.value).toBe('1. aaa\n    i. item')
    expect(editor.selectionStart).toBe(9)
    expect(editor.selectionEnd).toBe(9)
  })

  it('removes indentation when pressing Shift+Tab', () => {
    const editor = renderControlledEditor('1. aaa\n  a. item')

    editor.focus()
    editor.setSelectionRange(9, 9)
    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })

    expect(editor.value).toBe('1. aaa\na. item')
    expect(editor.selectionStart).toBe(7)
    expect(editor.selectionEnd).toBe(7)
  })

  it('indents all selected lines when pressing Tab', () => {
    const editor = renderControlledEditor('1. aaa\na. item\nb. item')

    editor.focus()
    editor.setSelectionRange(7, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(editor.value).toBe('1. aaa\n  a. item\n  b. item')
  })

  it('continues numbered lists when pressing Enter', () => {
    const editor = renderControlledEditor('1. aaa')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('1. aaa\n2. ')
    expect(editor.selectionStart).toBe(editor.value.length)
  })

  it('continues alphabetic lists when pressing Enter', () => {
    const editor = renderControlledEditor('  a. item')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('  a. item\n  b. ')
    expect(editor.selectionStart).toBe(editor.value.length)
  })

  it('continues unordered lists when pressing Enter', () => {
    const editor = renderControlledEditor('- item')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('- item\n- ')
    expect(editor.selectionStart).toBe(editor.value.length)
  })

  it('continues task lists when pressing Enter', () => {
    const editor = renderControlledEditor('- [ ] item')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('- [ ] item\n- [ ] ')
    expect(editor.selectionStart).toBe(editor.value.length)
  })

  it('continues blockquotes when pressing Enter', () => {
    const editor = renderControlledEditor('> quote')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('> quote\n> ')
    expect(editor.selectionStart).toBe(editor.value.length)
  })

  it('continues blockquote lists when pressing Enter', () => {
    const editor = renderControlledEditor('> 1. item')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('> 1. item\n> 2. ')
    expect(editor.selectionStart).toBe(editor.value.length)
  })

  it('continues fenced code blocks when pressing Enter', () => {
    const editor = renderControlledEditor('```js')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('```js\n\n```')
    expect(editor.selectionStart).toBe(6)
    expect(editor.selectionEnd).toBe(6)
  })

  it('preserves indentation when pressing Enter inside code blocks', () => {
    const editor = renderControlledEditor('```js\n  const a = 1')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('```js\n  const a = 1\n  ')
    expect(editor.selectionStart).toBe(editor.value.length)
    expect(editor.selectionEnd).toBe(editor.value.length)
  })

  it('inserts indentation when pressing Tab inside code blocks', () => {
    const editor = renderControlledEditor('```js\n  const a = 1')

    editor.focus()
    editor.setSelectionRange(6, 6)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(editor.value).toBe('```js\n    const a = 1')
    expect(editor.selectionStart).toBe(8)
    expect(editor.selectionEnd).toBe(8)
  })

  it('exits numbered lists when pressing Enter on an empty item', () => {
    const editor = renderControlledEditor('1. ')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('')
    expect(editor.selectionStart).toBe(0)
  })

  it('exits unordered lists when pressing Enter on an empty item', () => {
    const editor = renderControlledEditor('  - ')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('')
    expect(editor.selectionStart).toBe(0)
  })

  it('exits task lists when pressing Enter on an empty item', () => {
    const editor = renderControlledEditor('  - [ ] ')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('')
    expect(editor.selectionStart).toBe(0)
  })

  it('outdents one level when pressing Backspace in leading indentation', () => {
    const editor = renderControlledEditor('    a. item')

    editor.focus()
    editor.setSelectionRange(4, 4)
    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(editor.value).toBe('  a. item')
    expect(editor.selectionStart).toBe(2)
    expect(editor.selectionEnd).toBe(2)
  })

  it('outdents empty list items when pressing Backspace at the end', () => {
    const editor = renderControlledEditor('  - ')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(editor.value).toBe('- ')
    expect(editor.selectionStart).toBe(editor.value.length)
    expect(editor.selectionEnd).toBe(editor.value.length)
  })

  it('renumbers alphabetic empty list items when pressing Backspace to outdent', () => {
    const editor = renderControlledEditor('1. first\n  a. \n  b. ')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(editor.value).toBe('1. first\n  a. \n2. ')
    expect(editor.selectionStart).toBe(editor.value.length)
    expect(editor.selectionEnd).toBe(editor.value.length)
  })

  it('keeps the editor textarea horizontal padding aligned with the editor surface', () => {
    expect(appStyles).toMatch(/\.editor-surface,\s*\.settings-panel,\s*\.preview-pane\s*\{[^}]*padding:\s*24px;/s)
    expect(appStyles).toMatch(/\.editor-textarea\s*\{[^}]*padding:\s*18px 24px;/s)
  })

  it('wraps selected text in bold markers with mod+b', () => {
    const editor = renderControlledEditor('hello')

    editor.focus()
    editor.setSelectionRange(0, 5)
    fireEvent.keyDown(editor, { key: 'b', metaKey: true })

    expect(editor.value).toBe('**hello**')
    expect(editor.selectionStart).toBe(2)
    expect(editor.selectionEnd).toBe(7)
  })

  it('keeps the pre-picker selection when focus shifts before the picker click handler runs', async () => {
    const onUploadImage = vi.fn().mockResolvedValue({ markdown: '![alt](/uploads/image.png)' })
    const { editor, uploadButton, uploadInput } = renderControlledEditorWithUpload(
      'hello world',
      onUploadImage,
    )

    editor.focus()
    editor.setSelectionRange(6, 11)
    fireEvent.mouseDown(uploadButton)
    uploadButton.focus()
    editor.setSelectionRange(0, 0)
    fireEvent.click(uploadButton)
    fireEvent.change(uploadInput, { target: { files: [createImageFile()] } })

    await waitFor(() => {
      expect(editor.value).toBe('hello ![alt](/uploads/image.png)')
    })
    expect(editor.selectionStart).toBe(editor.value.length)
    expect(editor.selectionEnd).toBe(editor.value.length)
    expect(onUploadImage).toHaveBeenCalledTimes(1)
  })

  it('applies uploaded markdown to the latest value when the parent updates during upload', async () => {
    const deferred = createDeferred<{ markdown: string }>()
    const onUploadImage = vi.fn(() => deferred.promise)

    function Harness() {
      const [value, setValue] = useState('hello world')

      return (
        <>
          <button type="button" onClick={() => setValue((currentValue) => `${currentValue}!`)}>
            Append suffix
          </button>
          <MarkdownEditor value={value} onChange={setValue} onUploadImage={onUploadImage} />
        </>
      )
    }

    render(<Harness />)

    const editor = screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement
    const uploadButton = screen.getByRole('button', { name: '上传图片' }) as HTMLButtonElement
    const uploadInput = screen.getByLabelText('上传图片文件') as HTMLInputElement

    editor.focus()
    editor.setSelectionRange(6, 11)
    fireEvent.mouseDown(uploadButton)
    fireEvent.click(uploadButton)
    fireEvent.change(uploadInput, { target: { files: [createImageFile()] } })
    fireEvent.click(screen.getByRole('button', { name: 'Append suffix' }))

    await waitFor(() => {
      expect(editor.value).toBe('hello world!')
    })

    deferred.resolve({ markdown: '![alt](/uploads/image.png)' })

    await waitFor(() => {
      expect(editor.value).toBe('hello ![alt](/uploads/image.png)!')
    })
  })

  it('leaves the value unchanged when image selection is canceled', () => {
    const onUploadImage = vi.fn()
    const { editor, uploadButton, uploadInput } = renderControlledEditorWithUpload('hello', onUploadImage)

    editor.focus()
    editor.setSelectionRange(2, 2)
    fireEvent.click(uploadButton)
    fireEvent.change(uploadInput, { target: { files: [] } })

    expect(editor.value).toBe('hello')
    expect(onUploadImage).not.toHaveBeenCalled()
  })

  it('disables the textarea and upload button while image upload is in flight', async () => {
    const deferred = createDeferred<{ markdown: string }>()
    const onUploadImage = vi.fn(() => deferred.promise)
    const { editor, uploadButton, uploadInput } = renderControlledEditorWithUpload('', onUploadImage)

    editor.focus()
    editor.setSelectionRange(0, 0)
    fireEvent.change(uploadInput, { target: { files: [createImageFile()] } })

    expect(editor.disabled).toBe(true)
    expect(uploadButton.disabled).toBe(true)

    deferred.resolve({ markdown: '![alt](/uploads/image.png)' })

    await waitFor(() => {
      expect(editor.disabled).toBe(false)
      expect(uploadButton.disabled).toBe(false)
    })
  })

  it('uploads pasted image files and inserts returned markdown', async () => {
    const imageFile = createImageFile()
    const onUploadImage = vi.fn().mockResolvedValue({ markdown: '![alt](/uploads/image.png)' })
    const { editor } = renderControlledEditorWithUpload('hello ', onUploadImage)

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.paste(editor, {
      clipboardData: createClipboardData({
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => imageFile }],
        files: [imageFile],
      }),
    })

    await waitFor(() => {
      expect(editor.value).toBe('hello ![alt](/uploads/image.png)')
    })
    expect(onUploadImage).toHaveBeenCalledWith(imageFile)
  })

  it('prefers image upload over text insertion when paste contains both image and text', async () => {
    const imageFile = createImageFile()
    const onUploadImage = vi.fn().mockResolvedValue({ markdown: '![alt](/uploads/image.png)' })
    const { editor } = renderControlledEditorWithUpload('', onUploadImage)

    editor.focus()
    editor.setSelectionRange(0, 0)
    fireEvent.paste(editor, {
      clipboardData: createClipboardData({
        text: '\tignored text',
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => imageFile }],
        files: [imageFile],
      }),
    })

    await waitFor(() => {
      expect(editor.value).toBe('![alt](/uploads/image.png)')
    })
    expect(onUploadImage).toHaveBeenCalledWith(imageFile)
  })

  it('keeps normalized text paste behavior when the clipboard has no image', () => {
    const onUploadImage = vi.fn()
    const { editor } = renderControlledEditorWithUpload('', onUploadImage)

    editor.focus()
    editor.setSelectionRange(0, 0)
    fireEvent.paste(editor, {
      clipboardData: createClipboardData({
        text: '\titem\n\t\tchild',
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
      }),
    })

    expect(editor.value).toBe('  item\n    child')
    expect(onUploadImage).not.toHaveBeenCalled()
  })

  it('leaves the value unchanged when image upload rejects', async () => {
    const imageFile = createImageFile()
    const onUploadImage = vi.fn().mockRejectedValue(new Error('upload failed'))
    const { editor, uploadButton } = renderControlledEditorWithUpload('hello', onUploadImage)

    editor.focus()
    editor.setSelectionRange(5, 5)
    fireEvent.paste(editor, {
      clipboardData: createClipboardData({
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => imageFile }],
        files: [imageFile],
      }),
    })

    await waitFor(() => {
      expect(uploadButton.disabled).toBe(false)
    })
    expect(editor.value).toBe('hello')
  })

  it('normalizes tabs when pasting content', () => {
    const editor = renderControlledEditor('')

    editor.focus()
    editor.setSelectionRange(0, 0)
    fireEvent.paste(editor, {
      clipboardData: {
        getData: () => '\titem\n\t\tchild',
      },
    })

    expect(editor.value).toBe('  item\n    child')
  })

  it('normalizes common rich-text spacing when pasting content', () => {
    const editor = renderControlledEditor('')

    editor.focus()
    editor.setSelectionRange(0, 0)
    fireEvent.paste(editor, {
      clipboardData: {
        getData: () => '•\u00a0item\n　quote',
      },
    })

    expect(editor.value).toBe('- item\n quote')
  })

  it('keeps selection around inserted bold text for native undo behavior', () => {
    const editor = renderControlledEditor('hello')

    editor.focus()
    editor.setSelectionRange(0, 5)
    fireEvent.keyDown(editor, { key: 'b', metaKey: true })

    expect(editor.selectionStart).toBe(2)
    expect(editor.selectionEnd).toBe(7)
  })

  it('moves the current list item downward with alt+ArrowDown', () => {
    const editor = renderControlledEditor('- first\n- second')

    editor.focus()
    editor.setSelectionRange(2, 2)
    fireEvent.keyDown(editor, { key: 'ArrowDown', altKey: true })

    expect(editor.value).toBe('- second\n- first')
  })

  it('keeps normal Backspace behavior outside leading indentation', () => {
    const editor = renderControlledEditor('  a. item')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(editor.value).toBe('  a. item')
  })
})
