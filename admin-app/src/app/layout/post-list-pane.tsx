import type { PostIndexItem } from '../posts/post-types'

type ContentType = 'post' | 'read-later'

type PostListPaneProps = {
  posts: PostIndexItem[]
  hidden: boolean
  contentType: ContentType
  activePostPath?: string | null
  isDeleting?: boolean
  deletingPostPath?: string | null
  onOpenPost: (post: PostIndexItem) => void
  onDeletePost: (post: PostIndexItem) => void
}

export default function PostListPane({
  posts,
  hidden,
  contentType,
  activePostPath = null,
  isDeleting = false,
  deletingPostPath = null,
  onOpenPost,
  onDeletePost,
}: PostListPaneProps) {
  if (hidden) {
    return null
  }

  return (
    <aside className="post-pane">
      <div className="post-pane__header">
        <p className="post-pane__eyebrow">{contentType === 'read-later' ? '待读归档' : '文章归档'}</p>
        <div className="post-pane__title-row">
          <h2>{contentType === 'read-later' ? '待读' : '文章'}</h2>
          <span className="post-pane__count">{posts.length}</span>
        </div>
        <p className="post-pane__note">
          {contentType === 'read-later' ? '先看来源、状态和原文链接，再打开对应条目。' : '先看标题、链接和元信息，再打开对应稿件。'}
        </p>
      </div>

      <ul className="post-list">
        {posts.map((post) => {
          const isActive = post.path === activePostPath
          const isDeletingThisPost = deletingPostPath === post.path

          return (
            <li key={post.path} className={`post-list-item${isActive ? ' is-active' : ''}`}>
              <div className="post-list-item__actions">
                <button type="button" className="post-row-button" onClick={() => onOpenPost(post)}>
                  <div className="post-row-button__meta">
                    <span
                      className={`post-status-badge post-status-badge--${
                        contentType === 'read-later'
                          ? post.readingStatus === 'done'
                            ? 'published'
                            : post.readingStatus === 'reading'
                              ? 'draft'
                              : 'draft'
                          : post.published
                            ? 'published'
                            : 'draft'
                      }`}
                    >
                      {contentType === 'read-later'
                        ? post.readingStatus === 'done'
                          ? '已读'
                          : post.readingStatus === 'reading'
                            ? '在读'
                            : '未读'
                        : post.published
                          ? '已发布'
                          : '草稿'}
                    </span>
                    <span>{post.date}</span>
                  </div>
                  <strong>{post.title}</strong>
                  <span className="post-row-button__desc">{post.desc || '暂无摘要'}</span>
                  <div className="post-row-button__footer">
                    <span>{contentType === 'read-later' ? (post.sourceName || '未填写来源') : (post.permalink || '旧链接')}</span>
                    <span>{contentType === 'read-later' ? (post.externalUrl || '未填写原文链接') : (post.categories[0] || '未分类')}</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="post-list-item__delete-btn"
                  onClick={() => onDeletePost(post)}
                  disabled={isDeleting}
                  aria-label={contentType === 'read-later' ? '删除待读条目' : '删除文章'}
                  title={`删除《${post.title}》`}
                >
                  {isDeletingThisPost ? '删除中…' : '删除'}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
