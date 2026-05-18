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

function renderControlledEditorWithReferences(
  initialValue: string,
  internalReferenceCandidates: Array<{
    targetKey: string
    title: string
    contentType: 'post' | 'diary' | 'knowledge' | 'read-later'
    isTopicNode?: boolean
    identifier: string
    keywords: string
    date: string
    path: string
  }>,
) {
  function Harness() {
    const [value, setValue] = useState(initialValue)
    return (
      <MarkdownEditor
        value={value}
        onChange={setValue}
        internalReferenceCandidates={internalReferenceCandidates}
      />
    )
  }

  render(<Harness />)
  return screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement
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

  it('inserts nested ordered indentation when pressing Tab', () => {
    const editor = renderControlledEditor('1. aaa\n1. item')

    editor.focus()
    editor.setSelectionRange(7, 7)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(editor.value).toBe('1. aaa\n    1. item')
    expect(editor.selectionStart).toBe(11)
    expect(editor.selectionEnd).toBe(11)
  })

  it('inserts an internal reference from the suggestion panel after typing [[ query', async () => {
    const editor = renderControlledEditorWithReferences('', [
      {
        targetKey: 'post:influence/',
        title: '《影响力》书摘',
        contentType: 'post',
        identifier: 'influence/',
        keywords: '影响力 书摘 influence/',
        date: '2026-05-11 08:00:00',
        path: 'source/_posts/influence.md',
      },
    ])

    fireEvent.change(editor, { target: { value: '今天又想到 [[影响' } })
    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.select(editor)

    expect(await screen.findByRole('listbox', { name: '内部引用候选' })).toBeTruthy()
    expect(screen.getByRole('option', { name: /《影响力》书摘/ })).toBeTruthy()

    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => {
      expect(editor.value).toBe('今天又想到 [[post:influence/|《影响力》书摘]]')
    })
  })

  it('inserts a topic node reference from the suggestion panel after typing [[ query', async () => {
    const editor = renderControlledEditorWithReferences('', [
      {
        targetKey: 'book/影响力',
        title: '《影响力》',
        contentType: 'post',
        isTopicNode: true,
        identifier: 'book/影响力',
        keywords: '影响力 book/影响力 Influence',
        date: '2026-05-11 08:00:00',
        path: 'source/_posts/influence-topic.md',
      },
    ])

    fireEvent.change(editor, { target: { value: '今天又想到 [[影响' } })
    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.select(editor)

    expect(await screen.findByRole('listbox', { name: '内部引用候选' })).toBeTruthy()
    expect(screen.getByRole('option', { name: /《影响力》/ }).textContent).toContain('主题')

    fireEvent.keyDown(editor, { key: 'Enter' })

    await waitFor(() => {
      expect(editor.value).toBe('今天又想到 [[book/影响力|《影响力》]]')
    })
  })

  it('dismisses the internal reference suggestion panel without changing the editor value', async () => {
    const editor = renderControlledEditorWithReferences('', [
      {
        targetKey: 'post:influence/',
        title: '《影响力》书摘',
        contentType: 'post',
        identifier: 'influence/',
        keywords: '影响力 书摘 influence/',
        date: '2026-05-11 08:00:00',
        path: 'source/_posts/influence.md',
      },
    ])

    fireEvent.change(editor, { target: { value: '今天又想到 [[影响' } })
    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.select(editor)

    expect(await screen.findByRole('listbox', { name: '内部引用候选' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '关闭内部引用候选' }))

    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: '内部引用候选' })).toBeNull()
    })
    expect(editor.value).toBe('今天又想到 [[影响')
  })

  it('indents empty list items when pressing Tab', () => {
    const editor = renderControlledEditor('- 12\n- ')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(editor.value).toBe('- 12\n    - ')
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

  it('restarts nested ordered items from one when indenting with Tab', () => {
    const editor = renderControlledEditor('1. aaa\n2. ')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(editor.value).toBe('1. aaa\n    1. ')
    expect(editor.selectionStart).toBe(editor.value.length)
    expect(editor.selectionEnd).toBe(editor.value.length)
  })

  it('adds another ordered nesting level when pressing Tab', () => {
    const editor = renderControlledEditor('1. aaa\n    1. item')

    editor.focus()
    editor.setSelectionRange(7, 7)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(editor.value).toBe('1. aaa\n        1. item')
    expect(editor.selectionStart).toBe(11)
    expect(editor.selectionEnd).toBe(11)
  })

  it('removes indentation when pressing Shift+Tab', () => {
    const editor = renderControlledEditor('1. aaa\n    1. item')

    editor.focus()
    editor.setSelectionRange(11, 11)
    fireEvent.keyDown(editor, { key: 'Tab', shiftKey: true })

    expect(editor.value).toBe('1. aaa\n2. item')
    expect(editor.selectionStart).toBe(7)
    expect(editor.selectionEnd).toBe(7)
  })

  it('indents all selected lines when pressing Tab', () => {
    const editor = renderControlledEditor('1. aaa\n2. item\n3. item')

    editor.focus()
    editor.setSelectionRange(7, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Tab' })

    expect(editor.value).toBe('1. aaa\n    1. item\n    2. item')
  })

  it('continues numbered lists when pressing Enter', () => {
    const editor = renderControlledEditor('1. aaa')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('1. aaa\n2. ')
    expect(editor.selectionStart).toBe(editor.value.length)
  })

  it('renumbers following numbered items when pressing Enter in the middle of a list', () => {
    const editor = renderControlledEditor('1. aaa\n2. bbb\n3. ccc\n4. ddd')

    editor.focus()
    editor.setSelectionRange(6, 6)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('1. aaa\n2. \n3. bbb\n4. ccc\n5. ddd')
    expect(editor.selectionStart).toBe(10)
    expect(editor.selectionEnd).toBe(10)
  })

  it('does not continue numbered lists when Enter confirms an IME composition', () => {
    const editor = renderControlledEditor('1. 五一')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.compositionStart(editor)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('1. 五一')
    expect(editor.selectionStart).toBe(editor.value.length)
    expect(editor.selectionEnd).toBe(editor.value.length)

    fireEvent.compositionEnd(editor)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('1. 五一\n2. ')
    expect(editor.selectionStart).toBe(editor.value.length)
    expect(editor.selectionEnd).toBe(editor.value.length)
  })

  it('does not continue numbered lists when IME Enter reports keyCode 229', () => {
    const editor = renderControlledEditor('1. 五一')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Enter', keyCode: 229, which: 229 })

    expect(editor.value).toBe('1. 五一')
    expect(editor.selectionStart).toBe(editor.value.length)
    expect(editor.selectionEnd).toBe(editor.value.length)
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

  it('renumbers following blockquote list items when pressing Enter in the middle of a list', () => {
    const editor = renderControlledEditor('> 1. aaa\n> 2. bbb\n> 3. ccc')

    editor.focus()
    editor.setSelectionRange(8, 8)
    fireEvent.keyDown(editor, { key: 'Enter' })

    expect(editor.value).toBe('> 1. aaa\n> 2. \n> 3. bbb\n> 4. ccc')
    expect(editor.selectionStart).toBe(14)
    expect(editor.selectionEnd).toBe(14)
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

  it('outdents ordered list items one level when pressing Backspace in leading indentation', () => {
    const editor = renderControlledEditor('    1. item')

    editor.focus()
    editor.setSelectionRange(4, 4)
    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(editor.value).toBe('1. item')
    expect(editor.selectionStart).toBe(0)
    expect(editor.selectionEnd).toBe(0)
  })

  it('outdents ordered list items one level when pressing Backspace from the middle of leading indentation', () => {
    const editor = renderControlledEditor('    1. item')

    editor.focus()
    editor.setSelectionRange(2, 2)
    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(editor.value).toBe('1. item')
    expect(editor.selectionStart).toBe(0)
    expect(editor.selectionEnd).toBe(0)
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

  it('renumbers empty ordered list items when pressing Backspace to outdent', () => {
    const editor = renderControlledEditor('1. first\n    1. \n    2. ')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(editor.value).toBe('1. first\n    1. \n2. ')
    expect(editor.selectionStart).toBe(editor.value.length)
    expect(editor.selectionEnd).toBe(editor.value.length)
  })

  it('keeps the editor textarea horizontal padding aligned with the editor surface', () => {
    expect(appStyles).toMatch(/\.editor-surface,\s*\.settings-panel,\s*\.preview-pane\s*\{[^}]*padding:\s*24px;/s)
    expect(appStyles).toMatch(/\.editor-textarea\s*\{[^}]*padding:\s*18px 24px;/s)
    expect(appStyles).toMatch(/\.editor-textarea\s*\{[^}]*tab-size:\s*2;/s)
  })

  it('starts auto-resize editors from a single visible row', () => {
    render(<MarkdownEditor value="单行内容" onChange={() => {}} autoResize />)

    expect((screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement).getAttribute('rows')).toBe('1')
  })

  it('keeps live editor blocks visually flat even when editor-surface and editor-textarea theme styles are present', () => {
    expect(appStyles).toMatch(/\.single-pane-live-editor__block-editor\.editor-surface\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s)
    expect(appStyles).toMatch(/\.single-pane-live-editor__textarea\.editor-textarea\s*\{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s)
  })

  it('keeps live editor list previews on the same vertical rhythm as raw markdown editing', () => {
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__document\.preview-content--live ul,\s*\.single-pane-live-editor__document\.preview-content--live ol\s*\{[^}]*margin:\s*0;/s,
    )
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__document\.preview-content--live li \+ li,\s*\.single-pane-live-editor__document\.preview-content--live \.preview-content__task-item \+ \.preview-content__task-item\s*\{[^}]*margin-top:\s*0;/s,
    )
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__block--list > ul,\s*\.single-pane-live-editor__block--list > ol\s*\{[^}]*padding-left:\s*0;[^}]*list-style-position:\s*inside;/s,
    )
  })

  it('keeps active live editor list blocks horizontally aligned with rendered list previews', () => {
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__textarea--list\s*\{[^}]*padding-left:\s*1\.4rem;/s,
    )
  })

  it('keeps active live editor heading blocks on a single heading line height instead of paragraph height', () => {
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__textarea--heading-1\s*\{[^}]*min-height:\s*calc\(1em \* var\(--single-pane-live-heading-1-line-height\)\);/s,
    )
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__textarea--heading-2\s*\{[^}]*min-height:\s*calc\(1em \* var\(--single-pane-live-heading-2-line-height\)\);/s,
    )
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__textarea--heading-3\s*\{[^}]*min-height:\s*calc\(1em \* var\(--single-pane-live-heading-3-line-height\)\);/s,
    )
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__textarea--heading-4,\s*\.single-pane-live-editor__textarea--heading-5,\s*\.single-pane-live-editor__textarea--heading-6\s*\{[^}]*min-height:\s*calc\(1em \* var\(--single-pane-live-heading-4-line-height\)\);/s,
    )
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__rich-editor--heading\s*\{[^}]*font-weight:\s*var\(--single-pane-live-heading-font-weight\);[^}]*letter-spacing:\s*var\(--single-pane-live-heading-letter-spacing\);/s,
    )
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__rich-editor--heading-3\s*\{[^}]*min-height:\s*calc\(1em \* var\(--single-pane-live-heading-3-line-height\)\);/s,
    )
  })

  it('keeps preview heading line heights aligned with live editor heading levels', () => {
    expect(appStyles).toMatch(
      /\.preview-content h3\s*\{[^}]*line-height:\s*1\.2;/s,
    )
    expect(appStyles).toMatch(
      /\.preview-content h4,\s*\.preview-content h5,\s*\.preview-content h6\s*\{[^}]*line-height:\s*1\.28;/s,
    )
  })

  it('gives the immersive live editor a roomier desktop gutter without losing mobile-safe clamps', () => {
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__document-toolbar\s*\{[^}]*padding:\s*24px clamp\(28px,\s*4\.8vw,\s*72px\) 0;/s,
    )
    expect(appStyles).toMatch(
      /\.single-pane-live-editor__document\s*\{[^}]*padding:\s*28px clamp\(40px,\s*6\.4vw,\s*128px\) 36px;/s,
    )
  })

  it('keeps the editor workspace scrollable inside the fixed admin shell', () => {
    expect(appStyles).toMatch(/\.admin-layout\s*\{[^}]*height:\s*100%;[^}]*overflow-y:\s*auto;/s)
  })

  it('keeps preview article width capped when topic backlinks drawer is visible', () => {
    expect(appStyles).toMatch(
      /\.preview-pane__canvas--with-topic-backlinks\s+\.preview-content\s*\{[^}]*width:\s*min\(100%,\s*860px\);[^}]*max-width:\s*860px;/s,
    )
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

  it('wraps selected text in link markdown with mod+k and selects the url placeholder', () => {
    const editor = renderControlledEditor('hello')

    editor.focus()
    editor.setSelectionRange(0, 5)
    fireEvent.keyDown(editor, { key: 'k', metaKey: true })

    const expectedValue = '[hello](https://)'
    const urlStart = expectedValue.lastIndexOf('https://')
    expect(editor.value).toBe(expectedValue)
    expect(editor.selectionStart).toBe(urlStart)
    expect(editor.selectionEnd).toBe(urlStart + 'https://'.length)
  })

  it('selects the url placeholder even when selected text already contains a protocol', () => {
    const editor = renderControlledEditor('https://example.com')

    editor.focus()
    editor.setSelectionRange(0, editor.value.length)
    fireEvent.keyDown(editor, { key: 'k', metaKey: true })

    const expectedValue = '[https://example.com](https://)'
    const urlStart = expectedValue.lastIndexOf('https://')
    expect(editor.value).toBe(expectedValue)
    expect(editor.selectionStart).toBe(urlStart)
    expect(editor.selectionEnd).toBe(urlStart + 'https://'.length)
  })

  it('wraps selected text in link markdown with ctrl+k and selects the url placeholder', () => {
    const editor = renderControlledEditor('hello')

    editor.focus()
    editor.setSelectionRange(0, 5)
    fireEvent.keyDown(editor, { key: 'k', ctrlKey: true })

    const expectedValue = '[hello](https://)'
    const urlStart = expectedValue.lastIndexOf('https://')
    expect(editor.value).toBe(expectedValue)
    expect(editor.selectionStart).toBe(urlStart)
    expect(editor.selectionEnd).toBe(urlStart + 'https://'.length)
  })

  it('inserts a placeholder link with mod+k when nothing is selected', () => {
    const editor = renderControlledEditor('')

    editor.focus()
    editor.setSelectionRange(0, 0)
    fireEvent.keyDown(editor, { key: 'k', metaKey: true })

    const expectedValue = '[链接文本](https://)'
    const urlStart = expectedValue.indexOf('https://')
    expect(editor.value).toBe(expectedValue)
    expect(editor.selectionStart).toBe(urlStart)
    expect(editor.selectionEnd).toBe(urlStart + 'https://'.length)
  })

  it('does not render the insert-link toolbar button', () => {
    renderControlledEditor('hello world')

    expect(screen.queryByRole('button', { name: '插入链接' })).toBeNull()
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

  it('undoes plain text changes with mod+z', () => {
    const editor = renderControlledEditor('hello')

    editor.focus()
    fireEvent.change(editor, { target: { value: 'hello world' } })
    fireEvent.keyDown(editor, { key: 'z', metaKey: true })

    expect(editor.value).toBe('hello')
  })

  it('undoes editor formatting shortcuts with mod+z', () => {
    const editor = renderControlledEditor('hello')

    editor.focus()
    editor.setSelectionRange(0, 5)
    fireEvent.keyDown(editor, { key: 'b', metaKey: true })
    fireEvent.keyDown(editor, { key: 'z', metaKey: true })

    expect(editor.value).toBe('hello')
  })

  it('moves the current list item downward with alt+ArrowDown', () => {
    const editor = renderControlledEditor('- first\n- second')

    editor.focus()
    editor.setSelectionRange(2, 2)
    fireEvent.keyDown(editor, { key: 'ArrowDown', altKey: true })

    expect(editor.value).toBe('- second\n- first')
  })

  it('keeps normal Backspace behavior outside leading indentation', () => {
    const editor = renderControlledEditor('    1. item')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(editor.value).toBe('    1. item')
  })
})
