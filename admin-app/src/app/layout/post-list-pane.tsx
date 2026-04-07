import type { PostIndexItem } from '../posts/post-types'

type PostListPaneProps = {
  posts: PostIndexItem[]
  hidden: boolean
  onOpenPost: (post: PostIndexItem) => void
}

export default function PostListPane({ posts, hidden, onOpenPost }: PostListPaneProps) {
  if (hidden) {
    return null
  }

  return (
    <aside className="post-pane">
      <ul className="post-list">
        {posts.map((post) => (
          <li key={post.path} className="post-list-item">
            <button type="button" className="post-row-button" onClick={() => onOpenPost(post)}>
              <strong>{post.title}</strong>
              <span>{post.published ? 'Published' : 'Draft'}</span>
              <span>{post.date}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
