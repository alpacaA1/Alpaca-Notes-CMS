import { useEffect } from 'react'
import type { PostIndexItem } from '../posts/post-types'

type MaterialSourceType = 'diary' | 'read-later'
type MaterialSelectionState = Record<MaterialSourceType, string[]>

type MaterialOrganizerDialogProps = {
  diaryPosts: PostIndexItem[]
  readLaterPosts: PostIndexItem[]
  selectedMaterialPaths: MaterialSelectionState
  isLoadingReadLater?: boolean
  isProcessing?: boolean
  onSelectedMaterialPathsChange: (type: MaterialSourceType, paths: string[]) => void
  onClearSelectedMaterials: () => void
  onConfirm: () => void
  onCancel: () => void
}

function formatSelectedMaterialSummary(selection: MaterialSelectionState) {
  const parts: string[] = []
  if (selection.diary.length > 0) {
    parts.push(`${selection.diary.length} 篇日记`)
  }
  if (selection['read-later'].length > 0) {
    parts.push(`${selection['read-later'].length} 条待读`)
  }

  return parts.join(' · ') || '0 条素材'
}

function formatDateLabel(value: string) {
  return value?.slice(0, 10) || '未标日期'
}

function MaterialSelectionSection({
  title,
  description,
  posts,
  type,
  selectedPaths,
  isLoading = false,
  isProcessing = false,
  onSelectedMaterialPathsChange,
}: {
  title: string
  description: string
  posts: PostIndexItem[]
  type: MaterialSourceType
  selectedPaths: string[]
  isLoading?: boolean
  isProcessing?: boolean
  onSelectedMaterialPathsChange: (type: MaterialSourceType, paths: string[]) => void
}) {
  const selectedPathSet = new Set(selectedPaths)
  const hasSelected = selectedPaths.length > 0

  const toggleItem = (path: string) => {
    const next = new Set(selectedPathSet)
    if (next.has(path)) {
      next.delete(path)
    } else {
      next.add(path)
    }
    onSelectedMaterialPathsChange(type, Array.from(next))
  }

  return (
    <section className="material-organizer-dialog__section" aria-label={title}>
      <div className="material-organizer-dialog__section-header">
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        <div className="material-organizer-dialog__section-actions">
          <button
            type="button"
            className="material-organizer-dialog__text-btn"
            onClick={() => onSelectedMaterialPathsChange(type, posts.map((post) => post.path))}
            disabled={posts.length === 0 || isLoading || isProcessing}
          >
            全选
          </button>
          <button
            type="button"
            className="material-organizer-dialog__text-btn"
            onClick={() => onSelectedMaterialPathsChange(type, [])}
            disabled={!hasSelected || isProcessing}
          >
            清空
          </button>
        </div>
      </div>

      <div className="material-organizer-dialog__section-meta">
        <span>{posts.length} 条可选</span>
        <span>{selectedPaths.length} 条已选</span>
      </div>

      <div className="material-organizer-dialog__list">
        {isLoading ? (
          <p className="material-organizer-dialog__empty">正在加载待读列表…</p>
        ) : posts.length === 0 ? (
          <p className="material-organizer-dialog__empty">{type === 'diary' ? '还没有可整理的日记。' : '还没有可整理的待读。'}</p>
        ) : (
          posts.map((post) => {
            const checked = selectedPathSet.has(post.path)

            return (
              <label
                key={post.path}
                className={`material-organizer-dialog__item${checked ? ' is-active' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isProcessing}
                  aria-label={type === 'diary' ? `选择日记 ${post.title}` : `选择待读 ${post.title}`}
                  onChange={() => toggleItem(post.path)}
                />
                <div className="material-organizer-dialog__item-copy">
                  <div className="material-organizer-dialog__item-title-row">
                    <strong>{post.title || '未命名素材'}</strong>
                    <span>{formatDateLabel(post.date)}</span>
                  </div>
                  <p>
                    {type === 'diary'
                      ? (post.desc?.trim() || '纳入这篇日记的正文内容。')
                      : post.sourceName?.trim()
                        ? `${post.sourceName.trim()} · 自动带上我的总结、我的评论和有评论批注`
                        : '自动带上我的总结、我的评论和有评论批注'}
                  </p>
                </div>
              </label>
            )
          })
        )}
      </div>
    </section>
  )
}

export default function MaterialOrganizerDialog({
  diaryPosts,
  readLaterPosts,
  selectedMaterialPaths,
  isLoadingReadLater = false,
  isProcessing = false,
  onSelectedMaterialPathsChange,
  onClearSelectedMaterials,
  onConfirm,
  onCancel,
}: MaterialOrganizerDialogProps) {
  const hasSelectedMaterials =
    selectedMaterialPaths.diary.length > 0 || selectedMaterialPaths['read-later'].length > 0

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isProcessing) {
        onCancel()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isProcessing, onCancel])

  return (
    <div className="confirm-dialog__overlay material-organizer-dialog__overlay" onClick={isProcessing ? undefined : onCancel}>
      <div
        className="confirm-dialog material-organizer-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="material-organizer-dialog-title"
        aria-describedby="material-organizer-dialog-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="material-organizer-dialog__header">
          <div>
            <p className="post-dashboard__filter-label">写作素材</p>
            <h3 id="material-organizer-dialog-title" className="confirm-dialog__title material-organizer-dialog__title">整理素材</h3>
          </div>
          <button
            type="button"
            className="material-organizer-dialog__close"
            aria-label="关闭素材整理弹框"
            disabled={isProcessing}
            onClick={onCancel}
          >
            ×
          </button>
        </div>

        <p id="material-organizer-dialog-description" className="confirm-dialog__message material-organizer-dialog__message">
          勾选要纳入本次总结的日记和待读。待读会自动带上我的总结、我的评论和有评论批注。
        </p>

        <div className="material-organizer-dialog__summary-row">
          <span className="material-organizer-dialog__summary">
            当前已选 {formatSelectedMaterialSummary(selectedMaterialPaths)}
          </span>
          <button
            type="button"
            className="material-organizer-dialog__text-btn"
            disabled={!hasSelectedMaterials || isProcessing}
            onClick={onClearSelectedMaterials}
          >
            清空已选
          </button>
        </div>

        <div className="material-organizer-dialog__sections">
          <MaterialSelectionSection
            title="日记"
            description="勾选本次需要归纳的日记正文。"
            posts={diaryPosts}
            type="diary"
            selectedPaths={selectedMaterialPaths.diary}
            isProcessing={isProcessing}
            onSelectedMaterialPathsChange={onSelectedMaterialPathsChange}
          />
          <MaterialSelectionSection
            title="待读"
            description="每条会自动提取我的总结、我的评论和有评论批注。"
            posts={readLaterPosts}
            type="read-later"
            selectedPaths={selectedMaterialPaths['read-later']}
            isLoading={isLoadingReadLater}
            isProcessing={isProcessing}
            onSelectedMaterialPathsChange={onSelectedMaterialPathsChange}
          />
        </div>

        <div className="confirm-dialog__actions material-organizer-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--cancel"
            disabled={isProcessing}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="confirm-dialog__btn confirm-dialog__btn--confirm"
            disabled={!hasSelectedMaterials || isProcessing}
            onClick={onConfirm}
          >
            {isProcessing ? '整理中…' : '开始总结'}
          </button>
        </div>
      </div>
    </div>
  )
}
