import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PitchStatus } from '../posts/post-types'
import FilterSelect, { type FilterSelectOption } from '../layout/filter-select'
import { useColorMode } from '../layout/use-color-mode'

const STATUS_OPTIONS: FilterSelectOption[] = [
  { value: 'collecting', label: '收集中' },
  { value: 'writing', label: '写作中' },
  { value: 'done', label: '已完成' },
]

export function QuickPitchModal({
  isOpen,
  defaultStatus = 'collecting',
  availableTags = [],
  isSaving,
  onClose,
  onSave,
}: {
  isOpen: boolean
  defaultStatus?: PitchStatus
  availableTags?: string[]
  isSaving?: boolean
  onClose: () => void
  onSave: (data: {
    title: string
    inspiration?: string
    tags?: string[]
    pitchStatus?: PitchStatus
    openInEditor?: boolean
  }) => Promise<void>
}) {
  const { isDark } = useColorMode()
  const [title, setTitle] = useState('')
  const [inspiration, setInspiration] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [status, setStatus] = useState<PitchStatus>(defaultStatus)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const tagOptions = useMemo<FilterSelectOption[]>(() => {
    return availableTags.map((tag) => ({ value: tag, label: tag }))
  }, [availableTags])

  useEffect(() => {
    if (isOpen) {
      setTitle('')
      setInspiration('')
      setTagsInput('')
      setStatus(defaultStatus === 'open' ? 'collecting' : defaultStatus)
      setError(null)
      setTimeout(() => {
        textareaRef.current?.focus()
      }, 50)
    }
  }, [isOpen, defaultStatus])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) return
      if (event.key === 'Escape' && !isSaving) {
        event.preventDefault()
        onClose()
      } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        void handleFormSubmit(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSaving, title, inspiration, tagsInput, status])

  const handleFormSubmit = async (openInEditor = false) => {
    if (!title.trim()) {
      setError('请输入灵感想法或标题')
      textareaRef.current?.focus()
      return
    }

    const tags = tagsInput
      .split(/[,，\s]+/)
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean)

    try {
      await onSave({
        title: title.trim(),
        inspiration: inspiration.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        pitchStatus: status,
        openInEditor,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存灵感失败')
    }
  }

  if (!isOpen) return null

  const modalContent = (
    <div
      className={`quick-pitch-modal__overlay${isDark ? ' quick-pitch-modal__overlay--dark' : ''}`}
      onClick={isSaving ? undefined : onClose}
    >
      <div
        className={`quick-pitch-modal${isDark ? ' quick-pitch-modal--dark' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-pitch-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="quick-pitch-modal__header">
          <div className="quick-pitch-modal__title-row">
            <span className="quick-pitch-modal__icon" aria-hidden="true">💡</span>
            <h3 id="quick-pitch-modal-title" className="quick-pitch-modal__title">快速记录灵感</h3>
          </div>
          <button
            type="button"
            className="quick-pitch-modal__close"
            onClick={onClose}
            disabled={isSaving}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <form
          className="quick-pitch-modal__form"
          onSubmit={(e) => {
            e.preventDefault()
            void handleFormSubmit(false)
          }}
        >
          {error ? <div className="error-message quick-pitch-modal__error">{error}</div> : null}

          <div className="quick-pitch-modal__field">
            <label htmlFor="quick-pitch-title" className="quick-pitch-modal__label">
              灵感 / 主题 <span className="quick-pitch-modal__required">*</span>
            </label>
            <textarea
              id="quick-pitch-title"
              ref={textareaRef}
              className="quick-pitch-modal__textarea"
              rows={3}
              placeholder="一两句话记录你的灵感与想法…"
              value={title}
              disabled={isSaving}
              onChange={(e) => {
                setTitle(e.target.value)
                if (error) setError(null)
              }}
            />
          </div>

          <div className="quick-pitch-modal__field">
            <label htmlFor="quick-pitch-inspiration" className="quick-pitch-modal__label">
              灵感来源 / 触发点
            </label>
            <input
              id="quick-pitch-inspiration"
              type="text"
              className="quick-pitch-modal__input"
              placeholder="例如：看《某本书》第3章、某条推文、散步时的感触"
              value={inspiration}
              disabled={isSaving}
              onChange={(e) => setInspiration(e.target.value)}
            />
          </div>

          <div className="quick-pitch-modal__row">
            <div className="quick-pitch-modal__field quick-pitch-modal__field--half">
              <span className="quick-pitch-modal__label">标签</span>
              <FilterSelect
                label="标签"
                value={tagsInput}
                options={tagOptions}
                searchable
                allowCustomValue
                placeholder="选择或输入标签"
                onChange={(nextVal) => setTagsInput(nextVal)}
              />
            </div>

            <div className="quick-pitch-modal__field quick-pitch-modal__field--half">
              <span className="quick-pitch-modal__label">状态</span>
              <FilterSelect
                label="状态"
                value={status}
                options={STATUS_OPTIONS}
                onChange={(nextVal) => setStatus(nextVal as PitchStatus)}
              />
            </div>
          </div>

          <div className="quick-pitch-modal__actions">
            <div className="quick-pitch-modal__buttons">
              <button
                type="button"
                className="quick-pitch-modal__btn quick-pitch-modal__btn--cancel"
                onClick={onClose}
                disabled={isSaving}
              >
                取消
              </button>
              <button
                type="submit"
                className="quick-pitch-modal__btn quick-pitch-modal__btn--primary"
                disabled={isSaving}
              >
                {isSaving ? '保存中…' : '保存灵感'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )

  if (typeof document === 'undefined') {
    return modalContent
  }

  return createPortal(modalContent, document.body)
}
