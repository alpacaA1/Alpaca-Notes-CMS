type RichEditorProps = {
  value: string
  onChange: (value: string) => void
}

export default function RichEditor({ value, onChange }: RichEditorProps) {
  return (
    <label className="editor-surface editor-surface--editor-canvas">
      <span className="editor-surface__label">可视编辑</span>
      <span className="editor-surface__hint">适合处理受支持范围内的 Markdown 内容。</span>
      <textarea
        aria-label="可视编辑器"
        className="editor-textarea editor-textarea--editor-canvas"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
