import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { ResolvedContentFormat } from '../content-format'
import type { ParsedPost, ReadingStatus } from '../posts/parse-post'
import type { ContentType, PostIndexItem } from '../posts/post-types'
import { extractMarkdownHeadings, getReadLaterOutline } from '../read-later/parse-item'
import type { ReadLaterOutlineItem } from '../read-later/item-types'

function getReadLaterStatusTone(status?: ReadingStatus) {
  return status === 'done' ? 'done' : status === 'reading' ? 'reading' : 'unread'
}

function getReadLaterStatusLabel(status?: ReadingStatus) {
  return status === 'done' ? '已读' : status === 'reading' ? '在读' : '未读'
}

function getPinActionLabel(contentType: ContentType, pinned?: boolean) {
  if (contentType === 'read-later') {
    return pinned ? '取消置顶待读' : '置顶待读'
  }

  if (contentType === 'diary') {
    return pinned ? '取消置顶日记' : '置顶日记'
  }

  if (contentType === 'knowledge') {
    return pinned ? '取消置顶知识点' : '置顶知识点'
  }

  return pinned ? '取消置顶文章' : '置顶文章'
}

type PostListPaneProps = {
  posts: PostIndexItem[]
  hidden: boolean
  contentType: ContentType
  activePostPath?: string | null
  document?: ParsedPost | null
  documentContentFormat?: ResolvedContentFormat
  isPreviewing?: boolean
  activeOutlineTargetId?: string | null
  isDeleting?: boolean
  deletingPostPath?: string | null
  isTogglingPinned?: boolean
  togglingPinnedPostPath?: string | null
  disabledPinnedPostPath?: string | null
  onOpenPost: (post: PostIndexItem) => void
  onDeletePost: (post: PostIndexItem) => void
  onTogglePinned: (post: PostIndexItem) => void
  onBackToList?: () => void
  backToListLabel?: string
  onNavigateOutline?: (targetId: string) => void
  isTopBarHidden?: boolean
  onToggleTopBar?: () => void
  isDrawer?: boolean
  onClose?: () => void
}

const POST_PREVIEW_ROOT_ID = 'post-preview-content'
const READ_LATER_ROOT_ID = 'read-later-content'

function normalizeOutlineLevels(items: ReadLaterOutlineItem[]) {
  if (items.length === 0) {
    return items
  }

  const minLevel = Math.min(...items.map((item) => item.level))

  return items.map((item) => ({
    ...item,
    level: Math.max(1, item.level - minLevel + 1),
  }))
}

function getDiaryOutline(markdown: string): ReadLaterOutlineItem[] {
  let sectionIndex = 0

  return markdown.split('\n').flatMap((line) => {
    const headingMatch = line.match(/^##\s+(.*)$/)
    if (!headingMatch) {
      return []
    }

    const label = headingMatch[1].trim()
    if (!label) {
      return []
    }

    sectionIndex += 1

    return [{
      id: `structured-section-${sectionIndex}`,
      label,
      level: 1,
      kind: 'section' as const,
    }]
  })
}

function getPreviewOutline(document: ParsedPost, documentContentFormat: ResolvedContentFormat) {
  if (document.contentType === 'read-later') {
    return {
      rootId: READ_LATER_ROOT_ID,
      outlineItems: getReadLaterOutline(document.body, documentContentFormat),
    }
  }

  if (document.contentType === 'post' && documentContentFormat === 'markdown') {
    return {
      rootId: POST_PREVIEW_ROOT_ID,
      outlineItems: normalizeOutlineLevels(extractMarkdownHeadings(document.body, 'post-preview-heading')),
    }
  }

  if (document.contentType === 'diary' && documentContentFormat === 'markdown') {
    return {
      rootId: POST_PREVIEW_ROOT_ID,
      outlineItems: getDiaryOutline(document.body),
    }
  }

  return {
    rootId: POST_PREVIEW_ROOT_ID,
    outlineItems: [] as ReadLaterOutlineItem[],
  }
}

export default function PostListPane({
  posts,
  hidden,
  contentType,
  activePostPath = null,
  document = null,
  documentContentFormat = 'markdown',
  isPreviewing = false,
  activeOutlineTargetId = null,
  isDeleting = false,
  deletingPostPath = null,
  isTogglingPinned = false,
  togglingPinnedPostPath = null,
  disabledPinnedPostPath = null,
  onOpenPost,
  onDeletePost,
  onTogglePinned,
  onBackToList,
  backToListLabel = '← 返回归档',
  onNavigateOutline,
  isTopBarHidden = false,
  onToggleTopBar,
  isDrawer = false,
  onClose,
}: PostListPaneProps) {
  const [drawerSearch, setDrawerSearch] = useState('')
  if (hidden) {
    return null
  }

  const shouldShowReaderNav = Boolean(
    document
    && (
      document.contentType === 'read-later'
      || (isPreviewing && (document.contentType === 'post' || document.contentType === 'diary'))
    ),
  )

  if (document && shouldShowReaderNav) {
    const { rootId, outlineItems } = getPreviewOutline(document, documentContentFormat)
    const handleOutlineNavigation = (targetId: string) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
      if (!onNavigateOutline) {
        return
      }

      event.preventDefault()
      onNavigateOutline(targetId)
    }

    return (
      <aside className="post-pane post-pane--reader">
        <div className="post-pane__header post-pane__header--reader-nav">
          <div className="post-pane__reader-actions">
            {onBackToList ? (
              <button type="button" className="post-pane__back-link" onClick={onBackToList}>
                {backToListLabel}
              </button>
            ) : null}
            {onToggleTopBar ? (
              <button
                type="button"
                className="post-pane__back-link"
                onClick={onToggleTopBar}
                aria-pressed={isTopBarHidden}
              >
                {isTopBarHidden ? '显示顶部栏' : '隐藏顶部栏'}
              </button>
            ) : null}
          </div>
          <p className="post-pane__eyebrow post-pane__eyebrow--reader-nav">内容目录</p>
        </div>

        <nav className="post-outline" aria-label="文章目录">
          <div className="post-outline__list">
            <a
              className={`post-outline__item post-outline__item--top${activeOutlineTargetId === rootId ? ' is-active' : ''}`}
              href={`#${rootId}`}
              onClick={handleOutlineNavigation(rootId)}
              aria-current={activeOutlineTargetId === rootId ? 'location' : undefined}
            >
              回到顶部
            </a>
            {outlineItems.map((item) => {
              const isActive = activeOutlineTargetId === item.id

              return (
                <a
                  key={item.id}
                  className={`post-outline__item post-outline__item--level-${Math.min(item.level, 4)}${item.kind === 'section' ? ' post-outline__item--section' : ''}${isActive ? ' is-active' : ''}`}
                  href={`#${item.id}`}
                  onClick={handleOutlineNavigation(item.id)}
                  aria-current={isActive ? 'location' : undefined}
                >
                  {item.label}
                </a>
              )
            })}
          </div>
        </nav>
      </aside>
    )
  }

  const normalizedDrawerSearch = drawerSearch.trim().toLowerCase()
  const visiblePosts = !isDrawer || !normalizedDrawerSearch
    ? posts
    : posts.filter((post) => [post.title, post.desc, post.categories.join(' '), post.tags.join(' ')].join(' ').toLowerCase().includes(normalizedDrawerSearch))
  const draftPosts = visiblePosts.filter((post) => !post.published)
  const publishedPosts = visiblePosts.filter((post) => post.published)
  const renderPosts = (items: PostIndexItem[]) => items.map((post) => {
          const isActive = post.path === activePostPath
          const isDeletingThisPost = deletingPostPath === post.path
          const isTogglingPinnedThisPost = togglingPinnedPostPath === post.path
          const isPinnedToggleDisabled = isTogglingPinned || isDeleting || disabledPinnedPostPath === post.path
          const statusTone = contentType === 'read-later' ? getReadLaterStatusTone(post.readingStatus) : post.published ? 'published' : 'draft'
          const statusLabel =
            contentType === 'read-later'
              ? getReadLaterStatusLabel(post.readingStatus)
              : contentType === 'diary'
                ? '日记'
                : contentType === 'knowledge'
                  ? '知识点'
                : post.published
                  ? '已发布'
                  : '草稿'

          return (
            <li key={post.path} className={`post-list-item${isActive ? ' is-active' : ''}`}>
              <div className="post-list-item__actions">
                <button type="button" className="post-row-button" onClick={() => onOpenPost(post)}>
                  <div className="post-row-button__meta">
                    <span className={`post-status-badge post-status-badge--${statusTone}`}>{statusLabel}</span>
                    {post.pinned ? <span className="post-status-badge post-status-badge--pinned">置顶</span> : null}
                    <span>{post.date}</span>
                  </div>
                  <strong>{post.title}</strong>
                  {contentType !== 'diary' ? <span className="post-row-button__desc">{post.desc || (contentType === 'knowledge' ? '暂无内容' : '暂无摘要')}</span> : null}
                  <div className="post-row-button__footer"><span>{contentType === 'read-later' ? (post.sourceName || '未填写来源') : contentType === 'diary' ? (post.tags[0] || '内部记录') : contentType === 'knowledge' ? (post.sourceTitle || '手动新增') : (post.permalink || '旧链接')}</span><span>{contentType === 'read-later' ? (post.externalUrl || '未填写原文链接') : contentType === 'diary' ? post.path.replace(/^source\/diary\//, '') : contentType === 'knowledge' ? (post.sourceUrl || post.sourcePath || '内部知识库') : (post.categories[0] || '未分类')}</span></div>
                </button>
                <div className="post-list-item__side-actions">
                  <button type="button" className={`post-list-item__pin-btn${post.pinned ? ' is-active' : ''}`} onClick={() => onTogglePinned(post)} disabled={isPinnedToggleDisabled} aria-label={getPinActionLabel(contentType, post.pinned)}>{isTogglingPinnedThisPost ? '处理中…' : post.pinned ? '已置顶' : '置顶'}</button>
                  <button type="button" className="post-list-item__delete-btn" onClick={() => onDeletePost(post)} disabled={isDeleting} aria-label="删除文章" title={`删除《${post.title}》`}>{isDeletingThisPost ? '删除中…' : '删除'}</button>
                </div>
              </div>
            </li>
          )
        })

  return (
    <aside className={`post-pane${isDrawer ? ' post-pane--drawer' : ''}`}>
      <div className="post-pane__header">
        {isDrawer ? <div className="post-pane__drawer-top"><strong>文章列表</strong><button type="button" className="drawer-close-button" onClick={onClose} aria-label="关闭文章列表">×</button></div> : null}
        <p className="post-pane__eyebrow">{contentType === 'read-later' ? '待读归档' : contentType === 'diary' ? '日记归档' : contentType === 'knowledge' ? '知识点归档' : '文章归档'}</p>
        <div className="post-pane__title-row">
          <h2>{contentType === 'read-later' ? '待读' : contentType === 'diary' ? '日记' : contentType === 'knowledge' ? '知识点' : '文章'}</h2>
          <span className="post-pane__count">{posts.length}</span>
        </div>
        <p className="post-pane__note">
          {contentType === 'read-later'
            ? '先看来源、状态和原文链接，再打开对应条目。'
            : contentType === 'diary'
              ? '按时间浏览你的阶段记录，打开后直接续写。'
              : contentType === 'knowledge'
                ? '优先看来源、摘录与标签，快速回到你要复习的点。'
              : '先看标题、链接和元信息，再打开对应稿件。'}
        </p>
        {isDrawer ? <label className="post-pane__drawer-search"><span className="sr-only">搜索文章</span><input value={drawerSearch} onChange={(event) => setDrawerSearch(event.target.value)} placeholder="搜索标题、分类或标签" autoFocus /></label> : null}
      </div>
      {isDrawer ? (
        <div className="post-pane__drawer-groups">
          <section><div className="post-pane__group-label"><span>草稿</span><span>{draftPosts.length}</span></div><ul className="post-list">{renderPosts(draftPosts)}</ul></section>
          <section><div className="post-pane__group-label"><span>已发布</span><span>{publishedPosts.length}</span></div><ul className="post-list">{renderPosts(publishedPosts)}</ul></section>
        </div>
      ) : <ul className="post-list">
        {posts.map((post) => {
          const isActive = post.path === activePostPath
          const isDeletingThisPost = deletingPostPath === post.path
          const isTogglingPinnedThisPost = togglingPinnedPostPath === post.path
          const isPinnedToggleDisabled = isTogglingPinned || isDeleting || disabledPinnedPostPath === post.path
          const statusTone = contentType === 'read-later' ? getReadLaterStatusTone(post.readingStatus) : post.published ? 'published' : 'draft'
          const statusLabel =
            contentType === 'read-later'
              ? getReadLaterStatusLabel(post.readingStatus)
              : contentType === 'diary'
                ? '日记'
                : contentType === 'knowledge'
                  ? '知识点'
                : post.published
                  ? '已发布'
                  : '草稿'

          return (
            <li key={post.path} className={`post-list-item${isActive ? ' is-active' : ''}`}>
              <div className="post-list-item__actions">
                <button type="button" className="post-row-button" onClick={() => onOpenPost(post)}>
                  <div className="post-row-button__meta">
                    <span className={`post-status-badge post-status-badge--${statusTone}`}>
                      {statusLabel}
                    </span>
                    {post.pinned ? <span className="post-status-badge post-status-badge--pinned">置顶</span> : null}
                    <span>{post.date}</span>
                  </div>
                  <strong>{post.title}</strong>
                  {contentType !== 'diary' ? (
                    <span className="post-row-button__desc">{post.desc || (contentType === 'knowledge' ? '暂无内容' : '暂无摘要')}</span>
                  ) : null}
                  <div className="post-row-button__footer">
                    <span>
                      {contentType === 'read-later'
                        ? (post.sourceName || '未填写来源')
                        : contentType === 'diary'
                          ? (post.tags[0] || '内部记录')
                          : contentType === 'knowledge'
                            ? (post.sourceTitle || (post.sourceType === 'read-later' ? '来自待读' : post.sourceType === 'post' ? '来自文章' : post.sourceType === 'diary' ? '来自日记' : '手动新增'))
                          : (post.permalink || '旧链接')}
                    </span>
                    <span>
                      {contentType === 'read-later'
                        ? (post.externalUrl || '未填写原文链接')
                        : contentType === 'diary'
                          ? post.path.replace(/^source\/diary\//, '')
                          : contentType === 'knowledge'
                            ? (post.sourceUrl || post.sourcePath || '内部知识库')
                          : (post.categories[0] || '未分类')}
                    </span>
                  </div>
                </button>
                <div className="post-list-item__side-actions">
                  <button
                    type="button"
                    className={`post-list-item__pin-btn${post.pinned ? ' is-active' : ''}`}
                    onClick={() => onTogglePinned(post)}
                    disabled={isPinnedToggleDisabled}
                    aria-label={getPinActionLabel(contentType, post.pinned)}
                    title={disabledPinnedPostPath === post.path ? '当前内容有未保存修改，请先保存。' : post.pinned ? `取消《${post.title}》的置顶` : `置顶《${post.title}》`}
                  >
                    {isTogglingPinnedThisPost ? '处理中…' : post.pinned ? '已置顶' : '置顶'}
                  </button>
                  <button
                    type="button"
                    className="post-list-item__delete-btn"
                    onClick={() => onDeletePost(post)}
                    disabled={isDeleting}
                    aria-label={contentType === 'read-later' ? '删除待读条目' : contentType === 'diary' ? '删除日记' : contentType === 'knowledge' ? '删除知识点' : '删除文章'}
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
      }
    </aside>
  )
}
