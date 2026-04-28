import type { ReadingStatus } from '../posts/parse-post'
import type { PostIndexItem } from '../posts/post-types'

type ContentType = 'post' | 'read-later'

function getReadLaterStatusTone(status?: ReadingStatus) {
  return status === 'done' ? 'done' : status === 'reading' ? 'reading' : 'unread'
}

function getReadLaterStatusLabel(status?: ReadingStatus) {
  return status === 'done' ? '已读' : status === 'reading' ? '在读' : '未读'
}

type PostListPaneProps = {
  posts: PostIndexItem[]
  hidden: boolean
  contentType: ContentType
  activePostPath?: string | null
  isDeleting?: boolean
  deletingPostPath?: string | null
  isTogglingPinned?: boolean
  togglingPinnedPostPath?: string | null
  disabledPinnedPostPath?: string | null
  onOpenPost: (post: PostIndexItem) => void
  onDeletePost: (post: PostIndexItem) => void
  onTogglePinned: (post: PostIndexItem) => void
}

export default function PostListPane({
  posts,
  hidden,
  contentType,
  activePostPath = null,
  isDeleting = false,
  deletingPostPath = null,
  isTogglingPinned = false,
  togglingPinnedPostPath = null,
  disabledPinnedPostPath = null,
  onOpenPost,
  onDeletePost,
  onTogglePinned,
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
          const isTogglingPinnedThisPost = togglingPinnedPostPath === post.path
          const isPinnedToggleDisabled = isTogglingPinned || isDeleting || disabledPinnedPostPath === post.path
          const statusTone = contentType === 'read-later' ? getReadLaterStatusTone(post.readingStatus) : post.published ? 'published' : 'draft'
          const statusLabel = contentType === 'read-later' ? getReadLaterStatusLabel(post.readingStatus) : post.published ? '已发布' : '草稿'

          return (
            <li key={post.path} className={`post-list-item${isActive ? ' is-active' : ''}`}>
              <div className="post-list-item__actions">
                <button type="button" className="post-row-button" onClick={() => onOpenPost(post)}>
                  <div className="post-row-button__meta">
                    <span className={`post-status-badge post-status-badge--${statusTone}`}>
                      {statusLabel}
                    </span>
                    {contentType === 'post' && post.pinned ? <span className="post-status-badge post-status-badge--pinned">置顶</span> : null}
                    <span>{post.date}</span>
                  </div>
                  <strong>{post.title}</strong>
                  <span className="post-row-button__desc">{post.desc || '暂无摘要'}</span>
                  <div className="post-row-button__footer">
                    <span>{contentType === 'read-later' ? (post.sourceName || '未填写来源') : (post.permalink || '旧链接')}</span>
                    <span>{contentType === 'read-later' ? (post.externalUrl || '未填写原文链接') : (post.categories[0] || '未分类')}</span>
                  </div>
                </button>
                <div className="post-list-item__side-actions">
                  {contentType === 'post' ? (
                    <button
                      type="button"
                      className={`post-list-item__pin-btn${post.pinned ? ' is-active' : ''}`}
                      onClick={() => onTogglePinned(post)}
                      disabled={isPinnedToggleDisabled}
                      aria-label={post.pinned ? '取消置顶文章' : '置顶文章'}
                      title={disabledPinnedPostPath === post.path ? '当前文章有未保存修改，请先保存。' : post.pinned ? `取消《${post.title}》的置顶` : `置顶《${post.title}》`}
                    >
                      {isTogglingPinnedThisPost ? '处理中…' : post.pinned ? '已置顶' : '置顶'}
                    </button>
                  ) : null}
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
              </div>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
