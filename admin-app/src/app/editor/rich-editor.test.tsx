import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import RichEditor from './rich-editor'

function renderControlledRichEditor(initialValue: string) {
  function Harness() {
    const [value, setValue] = useState(initialValue)
    return <RichEditor value={value} onChange={setValue} />
  }

  render(<Harness />)
}

describe('rich editor', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders structured blocks for headings paragraphs lists quotes links code and images', () => {
    renderControlledRichEditor(`# Heading\n\nParagraph with **bold** and [link](https://example.com).\n\n- first\n- second\n\n> Quote\n\n![alt](https://example.com/image.png)\n\n\`inline\``)

    expect(screen.getByDisplayValue('Heading')).toBeTruthy()
    expect(screen.getByDisplayValue('Paragraph with **bold** and [link](https://example.com).')).toBeTruthy()
    expect(screen.getByLabelText('无序列表内容')).toBeTruthy()
    expect(screen.getByDisplayValue('Quote')).toBeTruthy()
    expect(screen.getByDisplayValue('alt')).toBeTruthy()
    expect(screen.getByDisplayValue('https://example.com/image.png')).toBeTruthy()
    expect(screen.getByDisplayValue('`inline`')).toBeTruthy()
  })

  it('adds a paragraph block and saves it back as markdown', () => {
    renderControlledRichEditor('Paragraph')

    fireEvent.click(screen.getByRole('button', { name: '添加段落' }))

    const paragraphEditors = screen.getAllByLabelText('段落内容') as HTMLTextAreaElement[]
    fireEvent.change(paragraphEditors[1], { target: { value: 'Second paragraph' } })

    expect((screen.getByLabelText('可视编辑器') as HTMLTextAreaElement).value).toBe(
      'Paragraph\n\nSecond paragraph',
    )
  })

  it('updates image alt text and url through visual controls', () => {
    renderControlledRichEditor('![old](https://example.com/old.png)')

    fireEvent.change(screen.getByLabelText('图片说明'), { target: { value: 'new alt' } })
    fireEvent.change(screen.getByLabelText('图片地址'), { target: { value: 'https://example.com/new.png' } })

    expect((screen.getByLabelText('可视编辑器') as HTMLTextAreaElement).value).toBe(
      '![new alt](https://example.com/new.png)',
    )
  })
})
