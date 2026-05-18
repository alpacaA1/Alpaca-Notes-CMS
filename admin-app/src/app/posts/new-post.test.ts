import { describe, expect, it } from 'vitest'
import { createNewKnowledgeItem } from '../knowledge/new-item'
import {
  createNewDiaryEntry,
  createNewPost,
  formatPostDate,
  formatPostTimestamp,
  fromPostDateTimeInputValue,
  toPostDateTimeInputValue,
  validatePostForSave,
} from './new-post'

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
      pinned: false,
      categories: [],
      tags: [],
    })
  })

  it('creates diary entries in the dedicated directory without requiring permalink', () => {
    const diary = createNewDiaryEntry(fixedDate)

    expect(diary.path).toBe('source/diary/20260403060708.md')
    expect(diary.contentType).toBe('diary')
    expect(diary.frontmatter.title).toBe('2026-04-03-星期五')
    expect(diary.frontmatter.diary).toBe(true)
    expect(diary.frontmatter.published).toBe(false)

    expect(validatePostForSave(diary, { isNewPost: true }).permalink).toBeUndefined()
    expect(validatePostForSave(diary, { isNewPost: true }).desc).toBeUndefined()
  })

  it('converts between stored post date and datetime input value', () => {
    expect(toPostDateTimeInputValue('2026-04-03 06:07:08')).toBe('2026-04-03T06:07:08')
    expect(toPostDateTimeInputValue('2026-04-03 06:07')).toBe('2026-04-03T06:07')
    expect(fromPostDateTimeInputValue('2026-04-03T06:07')).toBe('2026-04-03 06:07:00')
    expect(fromPostDateTimeInputValue('2026-04-03T06:07:08')).toBe('2026-04-03 06:07:08')
  })

  it('requires title, date, and desc on every save', () => {
    const errors = validatePostForSave(createNewPost(fixedDate))

    expect(errors).toEqual({
      title: '请填写标题。',
      desc: '请填写摘要。',
    })
  })

  it('requires permalink before first save of a new post only', () => {
    const newPost = createNewPost(fixedDate)
    expect(validatePostForSave(newPost, { isNewPost: true }).permalink).toBe(
      '首次保存前请填写永久链接。',
    )

    expect(validatePostForSave(newPost, { isNewPost: false }).permalink).toBeUndefined()
  })

  it('rejects absolute permalink URLs', () => {
    const post = createNewPost(fixedDate)
    post.frontmatter.title = '真爱'
    post.frontmatter.desc = '真爱'
    post.frontmatter.permalink = 'https://alpacaa1.github.io/Alpaca-Notes-CMS/zhenai/'

    expect(validatePostForSave(post, { isNewPost: true }).permalink).toBe(
      '永久链接请填写站内相对路径，例如 zhenai/。',
    )
  })

  it('validates read-later external urls with dedicated field errors', () => {
    const post = createNewPost(fixedDate)
    post.contentType = 'read-later'
    post.frontmatter.title = '待读文章'
    post.frontmatter.desc = '摘要'
    post.frontmatter.read_later = true

    expect(validatePostForSave(post).external_url).toBe('请填写原文链接。')

    post.frontmatter.external_url = 'example.com/article'
    expect(validatePostForSave(post).external_url).toBe('原文链接需以 http:// 或 https:// 开头。')

    post.frontmatter.external_url = 'https://example.com/article'
    expect(validatePostForSave(post).external_url).toBeUndefined()
  })

  it('does not require desc for knowledge saves', () => {
    const knowledge = createNewKnowledgeItem(fixedDate)
    knowledge.frontmatter.title = '摘录'

    expect(validatePostForSave(knowledge, { isNewPost: true }).desc).toBeUndefined()
  })

  it('requires node key for topic knowledge saves', () => {
    const knowledge = createNewKnowledgeItem(fixedDate)
    knowledge.frontmatter.title = '影响力'
    knowledge.frontmatter.knowledge_kind = 'topic'

    expect(validatePostForSave(knowledge).node_key).toBe('主题节点请填写节点 Key，例如 book/影响力。')

    knowledge.frontmatter.node_key = 'book/影响力'
    expect(validatePostForSave(knowledge).node_key).toBeUndefined()
  })

  it('requires node key for topic article saves', () => {
    const post = createNewPost(fixedDate)
    post.frontmatter.title = '影响力'
    post.frontmatter.desc = '关于《影响力》的主题页'
    post.frontmatter.topic = true

    expect(validatePostForSave(post).node_key).toBe('主题节点请填写节点 Key，例如 book/影响力。')

    post.frontmatter.node_key = 'book/影响力'
    expect(validatePostForSave(post).node_key).toBeUndefined()
  })
})
