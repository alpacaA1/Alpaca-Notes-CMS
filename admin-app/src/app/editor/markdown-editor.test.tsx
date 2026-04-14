import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
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

  it('keeps normal Backspace behavior outside leading indentation', () => {
    const editor = renderControlledEditor('  a. item')

    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    fireEvent.keyDown(editor, { key: 'Backspace' })

    expect(editor.value).toBe('  a. item')
  })
})
