import { PITCH_PATH } from '../config'
import { createNewPost, formatPostDate, formatPostTimestamp, getNextNumericPermalink } from '../posts/new-post'
import type { ParsedPost } from '../posts/parse-post'
import type { PostIndexItem } from '../posts/post-types'

export function createNewPitch(date = new Date()): ParsedPost {
  return {
    path: `${PITCH_PATH}/${formatPostTimestamp(date)}.md`,
    sha: '',
    body: '',
    hasExplicitPublished: true,
    hasExplicitPermalink: false,
    contentType: 'pitch',
    frontmatter: {
      title: '',
      date: formatPostDate(date),
      desc: '',
      published: false,
      pinned: false,
      categories: [],
      tags: [],
      pitch: true,
      pitch_status: 'open',
      nav_exclude: true,
    },
  }
}

export function createPostFromPitch(
  pitch: ParsedPost,
  posts: PostIndexItem[],
  date = new Date(),
): ParsedPost {
  const permalink = getNextNumericPermalink(posts)
  const basePost = createNewPost(date, permalink)
  const trimmedBody = pitch.body.trim()
  const body = trimmedBody
    ? `<!-- 选题核心想法 -->\n\n${trimmedBody}\n\n---\n\n`
    : ''

  return {
    ...basePost,
    body,
    frontmatter: {
      ...basePost.frontmatter,
      title: pitch.frontmatter.title.trim() || '未命名文章',
      tags: [...pitch.frontmatter.tags],
    },
  }
}
