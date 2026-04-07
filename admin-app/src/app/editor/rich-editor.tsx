type RichEditorProps = {
  value: string
  onChange: (value: string) => void
}

export default function RichEditor({ value, onChange }: RichEditorProps) {
  return (
    <label className="editor-surface">
      <span>Rich editor</span>
      <textarea
        aria-label="Rich editor"
        className="editor-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
