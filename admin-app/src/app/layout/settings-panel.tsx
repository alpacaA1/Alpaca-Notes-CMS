import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { TopicBacklinkItem } from '../knowledge/wiki-links'
import type { ParsedPost } from '../posts/parse-post'
import type { ContentType, PostIndexItem } from '../posts/post-types'
import { fromPostDateTimeInputValue, toPostDateTimeInputValue } from '../posts/new-post'
import type { PostValidationErrors } from '../posts/post-types'
import type { ReadLaterAnnotation, ReadLaterSections } from '../read-later/item-types'
import { createReadLaterBody } from '../read-later/new-item'
import { getEditableReadLaterSections } from '../read-later/parse-item'
import { resolvePreviewImageSrc } from '../editor/preview-pane'
import TaxonomyMultiSelect from './taxonomy-multi-select'
import FilterSelect from './filter-select'

type TaxonomyType = 'categories' | 'tags'
type ReadLaterTab = 'info' | 'commentary'

type SettingsPanelProps = {
  document: ParsedPost | null
  validationErrors: PostValidationErrors
  contentType?: ContentType
  availableCategories: string[]
  availableTags: string[]
  availableSeries?: string[]
  onFieldChange: <K extends keyof ParsedPost['frontmatter']>(
    field: K,
    value: ParsedPost['frontmatter'][K],
  ) => void
  onBodyChange?: (body: string) => void
  onTaxonomyCreate?: (type: TaxonomyType, name: string) => void
  onTaxonomyRename?: (type: TaxonomyType, oldName: string, newName: string) => void
  onTaxonomyDelete?: (type: TaxonomyType, name: string) => void
  onSeriesRename?: (oldName: string, newName: string) => void
  onSeriesDelete?: (name: string) => void
  onUploadImage?: (file: File) => Promise<{ markdown: string; publicUrl: string }>
  onImportFromUrl?: () => void
  isImportingFromUrl?: boolean
  isReaderPreview?: boolean
  previewImageUrls?: Record<string, string>
  readLaterTab?: ReadLaterTab
  onReadLaterTabChange?: (tab: ReadLaterTab) => void
  annotations?: ReadLaterAnnotation[]
  activeAnnotationId?: string | null
  editingAnnotationId?: string | null
  annotationNoteDraft?: string
  onSelectAnnotation?: (annotationId: string) => void
  onAnnotationNoteDraftChange?: (note: string) => void
  onEditAnnotation?: (annotationId: string) => void
  onSaveAnnotationNote?: (annotationId: string, note: string) => void
  onCancelAnnotationEdit?: () => void
  topicBacklinks?: TopicBacklinkItem[]
  onOpenLinkedPost?: (post: PostIndexItem) => void
  onQuoteAnnotationToDiary?: (annotation: ReadLaterAnnotation) => void
  onStartWritingFromPitch?: () => void
  onOpenLinkedArticle?: (path: string) => void
  isDrawer?: boolean
  isOpen?: boolean
  onClose?: () => void
  focusTitle?: boolean
}

function getAnnotationPreviewText(annotation: ReadLaterAnnotation) {
  return annotation.quote.trim() || '未命名高亮'
}

function getAnnotationNotePreview(annotation: ReadLaterAnnotation) {
  return annotation.note.trim()
}

function parseAliasesInput(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter((item, index, items) => item.length > 0 && items.indexOf(item) === index)
}

function buildDefaultNodeKey(topicType: NonNullable<ParsedPost['frontmatter']['topic_type']>, title: string) {
  const trimmedTitle = title.trim()
  return trimmedTitle ? `${topicType}/${trimmedTitle}` : ''
}

const READING_STATUS_OPTIONS = [
  { value: 'unread', label: '未读' },
  { value: 'reading', label: '在读' },
  { value: 'done', label: '已读' },
]

const PITCH_STATUS_OPTIONS = [
  { value: 'collecting', label: '收集中' },
  { value: 'writing', label: '写作中' },
  { value: 'done', label: '已完成' },
  { value: 'shelved', label: '已搁置' },
]

const TOPIC_TYPE_OPTIONS = [
  { value: 'theme', label: '主题' },
  { value: 'book', label: '书' },
  { value: 'movie', label: '电影' },
  { value: 'person', label: '人物' },
]

function renderDocumentNoteValue(note: string, placeholder = '写下这篇的总结或思考…') {
  if (!note.trim()) {
    return <span className="settings-panel__document-note-placeholder">{placeholder}</span>
  }

  return <span className="settings-panel__document-note-content">{note}</span>
}

function getLinkedPostTypeLabel(contentType: ContentType | undefined) {
  if (contentType === 'diary') {
    return '日记'
  }

  if (contentType === 'knowledge') {
    return '知识点'
  }

  if (contentType === 'pitch') {
    return '选题'
  }

  if (contentType === 'private') {
    return '私密文章'
  }

  return '文章'
}

function MetadataSection({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="settings-panel__metadata-section" open={defaultOpen || undefined}>
      <summary className="settings-panel__metadata-section-summary">
        <span>{title}</span>
        <span className="settings-panel__metadata-section-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="settings-panel__metadata-section-content">{children}</div>
    </details>
  )
}

export default function SettingsPanel({
  document,
  validationErrors,
  contentType = 'post',
  availableCategories,
  availableTags,
  availableSeries = [],
  onFieldChange,
  onBodyChange,
  onTaxonomyCreate,
  onTaxonomyRename,
  onTaxonomyDelete,
  onSeriesRename,
  onSeriesDelete,
  onUploadImage,
  onImportFromUrl,
  isImportingFromUrl = false,
  isReaderPreview = false,
  previewImageUrls,
  readLaterTab: controlledReadLaterTab,
  onReadLaterTabChange,
  annotations = [],
  activeAnnotationId = null,
  editingAnnotationId = null,
  annotationNoteDraft,
  onSelectAnnotation,
  onAnnotationNoteDraftChange,
  onEditAnnotation,
  onSaveAnnotationNote,
  onCancelAnnotationEdit,
  topicBacklinks = [],
  onOpenLinkedPost,
  onQuoteAnnotationToDiary,
  onStartWritingFromPitch,
  onOpenLinkedArticle,
  isDrawer = false,
  isOpen = true,
  onClose,
  focusTitle = false,
}: SettingsPanelProps) {
  const [internalReadLaterTab, setInternalReadLaterTab] = useState<ReadLaterTab>('commentary')
  const [isDocumentNoteEditing, setIsDocumentNoteEditing] = useState(false)
  const [documentNoteDraft, setDocumentNoteDraft] = useState('')
  const [internalAnnotationNoteDraft, setInternalAnnotationNoteDraft] = useState('')
  const isReadLater = contentType === 'read-later'
  const isDiary = contentType === 'diary'
  const isPost = contentType === 'post'
  const isKnowledge = contentType === 'knowledge'
  const isPitch = contentType === 'pitch'
  const isPrivate = contentType === 'private'
  const currentReadLaterTab = controlledReadLaterTab ?? internalReadLaterTab
  const activeAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.id === activeAnnotationId) || null,
    [activeAnnotationId, annotations],
  )
  const readLaterSections = useMemo(
    () => (isReadLater && document ? getEditableReadLaterSections(document.body) : null),
    [document?.body, isReadLater],
  )

  useEffect(() => {
    const isNewDraft = isReadLater && document && !document.sha && !document.frontmatter.title?.trim()
    setInternalReadLaterTab(isNewDraft ? 'info' : 'commentary')
    setIsDocumentNoteEditing(false)
  }, [contentType, document?.path, isReadLater])

  useEffect(() => {
    if (!isReadLater) {
      setDocumentNoteDraft('')
      return
    }

    setDocumentNoteDraft(readLaterSections?.commentary || '')
  }, [isReadLater, readLaterSections?.commentary, document?.path])

  useEffect(() => {
    if (!editingAnnotationId) {
      setInternalAnnotationNoteDraft('')
      return
    }

    setInternalAnnotationNoteDraft(annotations.find((annotation) => annotation.id === editingAnnotationId)?.note || '')
  }, [annotations, editingAnnotationId])

  useEffect(() => {
    if (!focusTitle) {
      return
    }

    const titleInput = window.document.querySelector<HTMLInputElement>('.settings-panel input[aria-label="标题"]')
    titleInput?.focus()
    titleInput?.select()
  }, [focusTitle])

  if (!document) {
    return null
  }

  const { frontmatter } = document
  const showInfoFields = !isReadLater || currentReadLaterTab === 'info'
  const knowledgeKind = frontmatter.knowledge_kind || 'note'
  const isLegacyTopicKnowledge = isKnowledge && knowledgeKind === 'topic'
  const isTopicPost = isPost && frontmatter.topic === true
  const isTopicDocument = isTopicPost || isLegacyTopicKnowledge
  const currentAnnotationNoteDraft = annotationNoteDraft ?? internalAnnotationNoteDraft
  const currentDocumentNote = readLaterSections?.commentary || ''
  const isPostReaderPreview = isPost && isReaderPreview
  const useReaderLitePanel = isReadLater || isPostReaderPreview
  const hasInfoValidationErrors = Boolean(
    validationErrors.title || validationErrors.external_url || validationErrors.date || validationErrors.desc,
  )

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

  const handleOpenDocumentNoteEditor = () => {
    setDocumentNoteDraft(readLaterSections?.commentary || '')
    setIsDocumentNoteEditing(true)
  }

  const handleCancelDocumentNote = () => {
    setDocumentNoteDraft(readLaterSections?.commentary || '')
    setIsDocumentNoteEditing(false)
  }

  const handleSaveDocumentNote = () => {
    handleReadLaterSectionChange('commentary', documentNoteDraft)
    setIsDocumentNoteEditing(false)
  }

  const handleReadLaterTabClick = (tab: ReadLaterTab) => {
    if (onReadLaterTabChange) {
      onReadLaterTabChange(tab)
      return
    }

    setInternalReadLaterTab(tab)
  }

  const handleSaveAnnotation = () => {
    if (!editingAnnotationId || !onSaveAnnotationNote) {
      return
    }

    onSaveAnnotationNote(editingAnnotationId, currentAnnotationNoteDraft)
  }

  const handleCancelAnnotation = () => {
    const nextDraft = activeAnnotation?.note || ''
    setInternalAnnotationNoteDraft(nextDraft)
    onAnnotationNoteDraftChange?.(nextDraft)
    onCancelAnnotationEdit?.()
  }

  const ensureTopicDefaults = () => {
    const nextTopicType = frontmatter.topic_type || 'theme'
    if (!frontmatter.topic_type) {
      onFieldChange('topic_type', nextTopicType)
    }

    if (!(frontmatter.node_key || '').trim()) {
      const nextNodeKey = buildDefaultNodeKey(nextTopicType, frontmatter.title)
      if (nextNodeKey) {
        onFieldChange('node_key', nextNodeKey)
      }
    }
  }

  const handlePostTopicChange = (nextIsTopic: boolean) => {
    onFieldChange('topic', nextIsTopic ? true : undefined)

    if (nextIsTopic) {
      ensureTopicDefaults()
    }
  }

  return (
    <aside className={`settings-panel${isReadLater ? ' settings-panel--reader' : ''}${useReaderLitePanel ? ' settings-panel--reader-lite' : ''}${isDrawer ? ' settings-panel--drawer' : ''}${isDrawer && !isOpen ? ' is-closed' : ''}`}>
      {!isReadLater ? (
        <div className="settings-panel__header">
          {isDrawer ? <div className="settings-panel__drawer-top"><strong>文章设置</strong><button type="button" className="drawer-close-button" onClick={onClose} aria-label="关闭文章设置">×</button></div> : null}
          <>
            <p className="settings-panel__eyebrow">元信息</p>
            <h2>{isDiary ? '日记设置' : isKnowledge ? '知识点设置' : isPitch ? '选题设置' : '文章设置'}</h2>
            {isDiary ? <p>保留最少字段，先把阶段记录写下来。</p> : isKnowledge ? <p>保留正文与来源上下文，快速沉淀知识点。</p> : isPitch ? <p>轻量记录灵感，积累素材后展开写作。</p> : null}
          </>
        </div>
      ) : null}

      {isReadLater ? (
        <div className="settings-panel__tabs" role="tablist" aria-label="待读侧栏">
          <button
            type="button"
            role="tab"
            aria-selected={currentReadLaterTab === 'info'}
            className={`settings-panel__tab${currentReadLaterTab === 'info' ? ' is-active' : ''}${hasInfoValidationErrors ? ' settings-panel__tab--error' : ''}`}
            onClick={() => handleReadLaterTabClick('info')}
          >
            信息{hasInfoValidationErrors ? ' · 错误' : ''}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={currentReadLaterTab === 'commentary'}
            className={`settings-panel__tab${currentReadLaterTab === 'commentary' ? ' is-active' : ''}`}
            onClick={() => handleReadLaterTabClick('commentary')}
          >
            评论
          </button>
        </div>
      ) : null}

      {showInfoFields ? (
        <div className={`settings-panel__section-stack${isReadLater ? ' settings-panel__section-stack--reader' : ''}`}>
          {isReadLater ? (
            <>
              <MetadataSection title="基础信息" defaultOpen>
                <label>
                  <span>标题</span>
                  <input
                    aria-label="标题"
                    value={frontmatter.title}
                    placeholder="文章标题"
                    onChange={(event) => onFieldChange('title', event.target.value)}
                  />
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

                  {validationErrors.date ? <span className="error-message">{validationErrors.date}</span> : null}
                </label>
                <div className="settings-panel__field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span>原文链接</span>
                    <button
                      type="button"
                      className="top-bar__button"
                      style={{ height: '22px', minHeight: '22px', fontSize: '0.74rem', padding: '0 8px', borderRadius: '6px' }}
                      disabled={!frontmatter.external_url?.trim() || isImportingFromUrl}
                      onClick={onImportFromUrl}
                    >
                      {isImportingFromUrl ? '导入中…' : '从链接导入正文'}
                    </button>
                  </div>
                  <input
                    aria-label="原文链接"
                    value={frontmatter.external_url || ''}
                    placeholder="https://example.com/article"
                    onChange={(event) => onFieldChange('external_url', event.target.value)}
                  />
                  {validationErrors.external_url ? <span className="error-message">{validationErrors.external_url}</span> : null}
                </div>
                <label>
                  <span>来源</span>
                  <input
                    aria-label="来源"
                    value={frontmatter.source_name || ''}
                    placeholder="文章来源 / 网站名"
                    onChange={(event) => onFieldChange('source_name', event.target.value)}
                  />
                </label>
              </MetadataSection>

              <MetadataSection title="阅读设置" defaultOpen>
                <div className="settings-panel__field">
                  <span>阅读状态</span>
                  <FilterSelect
                    label="阅读状态"
                    value={frontmatter.reading_status || 'unread'}
                    options={READING_STATUS_OPTIONS}
                    onChange={(value) => onFieldChange('reading_status', value as NonNullable<ParsedPost['frontmatter']['reading_status']>)}
                    triggerAriaLabel="阅读状态"
                  />
                </div>

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
                  <span>标签</span>
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
              </MetadataSection>

              <MetadataSection title="高级设置">
                {onUploadImage || frontmatter.cover ? (
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
                        src={resolvePreviewImageSrc(frontmatter.cover, previewImageUrls) || frontmatter.cover}
                        alt="Cover Preview"
                        style={{ marginTop: '12px', width: '100%', borderRadius: '12px', objectFit: 'cover', maxHeight: '160px', border: '1px solid var(--admin-line)' }}
                        loading="lazy"
                      />
                    ) : null}
                  </label>
                ) : null}

                <label>
                  <span>手动粘贴正文</span>
                  <textarea
                    aria-label="手动粘贴正文"
                    rows={8}
                    readOnly={!onBodyChange}
                    value={readLaterSections?.articleExcerpt || ''}
                    placeholder="链接无法识别正文时，把原文粘贴到这里"
                    onChange={(event) => handleReadLaterSectionChange('articleExcerpt', event.target.value)}
                  />
                  <p className="settings-panel__field-note">会写入“原文摘录”，不会覆盖“我的总结”和“我的评论”。</p>
                </label>

                <label>
                  <span>站内详情链接</span>
                  <input aria-label="站内详情链接" value={frontmatter.permalink || ''} readOnly disabled />
                </label>
              </MetadataSection>
            </>
          ) : (
            <MetadataSection title="基础信息" defaultOpen>
              <label>
                <span>日期</span>
                <input
                  aria-label="日期"
                  type="datetime-local"
                  step="1"
                  value={toPostDateTimeInputValue(frontmatter.date)}
                  onChange={(event) => onFieldChange('date', fromPostDateTimeInputValue(event.target.value))}
                />

                {validationErrors.date ? <span className="error-message">{validationErrors.date}</span> : null}
              </label>
            </MetadataSection>
          )}

          {!isReadLater ? (
            <MetadataSection title={isPitch ? '选题设置' : '发布设置'} defaultOpen>
              <label className="settings-panel__toggle">
                <span>置顶</span>
                <input
                  aria-label="置顶"
                  type="checkbox"
                  checked={Boolean(frontmatter.pinned)}
                  onChange={(event) => onFieldChange('pinned', event.target.checked)}
                />
              </label>

              {isPitch ? (
                <>
                  <div className="settings-panel__field">
                    <span>状态</span>
                    <FilterSelect
                      label="灵感状态"
                      value={frontmatter.pitch_status === 'open' ? 'collecting' : (frontmatter.pitch_status || 'collecting')}
                      options={PITCH_STATUS_OPTIONS}
                      onChange={(value) => onFieldChange('pitch_status', value as NonNullable<ParsedPost['frontmatter']['pitch_status']>)}
                      triggerAriaLabel="灵感状态"
                    />
                  </div>

                  <label className="settings-panel__field">
                    <span>灵感来源</span>
                    <input
                      aria-label="灵感来源"
                      value={frontmatter.pitch_inspiration || ''}
                      placeholder="例如：看《原则》第三章后的感触"
                      onChange={(event) => onFieldChange('pitch_inspiration', event.target.value)}
                    />
                  </label>
                </>
              ) : null}

              {!isDiary && !isKnowledge && !isPitch && !isPrivate ? (
                <label className="settings-panel__toggle">
                  <span>已发布</span>
                  <input
                    aria-label="已发布"
                    type="checkbox"
                    checked={Boolean(frontmatter.published)}
                    onChange={(event) => onFieldChange('published', event.target.checked)}
                  />
                </label>
              ) : null}

              {isPrivate ? (
                <div className="settings-panel__toggle" style={{ opacity: 0.85 }}>
                  <span>状态</span>
                  <span style={{ fontSize: '13px', color: 'var(--color-accent, #D4A574)', fontWeight: 500 }}>
                    🔒 私密（不公开）
                  </span>
                </div>
              ) : null}

              {!isDiary && !isPitch ? (
                <div className="settings-panel__field settings-panel__taxonomy">
                  <span>分类</span>
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
              ) : null}

              {isPost ? (
                <div className="settings-panel__field">
                  <span>系列</span>
                  <FilterSelect
                    label="系列"
                    value={frontmatter.series || ''}
                    options={[
                      { value: '', label: '不归属任何系列' },
                      ...availableSeries.map((name) => ({ value: name, label: name })),
                    ]}
                    searchable
                    allowCustomValue
                    placeholder="选择或新建系列"
                    triggerAriaLabel="系列"
                    searchPlaceholder="搜索或输入新系列"
                    onChange={(value) => onFieldChange('series', value || undefined)}
                    onRenameOption={onSeriesRename}
                    onDeleteOption={onSeriesDelete}
                  />
                </div>
              ) : null}
              <div className="settings-panel__field settings-panel__taxonomy">
                <span>标签</span>
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

              {isPitch ? (
                <div className="settings-panel__field" style={{ marginTop: '12px' }}>
                  <span>关联文章</span>
                  {frontmatter.linked_post_path ? (
                    <div className="settings-panel__document-note-entry" style={{ cursor: 'default' }}>
                      <strong>已关联文章</strong>
                      <span style={{ fontSize: '12px', color: 'var(--admin-muted)', marginTop: '4px', wordBreak: 'break-all' }}>
                        {frontmatter.linked_post_path}
                      </span>
                      {onOpenLinkedArticle ? (
                        <button
                          type="button"
                          className="top-bar__button"
                          style={{ marginTop: '8px', minHeight: '32px', padding: '0 10px', fontSize: '13px' }}
                          onClick={() => onOpenLinkedArticle(frontmatter.linked_post_path!)}
                        >
                          打开关联文章
                        </button>
                      ) : null}
                    </div>
                  ) : onStartWritingFromPitch ? (
                    <div style={{ marginTop: '4px' }}>
                      <button
                        type="button"
                        className="top-bar__button top-bar__button--new-post"
                        style={{ width: '100%', justifyContent: 'center' }}
                        onClick={onStartWritingFromPitch}
                      >
                        ✍ 开始写作
                      </button>
                      <p className="settings-panel__field-note" style={{ marginTop: '6px' }}>
                        将当前选题转为正式文章草稿，自动带入标题和想法。
                      </p>
                    </div>
                  ) : (
                    <p className="settings-panel__field-note">尚未关联文章。</p>
                  )}
                </div>
              ) : null}
            </MetadataSection>
          ) : null}

          {!isReadLater ? <MetadataSection title="高级设置">
          {isPost ? (
            <div className="settings-panel__field">
              <span>文章类型</span>
              <FilterSelect
                label="文章类型"
                value={isTopicPost ? 'topic' : 'post'}
                options={[{ value: 'post', label: '普通文章' }, { value: 'topic', label: '主题文章' }]}
                triggerAriaLabel="文章类型"
                onChange={(value) => handlePostTopicChange(value === 'topic')}
              />
              <p className="settings-panel__field-note">主题文章可以被日记、文章和知识点用 `[[node_key]]` 引用。</p>
            </div>
          ) : null}

          {isKnowledge ? (
            <>
              {isLegacyTopicKnowledge ? (
                <>
                  <div className="settings-panel__field">
                    <span>主题类型</span>
                    <FilterSelect
                      label="主题类型"
                      value={frontmatter.topic_type || 'theme'}
                      options={TOPIC_TYPE_OPTIONS}
                      onChange={(value) => onFieldChange('topic_type', value as NonNullable<ParsedPost['frontmatter']['topic_type']>)}
                      triggerAriaLabel="主题类型"
                    />
                  </div>

                  <label className="settings-panel__field">
                    <span>节点 Key</span>
                    <input
                      aria-label="节点 Key"
                      value={frontmatter.node_key || ''}
                      placeholder="book/影响力"
                      onChange={(event) => onFieldChange('node_key', event.target.value)}
                    />
                    <p className="settings-panel__field-note">建议保持稳定，例如 `book/影响力`、`person/稻盛和夫`。</p>
                    {validationErrors.node_key ? <span className="error-message">{validationErrors.node_key}</span> : null}
                  </label>

                  <label className="settings-panel__field">
                    <span>别名</span>
                    <textarea
                      aria-label="别名"
                      value={(frontmatter.aliases || []).join('\n')}
                      placeholder={'《影响力》\nInfluence'}
                      onChange={(event) => onFieldChange('aliases', parseAliasesInput(event.target.value))}
                    />
                    <p className="settings-panel__field-note">一行一个，方便在正文里用显示名引用。</p>
                  </label>
                  <p className="settings-panel__field-note">这是旧版知识点主题节点，后续建议改用文章里的“主题文章”。</p>
                </>
              ) : null}

              <div className="settings-panel__field">
                <span>来源</span>
                <div className="settings-panel__document-note-entry" style={{ cursor: 'default' }}>
                  <strong>{frontmatter.source_title?.trim() || '手动新增知识点'}</strong>
                  <div style={{ marginTop: '8px', display: 'grid', gap: '4px' }}>
                    <span>
                      {frontmatter.source_type === 'read-later'
                        ? '来源类型：待读'
                        : frontmatter.source_type === 'post'
                          ? '来源类型：文章'
                          : frontmatter.source_type === 'diary'
                            ? '来源类型：日记'
                            : '来源类型：手动整理'}
                    </span>
                    {frontmatter.source_path ? <span>{`来源路径：${frontmatter.source_path}`}</span> : null}
                    {frontmatter.source_url ? (
                      <a href={frontmatter.source_url} target="_blank" rel="noreferrer" style={{ width: 'fit-content' }}>
                        打开原链接
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>

              {isLegacyTopicKnowledge ? (
                <div className="settings-panel__field">
                  <span>反向引用</span>
                  {topicBacklinks.length > 0 ? (
                    <div className="settings-panel__linked-posts">
                      {topicBacklinks.map((backlink, index) => (
                        <button
                          key={`${backlink.sourcePath}-${backlink.targetKey}-${backlink.excerpt}-${index}`}
                          type="button"
                          className="settings-panel__linked-post"
                          onClick={() => onOpenLinkedPost?.(backlink.sourcePost)}
                        >
                          <div className="settings-panel__linked-post-meta">
                            <strong>{backlink.sourceTitle}</strong>
                            <span>{getLinkedPostTypeLabel(backlink.sourceContentType)} · {backlink.sourceDate.slice(0, 10) || '无日期'}</span>
                          </div>
                          <p>{backlink.excerpt || '点击打开原文'}</p>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="settings-panel__field-note">这个主题节点还没有被其它日记、文章或知识点提到。</p>
                  )}
                </div>
              ) : null}
            </>
          ) : null}

          {isPost && isTopicDocument ? (
            <>
              <div className="settings-panel__field">
                <span>主题类型</span>
                <FilterSelect
                  label="主题类型"
                  value={frontmatter.topic_type || 'theme'}
                  options={TOPIC_TYPE_OPTIONS}
                  onChange={(value) => onFieldChange('topic_type', value as NonNullable<ParsedPost['frontmatter']['topic_type']>)}
                  triggerAriaLabel="主题类型"
                />
              </div>

              <label className="settings-panel__field">
                <span>节点 Key</span>
                <input
                  aria-label="节点 Key"
                  value={frontmatter.node_key || ''}
                  placeholder="book/影响力"
                  onChange={(event) => onFieldChange('node_key', event.target.value)}
                />
                <p className="settings-panel__field-note">建议保持稳定，例如 `book/影响力`、`person/稻盛和夫`。</p>
                {validationErrors.node_key ? <span className="error-message">{validationErrors.node_key}</span> : null}
              </label>

              <label className="settings-panel__field">
                <span>别名</span>
                <textarea
                  aria-label="别名"
                  value={(frontmatter.aliases || []).join('\n')}
                  placeholder={'《影响力》\nInfluence'}
                  onChange={(event) => onFieldChange('aliases', parseAliasesInput(event.target.value))}
                />
                <p className="settings-panel__field-note">一行一个，方便在正文里用显示名引用。</p>
              </label>

              <div className="settings-panel__field">
                <span>反向引用</span>
                {topicBacklinks.length > 0 ? (
                  <div className="settings-panel__linked-posts">
                    {topicBacklinks.map((backlink, index) => (
                      <button
                        key={`${backlink.sourcePath}-${backlink.targetKey}-${backlink.excerpt}-${index}`}
                        type="button"
                        className="settings-panel__linked-post"
                        onClick={() => onOpenLinkedPost?.(backlink.sourcePost)}
                      >
                        <div className="settings-panel__linked-post-meta">
                          <strong>{backlink.sourceTitle}</strong>
                          <span>{getLinkedPostTypeLabel(backlink.sourceContentType)} · {backlink.sourceDate.slice(0, 10) || '无日期'}</span>
                        </div>
                        <p>{backlink.excerpt || '点击打开原文'}</p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="settings-panel__field-note">这篇主题文章还没有被其它日记、文章或知识点提到。</p>
                )}
              </div>
            </>
          ) : null}

          {!isDiary && !isKnowledge && !isPitch ? (
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
                  src={resolvePreviewImageSrc(frontmatter.cover, previewImageUrls) || frontmatter.cover}
                  alt="Cover Preview"
                  style={{ marginTop: '12px', width: '100%', borderRadius: '12px', objectFit: 'cover', maxHeight: '160px', border: '1px solid var(--admin-line)' }}
                  loading="lazy"
                />
              ) : null}
            </label>
          ) : null}

          {contentType === 'post' ? (
            <label className="settings-panel__field">
              <span>永久链接</span>
              <input
                aria-label="永久链接"
                value={frontmatter.permalink || ''}
                placeholder="旧文章可留空"
                onChange={(event) => onFieldChange('permalink', event.target.value)}
              />
              {validationErrors.permalink ? <span className="error-message">{validationErrors.permalink}</span> : null}
            </label>
          ) : null}

          {topicBacklinks.length > 0 && !isTopicDocument && !isLegacyTopicKnowledge ? (
            <div className="settings-panel__field">
              <span>反向引用 ({topicBacklinks.length})</span>
              <div className="settings-panel__linked-posts">
                {topicBacklinks.map((backlink, index) => (
                  <button
                    key={`${backlink.sourcePath}-${backlink.targetKey}-${backlink.excerpt}-${index}`}
                    type="button"
                    className="settings-panel__linked-post"
                    onClick={() => onOpenLinkedPost?.(backlink.sourcePost)}
                  >
                    <div className="settings-panel__linked-post-meta">
                      <strong>{backlink.sourceTitle}</strong>
                      <span>{getLinkedPostTypeLabel(backlink.sourceContentType)} · {backlink.sourceDate.slice(0, 10) || '无日期'}</span>
                    </div>
                    <p>{backlink.excerpt || '点击打开原文'}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          </MetadataSection> : null}
        </div>
      ) : null}

      {isReadLater && currentReadLaterTab === 'commentary' ? (
        <div className="settings-panel__section-stack settings-panel__section-stack--reader settings-panel__section-stack--commentary">
          <section className="settings-panel__document-note" aria-label="Document note 区域">
            <div className="settings-panel__document-note-header">
              <span className="settings-panel__document-note-label">Document note</span>
            </div>

            {isDocumentNoteEditing ? (
              <div className="settings-panel__document-note-editor settings-panel__document-note-editor--bare">
                <textarea
                  aria-label="Document note"
                  placeholder="写下关于本文的总结、评论或思考..."
                  value={documentNoteDraft}
                  onChange={(event) => setDocumentNoteDraft(event.target.value)}
                />
                <div className="settings-panel__document-note-actions">
                  <button
                    type="button"
                    aria-label="取消文档批注"
                    className="settings-panel__document-note-action"
                    onClick={handleCancelDocumentNote}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    aria-label="保存文档批注"
                    className="settings-panel__document-note-action settings-panel__document-note-action--primary"
                    onClick={handleSaveDocumentNote}
                  >
                    保存
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                aria-label="文档批注"
                className="settings-panel__document-note-entry settings-panel__document-note-entry--borderless settings-panel__document-note-entry--commentary"
                onClick={handleOpenDocumentNoteEditor}
              >
                {renderDocumentNoteValue(currentDocumentNote, '写下这篇的总结或思考…')}
              </button>
            )}
          </section>

          <section className="settings-panel__annotation-group" aria-label="划线摘录">
            <div className="settings-panel__document-note-header">
              <span className="settings-panel__document-note-label">划线摘录</span>
            </div>

            {annotations.length > 0 ? (
              <div className="settings-panel__annotation-list">
                {annotations.map((annotation, index) => {
                  const isActive = annotation.id === activeAnnotationId
                  const isEditing = annotation.id === editingAnnotationId
                  const notePreview = getAnnotationNotePreview(annotation)

                  return (
                    <article
                      key={annotation.id}
                      className={`settings-panel__annotation-card${isActive ? ' is-active' : ''}`}
                    >
                      {index > 0 ? (
                        <span className="settings-panel__annotation-separator" aria-hidden="true">
                          ——
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="settings-panel__annotation-card-trigger"
                        aria-label={getAnnotationPreviewText(annotation)}
                        onClick={() => onSelectAnnotation?.(annotation.id)}
                      >
                        <span className="settings-panel__annotation-quote">
                          {getAnnotationPreviewText(annotation)}
                        </span>
                        {!isActive && notePreview ? (
                          <span className="settings-panel__annotation-note-preview">
                            {notePreview}
                          </span>
                        ) : null}
                      </button>

                      {isActive ? (
                        <div className="settings-panel__annotation-note-block">
                          <div className="settings-panel__annotation-note-header">
                            <span className="settings-panel__annotation-note-label">文档批注</span>
                          </div>
                          {isEditing ? (
                            <div className="settings-panel__document-note-editor settings-panel__document-note-editor--bare settings-panel__document-note-editor--annotation">
                              <textarea
                                aria-label="划线文档批注"
                                placeholder="为这条划线添加批注..."
                                value={currentAnnotationNoteDraft}
                                onChange={(event) => {
                                  setInternalAnnotationNoteDraft(event.target.value)
                                  onAnnotationNoteDraftChange?.(event.target.value)
                                }}
                              />
                              <div className="settings-panel__document-note-actions">
                                <button
                                  type="button"
                                  className="settings-panel__document-note-action"
                                  onClick={handleCancelAnnotation}
                                >
                                  取消
                                </button>
                                <button
                                  type="button"
                                  className="settings-panel__document-note-action settings-panel__document-note-action--primary"
                                  onClick={handleSaveAnnotation}
                                >
                                  保存
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              aria-label="划线文档批注"
                              className="settings-panel__document-note-entry settings-panel__document-note-entry--borderless settings-panel__annotation-note-entry"
                              onClick={() => onEditAnnotation?.(annotation.id)}
                            >
                              {renderDocumentNoteValue(annotation.note, '为这条划线写下想法…')}
                            </button>
                          )}
                        </div>
                      ) : null}

                      {isActive && onQuoteAnnotationToDiary ? (
                        <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="settings-panel__annotation-quote-diary-button"
                            onClick={(event) => {
                              event.stopPropagation()
                              onQuoteAnnotationToDiary(annotation)
                            }}
                          >
                            引用到今日日记
                          </button>
                        </div>
                      ) : null}
                    </article>
                  )
                })}
              </div>
            ) : (
              <p className="settings-panel__annotation-empty">选中文本后可在这里查看高亮和批注。</p>
            )}
          </section>
        </div>
      ) : null}
    </aside>
  )
}
