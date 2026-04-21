import { describe, expect, it } from 'vitest'
import {
  deleteTaxonomyFromContent,
  findPostsWithTaxonomy,
  renameTaxonomyInContent,
} from './taxonomy-operations'

const samplePost = [
  '---',
  'title: Test Post',
  'date: 2026-04-03 12:00:00',
  'categories:',
  '  - 专业',
  '  - 思考',
  'tags:',
  '  - 产品',
  '  - IoT',
  'desc: A test post',
  '---',
  '',
  'Body content here.',
].join('\n')

describe('findPostsWithTaxonomy', () => {
  const posts = [
    { path: 'a.md', categories: ['专业', '思考'], tags: ['产品'] },
    { path: 'b.md', categories: ['思考'], tags: ['IoT'] },
    { path: 'c.md', categories: ['记录'], tags: ['产品', 'IoT'] },
  ]

  it('finds posts containing a specific category', () => {
    expect(findPostsWithTaxonomy(posts, 'categories', '思考')).toEqual(['a.md', 'b.md'])
  })

  it('finds posts containing a specific tag', () => {
    expect(findPostsWithTaxonomy(posts, 'tags', 'IoT')).toEqual(['b.md', 'c.md'])
  })

  it('returns empty array when no posts match', () => {
    expect(findPostsWithTaxonomy(posts, 'categories', '不存在')).toEqual([])
  })
})

describe('renameTaxonomyInContent', () => {
  it('renames a category in frontmatter', () => {
    const result = renameTaxonomyInContent(samplePost, 'categories', '专业', '职业')
    expect(result).toContain('  - 职业')
    expect(result).toContain('  - 思考')
    expect(result).not.toContain('  - 专业')
    // Tags should be untouched
    expect(result).toContain('  - 产品')
    expect(result).toContain('  - IoT')
  })

  it('renames a tag in frontmatter', () => {
    const result = renameTaxonomyInContent(samplePost, 'tags', 'IoT', '物联网')
    expect(result).toContain('  - 物联网')
    expect(result).not.toMatch(/^\s*-\sIoT$/m)
    // Categories should be untouched
    expect(result).toContain('  - 专业')
  })

  it('returns content unchanged when the target value is not present', () => {
    const result = renameTaxonomyInContent(samplePost, 'categories', '不存在', '新名称')
    expect(result).toBe(samplePost)
  })

  it('returns content unchanged when there is no frontmatter', () => {
    const noFrontmatter = 'Just some body text.'
    expect(renameTaxonomyInContent(noFrontmatter, 'categories', '专业', '职业')).toBe(noFrontmatter)
  })

  it('preserves body content after frontmatter', () => {
    const result = renameTaxonomyInContent(samplePost, 'categories', '专业', '职业')
    expect(result).toContain('Body content here.')
  })
})

describe('deleteTaxonomyFromContent', () => {
  it('removes a category from frontmatter', () => {
    const result = deleteTaxonomyFromContent(samplePost, 'categories', '专业')
    expect(result).not.toContain('  - 专业')
    expect(result).toContain('  - 思考')
    expect(result).toContain('categories:')
  })

  it('removes a tag from frontmatter', () => {
    const result = deleteTaxonomyFromContent(samplePost, 'tags', '产品')
    expect(result).not.toMatch(/^\s*-\s产品$/m)
    expect(result).toContain('  - IoT')
  })

  it('returns content unchanged when the target value is not present', () => {
    const result = deleteTaxonomyFromContent(samplePost, 'tags', '不存在')
    expect(result).toBe(samplePost)
  })

  it('returns content unchanged when there is no frontmatter', () => {
    const noFrontmatter = 'Just some body text.'
    expect(deleteTaxonomyFromContent(noFrontmatter, 'tags', '产品')).toBe(noFrontmatter)
  })

  it('preserves body content after frontmatter', () => {
    const result = deleteTaxonomyFromContent(samplePost, 'categories', '专业')
    expect(result).toContain('Body content here.')
  })

  it('removes the only category leaving the field header intact', () => {
    const singleCategory = [
      '---',
      'title: Single',
      'categories:',
      '  - 唯一',
      'tags:',
      '  - 标签A',
      '---',
      '',
      'Body.',
    ].join('\n')

    const result = deleteTaxonomyFromContent(singleCategory, 'categories', '唯一')
    expect(result).toContain('categories:')
    expect(result).not.toContain('  - 唯一')
    expect(result).toContain('  - 标签A')
  })
})
