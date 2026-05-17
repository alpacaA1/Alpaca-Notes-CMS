import { useDeferredValue } from 'react'
import type { ResolvedContentFormat } from '../content-format'
import type { InternalReferenceCandidate } from '../internal-links'
import type { ContentType, KnowledgeSourceType } from '../posts/post-types'
import MarkdownEditor from './markdown-editor'
import PreviewPane from './preview-pane'

type EditableLiveContentType = Exclude<ContentType, 'read-later'>

type LiveMarkdownEditorProps = {
  value: string
  previewMarkdown: string
  title: string
  date: string
  contentType: EditableLiveContentType
  contentFormat?: ResolvedContentFormat
  sourceType?: KnowledgeSourceType
  sourceTitle?: string
  sourcePath?: string
  sourceUrl?: string
  previewImageUrls?: Record<string, string>
  onChange: (value: string) => void
  onToggleImmersive?: () => void
  isImmersive?: boolean
  onUploadImage?: (file: File) => Promise<{ markdown: string }>
  internalReferenceCandidates?: InternalReferenceCandidate[]
  resolveWikiLinkTitle?: (targetKey: string) => string | null
  onOpenWikiLink?: (targetKey: string) => void
  resolveInternalReferenceTitle?: (targetKey: string) => string | null
  onOpenInternalReference?: (targetKey: string) => void
}

export default function LiveMarkdownEditor({
  value,
  previewMarkdown,
  title,
  date,
  contentType,
  contentFormat,
  sourceType,
  sourceTitle,
  sourcePath,
  sourceUrl,
  previewImageUrls,
  onChange,
  onToggleImmersive,
  isImmersive = false,
  onUploadImage,
  internalReferenceCandidates = [],
  resolveWikiLinkTitle,
  onOpenWikiLink,
  resolveInternalReferenceTitle,
  onOpenInternalReference,
}: LiveMarkdownEditorProps) {
  const deferredPreviewMarkdown = useDeferredValue(previewMarkdown)
  const hasPreviewContent = deferredPreviewMarkdown.trim().length > 0

  return (
    <MarkdownEditor
      value={value}
      onChange={onChange}
      onToggleImmersive={onToggleImmersive}
      isImmersive={isImmersive}
      onUploadImage={onUploadImage}
      internalReferenceCandidates={internalReferenceCandidates}
      label="实时写作"
      hint="正文仍以 Markdown 保存；下方同步渲染，复杂排版可用顶部预览兜底。"
      surfaceClassName="editor-surface--live-editor"
      textareaClassName="editor-textarea--live-editor"
      footer={(
        <section className="live-markdown-editor__preview" aria-label="实时预览">
          <div className="live-markdown-editor__preview-header">
            <div className="live-markdown-editor__preview-title-group">
              <strong>实时预览</strong>
              <span>当前正文的即时渲染效果</span>
            </div>
            <span className="live-markdown-editor__preview-badge">Live</span>
          </div>
          {hasPreviewContent ? (
            <PreviewPane
              title={title}
              date={date}
              markdown={deferredPreviewMarkdown}
              contentFormat={contentFormat}
              sourceType={sourceType}
              sourceTitle={sourceTitle}
              sourcePath={sourcePath}
              sourceUrl={sourceUrl}
              contentType={contentType}
              previewImageUrls={previewImageUrls}
              resolveWikiLinkTitle={resolveWikiLinkTitle}
              onOpenWikiLink={onOpenWikiLink}
              resolveInternalReferenceTitle={resolveInternalReferenceTitle}
              onOpenInternalReference={onOpenInternalReference}
              displayMode="live"
            />
          ) : (
            <div className="live-markdown-editor__preview-empty">
              <p>开始输入后，这里会同步显示标题、列表、引用、代码块、图片和链接效果。</p>
            </div>
          )}
        </section>
      )}
    />
  )
}
