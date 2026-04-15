import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MarkdownEditor from './markdown-editor'

function renderControlledEditor(initialValue: string) {
  function Harness() {
    const [value, setValue] = useState(initialValue)
    return <MarkdownEditor value={value} onChange={setValue} />
  }

  render(<Harness />)
  return screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement
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

  it('wraps selected text in bold markers with mod+b', () => {
    const editor = renderControlledEditor('hello')

    editor.focus()
    editor.setSelectionRange(0, 5)
    fireEvent.keyDown(editor, { key: 'b', metaKey: true })

    expect(editor.value).toBe('**hello**')
    expect(editor.selectionStart).toBe(2)
    expect(editor.selectionEnd).toBe(7)
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
