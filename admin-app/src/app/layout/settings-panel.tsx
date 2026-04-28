import { useEffect, useMemo, useState } from 'react'
import type { ParsedPost } from '../posts/parse-post'
import { fromPostDateTimeInputValue, toPostDateTimeInputValue } from '../posts/new-post'
import type { PostValidationErrors } from '../posts/post-types'
import type { ReadLaterSections } from '../read-later/item-types'
import { createReadLaterBody } from '../read-later/new-item'
import { getEditableReadLaterSections } from '../read-later/parse-item'
import TaxonomyMultiSelect from './taxonomy-multi-select'

type TaxonomyType = 'categories' | 'tags'
type ReadLaterTab = 'info' | 'commentary'

type SettingsPanelProps = {
  document: ParsedPost | null
  validationErrors: PostValidationErrors
  publishLocked: boolean
  contentType?: 'post' | 'read-later'
  availableCategories: string[]
  availableTags: string[]
  onFieldChange: <K extends keyof ParsedPost['frontmatter']>(
    field: K,
    value: ParsedPost['frontmatter'][K],
  ) => void
  onBodyChange?: (body: string) => void
  onTaxonomyCreate?: (type: TaxonomyType, name: string) => void
  onTaxonomyRename?: (type: TaxonomyType, oldName: string, newName: string) => void
  onTaxonomyDelete?: (type: TaxonomyType, name: string) => void
  onUploadImage?: (file: File) => Promise<{ markdown: string; publicUrl: string }>
  onImportFromUrl?: () => void
  isImportingFromUrl?: boolean
  previewImageUrls?: Record<string, string>
}

function getReadingStatusTone(status?: ParsedPost['frontmatter']['reading_status']) {
  return status === 'done' ? 'done' : status === 'reading' ? 'reading' : 'unread'
}

function getReadingStatusLabel(status?: ParsedPost['frontmatter']['reading_status']) {
  return status === 'done' ? '已读' : status === 'reading' ? '在读' : '未读'
}

export default function SettingsPanel({
  document,
  validationErrors,
  publishLocked,
  contentType = 'post',
  availableCategories,
  availableTags,
  onFieldChange,
  onBodyChange,
  onTaxonomyCreate,
  onTaxonomyRename,
  onTaxonomyDelete,
  onUploadImage,
  onImportFromUrl,
  isImportingFromUrl = false,
  previewImageUrls,
}: SettingsPanelProps) {
  const [readLaterTab, setReadLaterTab] = useState<ReadLaterTab>('info')
  const isReadLater = contentType === 'read-later'
  const readLaterSections = useMemo(
    () => (isReadLater && document ? getEditableReadLaterSections(document.body) : null),
    [document?.body, isReadLater],
  )

  useEffect(() => {
    setReadLaterTab('info')
  }, [contentType, document?.path])

  if (!document) {
    return null
  }

  const { frontmatter } = document
  const showInfoFields = !isReadLater || readLaterTab === 'info'
  const externalUrl = isReadLater ? (frontmatter.external_url || '').trim() : ''
  const canOpenExternalUrl = /^https?:\/\//i.test(externalUrl)

  const handleUploadClick = () => {
    const fileInput = window.document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (file && onUploadImage) {
        onUploadImage(file)
          .then((res) => {
            onFieldChange('cover', res.publicUrl)
          })
          .catch(() => {
            // Error is handled in App.tsx
          })
      }
    }
    fileInput.click()
  }

  const handleReadLaterSectionChange = <K extends keyof ReadLaterSections>(
    field: K,
    value: ReadLaterSections[K],
  ) => {
    if (!isReadLater || !readLaterSections || !onBodyChange) {
      return
    }

    onBodyChange(
      createReadLaterBody({
        ...readLaterSections,
        [field]: value,
      }),
    )
  }

  return (
    <aside className={`settings-panel${isReadLater ? ' settings-panel--reader' : ''}`}>
      <div className={`settings-panel__header${isReadLater ? ' settings-panel__header--reader' : ''}`}>
        <p className="settings-panel__eyebrow">元信息</p>
        <h2>{isReadLater ? '待读设置' : '发布设置'}</h2>
        <p>{isReadLater ? '正文以阅读视图为主，右侧专门维护信息与评论。' : '发布前把标题、链接与分类信息整理清楚。'}</p>
        {isReadLater ? (
          <div className="settings-panel__reader-summary">
            <strong className="settings-panel__reader-title">{frontmatter.title.trim() || '未命名待读'}</strong>
            <div className="settings-panel__reader-meta">
              <span className={`post-status-badge post-status-badge--${getReadingStatusTone(frontmatter.reading_status)}`}>
                {getReadingStatusLabel(frontmatter.reading_status)}
              </span>
              {(frontmatter.source_name || '').trim() ? (
                <span className="settings-panel__reader-meta-pill">{(frontmatter.source_name || '').trim()}</span>
              ) : null}
              {canOpenExternalUrl ? (
                <a className="settings-panel__reader-meta-link" href={externalUrl} rel="noreferrer" target="_blank">
                  打开原文
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {isReadLater ? (
        <div className="settings-panel__tabs" role="tablist" aria-label="待读侧栏">
          <button
            type="button"
            role="tab"
            aria-selected={readLaterTab === 'info'}
            className={`settings-panel__tab${readLaterTab === 'info' ? ' is-active' : ''}`}
            onClick={() => setReadLaterTab('info')}
          >
            信息
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={readLaterTab === 'commentary'}
            className={`settings-panel__tab${readLaterTab === 'commentary' ? ' is-active' : ''}`}
            onClick={() => setReadLaterTab('commentary')}
          >
            评论
          </button>
        </div>
      ) : null}

      {showInfoFields ? (
        <div className={`settings-panel__section-stack${isReadLater ? ' settings-panel__section-stack--reader' : ''}`}>
          <label>
            <span>标题</span>
            <input aria-label="标题" value={frontmatter.title} onChange={(event) => onFieldChange('title', event.target.value)} />
            {validationErrors.title ? <span className="error-message">{validationErrors.title}</span> : null}
          </label>

          <label>
            <span>日期</span>
            <input
              aria-label="日期"
              type="datetime-local"
              step="1"
              value={toPostDateTimeInputValue(frontmatter.date)}
              onChange={(event) => onFieldChange('date', fromPostDateTimeInputValue(event.target.value))}
            />
            <p className="settings-panel__field-note">直接选择日期与时间，保存时会保留秒级时间。</p>
            {validationErrors.date ? <span className="error-message">{validationErrors.date}</span> : null}
          </label>

          <label>
            <span>摘要</span>
            <textarea aria-label="摘要" value={frontmatter.desc} onChange={(event) => onFieldChange('desc', event.target.value)} />
            {validationErrors.desc ? <span className="error-message">{validationErrors.desc}</span> : null}
          </label>

          {isReadLater ? (
            <>
              <label>
                <span>原文链接</span>
                <input
                  aria-label="原文链接"
                  value={frontmatter.external_url || ''}
                  placeholder="https://example.com/article"
                  onChange={(event) => onFieldChange('external_url', event.target.value)}
                />
                <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className="top-bar__button"
                    disabled={!frontmatter.external_url?.trim() || isImportingFromUrl}
                    onClick={onImportFromUrl}
                  >
                    {isImportingFromUrl ? '导入中…' : '从链接导入正文'}
                  </button>
                </div>
                {validationErrors.external_url ? <span className="error-message">{validationErrors.external_url}</span> : null}
              </label>

              <label>
                <span>来源</span>
                <input
                  aria-label="来源"
                  value={frontmatter.source_name || ''}
                  placeholder="文章来源 / 网站名"
                  onChange={(event) => onFieldChange('source_name', event.target.value)}
                />
              </label>

              <label>
                <span>阅读状态</span>
                <select
                  aria-label="阅读状态"
                  value={frontmatter.reading_status || 'unread'}
                  onChange={(event) => onFieldChange('reading_status', event.target.value as NonNullable<ParsedPost['frontmatter']['reading_status']>)}
                >
                  <option value="unread">未读</option>
                  <option value="reading">在读</option>
                  <option value="done">已读</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="settings-panel__toggle">
                <span>已发布</span>
                <input
                  aria-label="已发布"
                  type="checkbox"
                  checked={Boolean(frontmatter.published)}
                  disabled={publishLocked}
                  onChange={(event) => onFieldChange('published', event.target.checked)}
                />
              </label>

              <label className="settings-panel__toggle">
                <span>置顶</span>
                <input
                  aria-label="置顶"
                  type="checkbox"
                  checked={Boolean(frontmatter.pinned)}
                  onChange={(event) => onFieldChange('pinned', event.target.checked)}
                />
              </label>

              <div className="settings-panel__field settings-panel__taxonomy">
                <span>分类</span>
                <p className="settings-panel__field-note">搜索并选择已创建分类；已选分类会保留在下方。</p>
                <TaxonomyMultiSelect
                  label="分类"
                  value={frontmatter.categories}
                  availableOptions={availableCategories}
                  onChange={(value) => onFieldChange('categories', value)}
                  onCreateOption={onTaxonomyCreate ? (name) => onTaxonomyCreate('categories', name) : undefined}
                  onRenameOption={onTaxonomyRename ? (oldName, newName) => onTaxonomyRename('categories', oldName, newName) : undefined}
                  onDeleteOption={onTaxonomyDelete ? (name) => onTaxonomyDelete('categories', name) : undefined}
                />
              </div>
            </>
          )}

          <div className="settings-panel__field settings-panel__taxonomy">
            <span>标签</span>
            <p className="settings-panel__field-note">搜索并选择已创建标签；已选标签会保留在下方。</p>
            <TaxonomyMultiSelect
              label="标签"
              value={frontmatter.tags}
              availableOptions={availableTags}
              onChange={(value) => onFieldChange('tags', value)}
              onCreateOption={onTaxonomyCreate ? (name) => onTaxonomyCreate('tags', name) : undefined}
              onRenameOption={onTaxonomyRename ? (oldName, newName) => onTaxonomyRename('tags', oldName, newName) : undefined}
              onDeleteOption={onTaxonomyDelete ? (name) => onTaxonomyDelete('tags', name) : undefined}
            />
          </div>

          <label className="settings-panel__field">
            <span>封面图</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                style={{ flex: 1 }}
                aria-label="封面图"
                value={frontmatter.cover || ''}
                placeholder="图片 URL 或系统外链"
                onChange={(event) => onFieldChange('cover', event.target.value)}
              />
              {onUploadImage ? (
                <button
                  type="button"
                  className="top-bar__button"
                  style={{ minHeight: '36px', padding: '0 12px' }}
                  onClick={handleUploadClick}
                >
                  上传封面
                </button>
              ) : null}
            </div>
            {frontmatter.cover ? (
              <img
                src={(previewImageUrls && previewImageUrls[frontmatter.cover]) || frontmatter.cover}
                alt="Cover Preview"
                style={{ marginTop: '12px', width: '100%', borderRadius: '12px', objectFit: 'cover', maxHeight: '160px', border: '1px solid var(--admin-line)' }}
                loading="lazy"
              />
            ) : null}
          </label>

          {isReadLater ? (
            <label>
              <span>站内详情链接</span>
              <input
                aria-label="站内详情链接"
                value={frontmatter.permalink || ''}
                readOnly
                disabled
              />
            </label>
          ) : (
            <label>
              <span>永久链接</span>
              <input
                aria-label="永久链接"
                value={frontmatter.permalink || ''}
                placeholder="旧文章可留空"
                onChange={(event) => onFieldChange('permalink', event.target.value)}
              />
              {validationErrors.permalink ? <span className="error-message">{validationErrors.permalink}</span> : null}
            </label>
          )}
        </div>
      ) : null}

      {isReadLater && readLaterTab === 'commentary' ? (
        <div className="settings-panel__section-stack settings-panel__section-stack--reader">
          <div className="settings-panel__field">
            <span>评论编辑</span>
            <p className="settings-panel__field-note">优先写总结和评论；只有导入内容需要清理时，再修改原文摘录。右侧会自动整理为「原文摘录 / 我的总结 / 我的评论」。</p>
          </div>

          <label>
            <span>原文摘录</span>
            <textarea
              aria-label="原文摘录"
              value={readLaterSections?.articleExcerpt || ''}
              onChange={(event) => handleReadLaterSectionChange('articleExcerpt', event.target.value)}
            />
          </label>

          <label>
            <span>我的总结</span>
            <textarea
              aria-label="我的总结"
              value={readLaterSections?.summary || ''}
              onChange={(event) => handleReadLaterSectionChange('summary', event.target.value)}
            />
          </label>

          <label>
            <span>我的评论</span>
            <textarea
              aria-label="我的评论"
              value={readLaterSections?.commentary || ''}
              onChange={(event) => handleReadLaterSectionChange('commentary', event.target.value)}
            />
          </label>
        </div>
      ) : null}
    </aside>
  )
}
