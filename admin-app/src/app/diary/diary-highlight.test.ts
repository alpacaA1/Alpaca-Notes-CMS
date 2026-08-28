import { describe, expect, it } from 'vitest'
import { applyDiaryMarkdownHighlight, removeDiaryMarkdownHighlight } from './diary-highlight'

describe('diary-highlight', () => {
  it('applies highlight ==quote== to markdown text', () => {
    const md = '这是重要判断，需要注意。'
    const result = applyDiaryMarkdownHighlight(md, '重要判断')
    expect(result).toBe('这是==重要判断==，需要注意。')
  })

  it('removes highlight ==quote== from markdown text', () => {
    const md = '这是==重要判断==，需要注意。'
    const result = removeDiaryMarkdownHighlight(md, '重要判断')
    expect(result).toBe('这是重要判断，需要注意。')
  })

  it('uses context prefix and suffix to target correct occurrence among duplicates', () => {
    const md = '今天天气很好。下午天气很好。晚上天气很好。'
    const result = applyDiaryMarkdownHighlight(md, '天气很好', { prefix: '下午', suffix: '。晚上' })
    expect(result).toBe('今天天气很好。下午==天气很好==。晚上天气很好。')
  })

  it('removes correct highlight occurrence using context', () => {
    const md = '今天==天气很好==。下午==天气很好==。晚上==天气很好==。'
    const result = removeDiaryMarkdownHighlight(md, '天气很好', { prefix: '下午', suffix: '。晚上' })
    expect(result).toBe('今天==天气很好==。下午天气很好。晚上==天气很好==。')
  })

  it('does not double highlight already highlighted text', () => {
    const md = '这是==重要判断==。'
    const result = applyDiaryMarkdownHighlight(md, '==重要判断==')
    expect(result).toBeNull()
  })

  it('returns null safely when target quote is not found', () => {
    const md = '这是普通文本。'
    const result = applyDiaryMarkdownHighlight(md, '不存在的句子')
    expect(result).toBeNull()
  })
})
