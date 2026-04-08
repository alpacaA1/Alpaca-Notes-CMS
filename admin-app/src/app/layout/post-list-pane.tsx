import type { PostIndexItem } from '../posts/post-types'

type PostListPaneProps = {
  posts: PostIndexItem[]
  hidden: boolean
  activePostPath?: string | null
  onOpenPost: (post: PostIndexItem) => void
}

export default function PostListPane({ posts, hidden, activePostPath = null, onOpenPost }: PostListPaneProps) {
  if (hidden) {
    return null
  }

  return (
    <aside className="post-pane">
      <div className="post-pane__header">
        <p className="post-pane__eyebrow">文章归档</p>
        <div className="post-pane__title-row">
          <h2>文章</h2>
          <span className="post-pane__count">{posts.length}</span>
        </div>
        <p className="post-pane__note">先看标题、链接和元信息，再打开对应稿件。</p>
      </div>

      <ul className="post-list">
        {posts.map((post) => {
          const isActive = post.path === activePostPath

          return (
            <li key={post.path} className={`post-list-item${isActive ? ' is-active' : ''}`}>
              <button type="button" className="post-row-button" onClick={() => onOpenPost(post)}>
                <div className="post-row-button__meta">
                  <span className={`post-status-badge post-status-badge--${post.published ? 'published' : 'draft'}`}>
                    {post.published ? '已发布' : '草稿'}
                  </span>
                  <span>{post.date}</span>
                </div>
                <strong>{post.title}</strong>
                <span className="post-row-button__desc">{post.desc || '暂无摘要'}</span>
                <div className="post-row-button__footer">
                  <span>{post.permalink || '旧链接'}</span>
                  <span>{post.categories[0] || '未分类'}</span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
