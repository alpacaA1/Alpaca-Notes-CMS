import type { ParsedPost } from '../posts/parse-post'
import type { PostValidationErrors } from '../posts/post-types'

type SettingsPanelProps = {
  document: ParsedPost | null
  validationErrors: PostValidationErrors
  publishLocked: boolean
  onFieldChange: <K extends keyof ParsedPost['frontmatter']>(
    field: K,
    value: ParsedPost['frontmatter'][K],
  ) => void
}

function parseListValue(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export default function SettingsPanel({
  document,
  validationErrors,
  publishLocked,
  onFieldChange,
}: SettingsPanelProps) {
  if (!document) {
    return null
  }

  const { frontmatter } = document

  return (
    <aside className="settings-panel">
      <label>
        <span>Title</span>
        <input aria-label="Title" value={frontmatter.title} onChange={(event) => onFieldChange('title', event.target.value)} />
        {validationErrors.title ? <span className="error-message">{validationErrors.title}</span> : null}
      </label>

      <label>
        <span>Date</span>
        <input aria-label="Date" value={frontmatter.date} onChange={(event) => onFieldChange('date', event.target.value)} />
        {validationErrors.date ? <span className="error-message">{validationErrors.date}</span> : null}
      </label>

      <label>
        <span>Description</span>
        <textarea aria-label="Description" value={frontmatter.desc} onChange={(event) => onFieldChange('desc', event.target.value)} />
        {validationErrors.desc ? <span className="error-message">{validationErrors.desc}</span> : null}
      </label>

      <label>
        <span>Published</span>
        <input
          aria-label="Published"
          type="checkbox"
          checked={Boolean(frontmatter.published)}
          disabled={publishLocked}
          onChange={(event) => onFieldChange('published', event.target.checked)}
        />
      </label>

      <label>
        <span>Categories</span>
        <input
          aria-label="Categories"
          value={frontmatter.categories.join(', ')}
          onChange={(event) => onFieldChange('categories', parseListValue(event.target.value))}
        />
      </label>

      <label>
        <span>Tags</span>
        <input
          aria-label="Tags"
          value={frontmatter.tags.join(', ')}
          onChange={(event) => onFieldChange('tags', parseListValue(event.target.value))}
        />
      </label>

      <label>
        <span>Permalink</span>
        <input
          aria-label="Permalink"
          value={frontmatter.permalink || ''}
          placeholder="Leave empty for legacy posts"
          onChange={(event) => onFieldChange('permalink', event.target.value)}
        />
        {validationErrors.permalink ? <span className="error-message">{validationErrors.permalink}</span> : null}
      </label>
    </aside>
  )
}
