import { describe, expect, it } from 'vitest'
import { isSupportedContentFileName, resolveContentFormat } from './content-format'

describe('content format helpers', () => {
  it('resolves plain text format aliases', () => {
    expect(resolveContentFormat('source/_posts/example.md', 'plain text')).toBe('plaintext')
    expect(resolveContentFormat('source/_posts/example.md', 'plaintxt')).toBe('plaintext')
    expect(resolveContentFormat('source/_posts/example.md', 'txt')).toBe('plaintext')
  })

  it('resolves plain text from file extensions', () => {
    expect(resolveContentFormat('source/_posts/example.txt')).toBe('plaintext')
    expect(resolveContentFormat('source/_posts/example.plaintxt')).toBe('plaintext')
  })

  it('keeps markdown as the default fallback', () => {
    expect(resolveContentFormat('source/_posts/example.md')).toBe('markdown')
    expect(resolveContentFormat('source/_posts/example.unknown')).toBe('markdown')
  })

  it('recognizes supported content file names', () => {
    expect(isSupportedContentFileName('post.md')).toBe(true)
    expect(isSupportedContentFileName('post.markdown')).toBe(true)
    expect(isSupportedContentFileName('post.txt')).toBe(true)
    expect(isSupportedContentFileName('post.plaintxt')).toBe(true)
    expect(isSupportedContentFileName('post.html')).toBe(false)
  })
})
