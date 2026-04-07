import { describe, expect, it } from 'vitest'
import { createNewPost, formatPostDate, formatPostTimestamp, validatePostForSave } from './new-post'

describe('new post helpers', () => {
  const fixedDate = new Date(2026, 3, 3, 6, 7, 8)

  it('generates timestamp filename YYYYMMDDHHmmss.md', () => {
    expect(formatPostTimestamp(fixedDate)).toBe('20260403060708')
    expect(createNewPost(fixedDate).path).toBe('source/_posts/20260403060708.md')
  })

  it('initializes default frontmatter with published false', () => {
    const post = createNewPost(fixedDate)

    expect(post.frontmatter).toEqual({
      title: '',
      date: formatPostDate(fixedDate),
      desc: '',
      published: false,
      categories: [],
      tags: [],
    })
  })

  it('requires title, date, and desc on every save', () => {
    const errors = validatePostForSave(createNewPost(fixedDate))

    expect(errors).toEqual({
      title: 'Title is required.',
      desc: 'Description is required.',
    })
  })

  it('requires permalink before first save of a new post only', () => {
    const newPost = createNewPost(fixedDate)
    expect(validatePostForSave(newPost, { isNewPost: true }).permalink).toBe(
      'Permalink is required before the first save.',
    )

    expect(validatePostForSave(newPost, { isNewPost: false }).permalink).toBeUndefined()
  })
})
