import type { ParsedPost } from '../posts/parse-post'
import { fromPostDateTimeInputValue, toPostDateTimeInputValue } from '../posts/new-post'
import type { PostValidationErrors } from '../posts/post-types'
import TaxonomyMultiSelect from './taxonomy-multi-select'

type TaxonomyType = 'categories' | 'tags'

type SettingsPanelProps = {
  document: ParsedPost | null
  validationErrors: PostValidationErrors
  publishLocked: boolean
  availableCategories: string[]
  availableTags: string[]
  onFieldChange: <K extends keyof ParsedPost['frontmatter']>(
    field: K,
    value: ParsedPost['frontmatter'][K],
  ) => void
  onTaxonomyCreate?: (type: TaxonomyType, name: string) => void
  onTaxonomyRename?: (type: TaxonomyType, oldName: string, newName: string) => void
  onTaxonomyDelete?: (type: TaxonomyType, name: string) => void
  onUploadImage?: (file: File) => Promise<{ markdown: string; publicUrl: string }>
  previewImageUrls?: Record<string, string>
}


export default function SettingsPanel({
  document,
  validationErrors,
  publishLocked,
  availableCategories,
  availableTags,
  onFieldChange,
  onTaxonomyCreate,
  onTaxonomyRename,
  onTaxonomyDelete,
  onUploadImage,
  previewImageUrls,
}: SettingsPanelProps) {
  if (!document) {
    return null
  }

  const { frontmatter } = document

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

  return (
    <aside className="settings-panel">
      <div className="settings-panel__header">
        <p className="settings-panel__eyebrow">元信息</p>
        <h2>发布设置</h2>
        <p>发布前把标题、链接与分类信息整理清楚。</p>
      </div>

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
    </aside>
  )
}
