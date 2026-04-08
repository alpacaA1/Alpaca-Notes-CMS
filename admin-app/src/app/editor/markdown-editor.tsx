type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
}

export default function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  return (
    <label className="editor-surface editor-surface--editor-canvas">
      <span className="editor-surface__label">Markdown 编辑</span>
      <span className="editor-surface__hint">适合精确保留旧语法、嵌入与原始结构。</span>
      <textarea
        aria-label="Markdown 编辑器"
        className="editor-textarea editor-textarea--editor-canvas"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
