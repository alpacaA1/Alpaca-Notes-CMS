type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
}

export default function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  return (
    <label className="editor-surface">
      <span>Markdown</span>
      <textarea
        aria-label="Markdown editor"
        className="editor-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
