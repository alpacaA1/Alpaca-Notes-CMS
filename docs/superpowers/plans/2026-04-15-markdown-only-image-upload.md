# Markdown-Only Image Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the visual editor, keep only Markdown + preview, and let authors insert repo-backed images through upload or clipboard paste inside the Markdown editor.

**Architecture:** Collapse editor state to `markdown | preview` in `App.tsx` and `useEditorDocument`, then route all body edits through `MarkdownEditor`. Add one small pure helper module for image filename/path/markdown generation, extend `github-client.ts` with binary image upload, and let `PreviewPane` render images through a current-session URL override map so newly uploaded images preview immediately without waiting for a site rebuild.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, GitHub Contents API, Hexo-compatible Markdown/frontmatter.

---

## Implementation context

- **Spec:** `docs/superpowers/specs/2026-04-15-markdown-only-image-upload-design.md`
- **Repo root:** `/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io`
- **Recommended isolation:** use a dedicated git worktree if you want to keep the current workspace untouched; if you execute inline for speed, use the repo root above exactly as written in the commands below.
- **Execution discipline:** write the tests first, verify command output before claiming success, and request code review before merging.
- **Keep unchanged:** frontmatter schema, article save contract, auth/session model, preview toggle placement, publish-lock behavior.
- **Accept in v1:** orphaned uploaded images if the draft is abandoned after upload.
- **Build outputs:** `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" build` regenerates tracked files under `source/admin/index.html` and `source/admin/assets/*`; verify those diffs after the build and include the changed bundle files in final staging if they changed.

## File structure and responsibilities

### Existing files to modify
- `admin-app/src/app/App.tsx` — collapse the editor to markdown/preview only, own upload error handling, and maintain the current-session preview image URL map.
- `admin-app/src/app/editor/use-editor-document.ts` — reduce editor mode state to `markdown | preview` and remove rich-only flags.
- `admin-app/src/app/editor/use-editor-document.test.ts` — lock the simplified editor-mode behavior.
- `admin-app/src/app/editor/markdown-editor.tsx` — add the upload button, hidden file input, paste-image handling, and temporary disabled state during upload.
- `admin-app/src/app/editor/markdown-editor.test.tsx` — cover button upload, cancel, paste-image, non-image paste fallback, and in-flight disabled state.
- `admin-app/src/app/editor/preview-pane.tsx` — render Markdown images safely and prefer current-session preview override URLs when available.
- `admin-app/src/app/github-client.ts` — upload image bytes to the GitHub contents API.
- `admin-app/src/app/github-client.test.ts` — cover binary image upload and auth/error handling.
- `admin-app/src/app/App.editor-modes.test.tsx` — lock markdown-only open/preview/return behavior.
- `admin-app/src/app/App.preview.test.tsx` — lock preview image rendering and unsafe image URL rejection.
- `admin-app/src/app/App.save-flow.test.tsx` — update save flow assertions to use `Markdown 编辑器` rather than the removed visual editor.
- `admin-app/src/styles/app.css` — add the Markdown upload affordance styling and preview image styling; prune dead rich-editor/unsupported-banner selectors once the feature is green.

### New files to create
- `admin-app/src/app/editor/image-upload.ts` — pure helpers for allowed MIME types, max-size validation, filename sanitization, repo/public path generation, and Markdown image string generation.
- `admin-app/src/app/editor/image-upload.test.ts` — unit tests for filename/path/validation behavior.
- `admin-app/src/app/App.image-upload.test.tsx` — integration tests for app-level upload success, upload failure, auth expiry during upload, and same-session preview mapping.

### Files to delete after the new flow is green
- `admin-app/src/app/editor/rich-editor.tsx`
- `admin-app/src/app/editor/rich-editor.test.tsx`
- `admin-app/src/app/editor/rich-markdown.ts`
- `admin-app/src/app/editor/rich-markdown.test.ts`
- `admin-app/src/app/editor/unsupported-banner.tsx`

### Notes for implementers
- Keep the implementation DRY and local: do **not** build a general toolbar framework.
- Do **not** auto-save the article when an image uploads successfully; only insert Markdown into the draft.
- Prefer `File.arrayBuffer()` over `FileReader` for predictable testing.
- Keep current-session preview image overrides in memory only; clear and revoke them when the active document changes or the app unmounts.
- Do not spend time on drag-and-drop, resizing, image compression, or batch upload in this plan.

## Task 1: Collapse the editor to Markdown + preview only

**Files:**
- Modify: `admin-app/src/app/App.tsx`
- Modify: `admin-app/src/app/editor/use-editor-document.ts`
- Modify: `admin-app/src/app/editor/use-editor-document.test.ts`
- Modify: `admin-app/src/app/App.editor-modes.test.tsx`
- Modify: `admin-app/src/app/App.preview.test.tsx`
- Modify: `admin-app/src/app/App.save-flow.test.tsx`

- [ ] **Step 1: Write the failing markdown-only mode tests**

Update `admin-app/src/app/editor/use-editor-document.test.ts` so it no longer allows a `rich` mode branch and instead locks `markdown`/`preview` only:

```ts
act(() => {
  result.current.setMode('preview')
})

expect(result.current.mode).toBe('preview')

act(() => {
  result.current.replaceDocument(createExistingPost())
})

expect(result.current.mode).toBe('markdown')
```

Update `admin-app/src/app/App.editor-modes.test.tsx` and `admin-app/src/app/App.preview.test.tsx` so opening a post lands directly in `Markdown 编辑器` and leaving preview always returns to `Markdown 编辑器`:

```tsx
fireEvent.click(screen.getByRole('button', { name: /supported post/i }))
expect(await screen.findByLabelText('Markdown 编辑器')).toBeTruthy()
expect(screen.queryByRole('button', { name: '可视编辑' })).toBeNull()
```

Update `admin-app/src/app/App.save-flow.test.tsx` to stop using `可视编辑器`, `段落内容`, and other rich-editor labels. Edit the whole body through `Markdown 编辑器` instead:

```tsx
const markdownEditor = (await screen.findByLabelText('Markdown 编辑器')) as HTMLTextAreaElement
fireEvent.change(markdownEditor, { target: { value: 'Original body.\n\nChanged body' } })
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/editor/use-editor-document.test.ts src/app/App.editor-modes.test.tsx src/app/App.preview.test.tsx src/app/App.save-flow.test.tsx`

Expected: FAIL because `App.tsx` still imports and renders the rich editor flow and the mode union still includes `rich`.

- [ ] **Step 3: Implement the minimal markdown-only mode collapse**

In `admin-app/src/app/editor/use-editor-document.ts`, reduce the mode union to two states only:

```ts
export type EditorMode = 'markdown' | 'preview'
```

In `admin-app/src/app/App.tsx`:
- remove imports for `RichEditor`, `UnsupportedBanner`, and `rich-markdown` helpers
- remove `lastEditorMode`, `unsupportedMessage`, `hasUnsupportedRichContent`, `detectRichMarkdownSupport`, and `handleSelectMode`
- make `applyDocument()` always set `markdown`
- make `handleTogglePreview()` switch between `markdown` and `preview`
- make `handleEditorChange()` always call `updateBody(value)`
- remove the editor-mode switcher from the document frame
- render only `MarkdownEditor` or `PreviewPane`

Target shape:

```tsx
const handleTogglePreview = () => {
  if (!document) {
    return
  }

  setMode(mode === 'preview' ? 'markdown' : 'preview')
}

{mode === 'preview' ? (
  <PreviewPane title={document.frontmatter.title} date={document.frontmatter.date} markdown={document.body} />
) : (
  <MarkdownEditor value={document.body} onChange={handleEditorChange} />
)}
```

- [ ] **Step 4: Re-run the targeted tests to verify the markdown-only flow passes**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/editor/use-editor-document.test.ts src/app/App.editor-modes.test.tsx src/app/App.preview.test.tsx src/app/App.save-flow.test.tsx`

Expected: PASS

- [ ] **Step 5: Optional checkpoint commit (only if the user explicitly asks for a commit)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" add admin-app/src/app/App.tsx admin-app/src/app/editor/use-editor-document.ts admin-app/src/app/editor/use-editor-document.test.ts admin-app/src/app/App.editor-modes.test.tsx admin-app/src/app/App.preview.test.tsx admin-app/src/app/App.save-flow.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" commit -m "refactor: simplify admin editor to markdown only"
```

## Task 2: Add image upload helpers and GitHub binary upload support

**Files:**
- Create: `admin-app/src/app/editor/image-upload.ts`
- Test: `admin-app/src/app/editor/image-upload.test.ts`
- Modify: `admin-app/src/app/github-client.ts`
- Modify: `admin-app/src/app/github-client.test.ts`

- [ ] **Step 1: Write the failing helper and client tests**

Create `admin-app/src/app/editor/image-upload.test.ts` with focused pure-helper coverage:

```ts
const file = new File(['img'], '', { type: 'image/png' })
const result = buildImageUploadDescriptor(file, new Date('2026-04-15T08:09:10.000Z'))

expect(result.repoPath).toBe('source/images/2026/04/1744704550000-pasted-image.png')
expect(result.publicUrl).toBe('/images/2026/04/1744704550000-pasted-image.png')
expect(result.defaultAlt).toBe('pasted-image')
```

Add a validation test:

```ts
const invalid = new File(['x'], 'vector.svg', { type: 'image/svg+xml' })
expect(validateImageFile(invalid)).toEqual({ ok: false, message: '仅支持 PNG、JPG、WEBP 或 GIF 图片。' })
```

Extend `admin-app/src/app/github-client.test.ts` with image upload coverage:

```ts
const file = new File([Uint8Array.from([137, 80, 78, 71])], 'cover.png', { type: 'image/png' })
await uploadImageFile({ token: 'token' }, { path: 'source/images/2026/04/1-cover.png', file })
expect(fetch).toHaveBeenCalledWith(
  expect.stringContaining('/contents/source/images/2026/04/1-cover.png'),
  expect.objectContaining({ method: 'PUT' }),
)
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/editor/image-upload.test.ts src/app/github-client.test.ts`

Expected: FAIL because the helper module and `uploadImageFile()` do not exist yet.

- [ ] **Step 3: Write the minimal pure image-upload helper module**

In `admin-app/src/app/editor/image-upload.ts`, add:
- allowed MIME type list
- `MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024`
- filename sanitization
- fallback basename `pasted-image`
- MIME-to-extension mapping
- repo/public path generation
- Markdown string generation

Target shape:

```ts
export function buildImageUploadDescriptor(file: File, now = new Date()) {
  return {
    repoPath,
    publicUrl,
    defaultAlt,
  }
}

export function buildImageMarkdown(defaultAlt: string, publicUrl: string) {
  return `![${defaultAlt}](${publicUrl})`
}
```

- [ ] **Step 4: Extend `github-client.ts` with binary image upload**

Add `uploadImageFile()` to `admin-app/src/app/github-client.ts`:

```ts
export async function uploadImageFile(
  session: SessionState,
  upload: { path: string; file: File },
): Promise<{ path: string; sha: string }> {
  const bytes = new Uint8Array(await upload.file.arrayBuffer())
  const response = await requestGitHub<GitHubSaveFileResponse>(session, apiPath, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Create ${upload.path}`,
      content: encodeBytesBase64(bytes),
      branch: REPO_BRANCH,
    }),
  })
  ...
}
```

Reuse the existing auth/conflict handling style.

- [ ] **Step 5: Run the helper/client tests again**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/editor/image-upload.test.ts src/app/github-client.test.ts`

Expected: PASS

- [ ] **Step 6: Optional checkpoint commit (only if the user explicitly asks for a commit)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" add admin-app/src/app/editor/image-upload.ts admin-app/src/app/editor/image-upload.test.ts admin-app/src/app/github-client.ts admin-app/src/app/github-client.test.ts
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" commit -m "feat: add admin image upload helpers"
```

## Task 3: Add upload-button and paste-image handling to the Markdown editor

**Files:**
- Modify: `admin-app/src/app/editor/markdown-editor.tsx`
- Modify: `admin-app/src/app/editor/markdown-editor.test.tsx`
- Modify: `admin-app/src/styles/app.css`

- [ ] **Step 1: Write the failing Markdown editor upload tests**

Extend `admin-app/src/app/editor/markdown-editor.test.tsx` so the component accepts an async upload callback and covers the new editor-local behavior.

Add a button-upload test that proves insertion uses the selection captured before the file picker opens:

```tsx
const file = new File(['img'], 'cover.png', { type: 'image/png' })
const onUploadImage = vi.fn().mockResolvedValue({ markdown: '![cover](/images/2026/04/1-cover.png)' })
render(<Harness initialValue="Hello world" onUploadImage={onUploadImage} />)

const editor = screen.getByLabelText('Markdown 编辑器') as HTMLTextAreaElement
editor.focus()
editor.setSelectionRange(5, 5)
fireEvent.click(screen.getByRole('button', { name: '上传图片' }))
editor.setSelectionRange(11, 11)
fireEvent.change(screen.getByLabelText('上传图片文件'), { target: { files: [file] } })

await waitFor(() => {
  expect(editor.value).toBe('Hello![cover](/images/2026/04/1-cover.png) world')
})
```

Add a cancel/no-op test and an in-flight disabled test:

```tsx
expect(screen.getByRole('button', { name: '上传图片' })).not.toBeDisabled()
fireEvent.change(screen.getByLabelText('上传图片文件'), { target: { files: [] } })
expect(editor.value).toBe('Hello')
```

```tsx
const deferred = createDeferredPromise<{ markdown: string }>()
const onUploadImage = vi.fn().mockReturnValue(deferred.promise)
...
expect(screen.getByRole('button', { name: '上传图片' })).toBeDisabled()
expect(screen.getByLabelText('Markdown 编辑器')).toBeDisabled()
deferred.resolve({ markdown: '![cover](/images/2026/04/1-cover.png)' })
```

Add a paste-image-wins test:

```tsx
fireEvent.paste(editor, {
  clipboardData: {
    items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
    getData: () => 'ignored text',
  },
})
await waitFor(() => expect(onUploadImage).toHaveBeenCalledWith(file))
expect(editor.value).toContain('![cover](/images/2026/04/1-cover.png)')
```

- [ ] **Step 2: Run the Markdown editor tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/editor/markdown-editor.test.tsx`

Expected: FAIL because `MarkdownEditor` has no upload button, no file input, and no image-aware paste path.

- [ ] **Step 3: Implement the minimal async upload flow inside `MarkdownEditor`**

Extend `admin-app/src/app/editor/markdown-editor.tsx` with:
- optional `onUploadImage?: (file: File) => Promise<{ markdown: string }>` prop
- hidden file input with `aria-label="上传图片文件"`
- visible `上传图片` button near the existing label/hint
- local `isUploadingImage` state
- captured selection range before opening the file picker
- async insert path that calls `applyValue()` only after the callback resolves
- image-aware paste handling before the existing text normalization path

Target shape:

```tsx
type MarkdownEditorProps = {
  value: string
  onChange: (value: string) => void
  onUploadImage?: (file: File) => Promise<{ markdown: string }>
}

const [isUploadingImage, setIsUploadingImage] = useState(false)
```

Important rules:
- if `files` is empty, do nothing
- if upload rejects, do not change the editor value
- if the paste contains no valid image file, keep the current text paste normalization path exactly as-is

- [ ] **Step 4: Add the minimal upload affordance styling**

In `admin-app/src/styles/app.css`, add only the selectors needed for the Markdown editor upload row:
- `.editor-surface__header`
- `.editor-surface__actions`
- `.editor-surface__upload`

Keep the styling modest and consistent with the existing editor surface.

- [ ] **Step 5: Run the Markdown editor tests again**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/editor/markdown-editor.test.tsx`

Expected: PASS

- [ ] **Step 6: Optional checkpoint commit (only if the user explicitly asks for a commit)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" add admin-app/src/app/editor/markdown-editor.tsx admin-app/src/app/editor/markdown-editor.test.tsx admin-app/src/styles/app.css
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" commit -m "feat: add markdown image insertion controls"
```

## Task 4: Wire app-level upload handling and preview image rendering

**Files:**
- Modify: `admin-app/src/app/App.tsx`
- Modify: `admin-app/src/app/editor/preview-pane.tsx`
- Modify: `admin-app/src/app/App.preview.test.tsx`
- Create: `admin-app/src/app/App.image-upload.test.tsx`

- [ ] **Step 1: Write the failing app integration tests**

Create `admin-app/src/app/App.image-upload.test.tsx` with five integration tests.

1. Successful upload inserts Markdown and previews immediately via the temporary URL map:

```tsx
vi.spyOn(global.URL, 'createObjectURL').mockReturnValue('blob:preview-image')
vi.spyOn(githubClientModule, 'uploadImageFile').mockResolvedValue({
  path: 'source/images/2026/04/1-cover.png',
  sha: 'sha-image',
})

fireEvent.click(screen.getByRole('button', { name: /post title/i }))
fireEvent.change(screen.getByLabelText('上传图片文件'), { target: { files: [file] } })

const editor = (await screen.findByLabelText('Markdown 编辑器')) as HTMLTextAreaElement
expect(editor.value).toContain('![cover](/images/2026/04/1-cover.png)')

fireEvent.click(screen.getByRole('button', { name: '预览' }))
const image = await screen.findByRole('img', { name: 'cover' })
expect(image.getAttribute('src')).toBe('blob:preview-image')
```

2. Unsupported file type surfaces an error and leaves the draft unchanged.
3. File larger than 10 MB surfaces an error and leaves the draft unchanged.
4. Upload failure surfaces an error and leaves the draft unchanged.
5. Auth expiry during upload logs the user out and returns to the login gate.

Also extend `admin-app/src/app/App.preview.test.tsx` with preview regressions for both unsafe URLs and inline image rendering:

```tsx
const inlineImageContent = `${frontmatter}\n\nBefore ![cover](/images/2026/04/1-cover.png) after`
...
expect(await screen.findByText('Before')).toBeTruthy()
expect(screen.getByRole('img', { name: 'cover' })).toBeTruthy()
expect(screen.getByText('after')).toBeTruthy()
```

```tsx
const unsafeImageContent = `${frontmatter}\n\n![bad](javascript:alert(1))`
...
expect(screen.queryByRole('img', { name: 'bad' })).toBeNull()
```

- [ ] **Step 2: Run the targeted integration tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/App.preview.test.tsx src/app/App.image-upload.test.tsx`

Expected: FAIL because `App.tsx` does not yet pass an upload callback into `MarkdownEditor` and `PreviewPane` does not render images.

- [ ] **Step 3: Implement the app-level upload callback and preview URL map**

In `admin-app/src/app/App.tsx`:
- add state for current-session preview overrides, e.g. `Record<string, string>`
- revoke and clear those object URLs when the active document changes, the user logs out, or the component unmounts
- implement `handleUploadImage(file)` by combining `validateImageFile()` / `buildImageUploadDescriptor()` with `uploadImageFile(session, ...)`
- create the temporary object URL on success and store it by the final `/images/...` public URL
- return `{ markdown }` to `MarkdownEditor`
- on `GitHubAuthError`, reuse `handleAuthExpiry()` and rethrow so the editor leaves the body unchanged
- on any other upload error, set `error` and rethrow

Target shape:

```tsx
const handleUploadImage = async (file: File) => {
  if (!session) {
    throw new Error('GitHub 会话已过期，请重新登录。')
  }

  const descriptor = buildImageUploadDescriptor(file)
  await uploadImageFile(session, { path: descriptor.repoPath, file })
  const objectUrl = URL.createObjectURL(file)
  setPreviewImageUrls((current) => ({ ...current, [descriptor.publicUrl]: objectUrl }))
  return { markdown: buildImageMarkdown(descriptor.defaultAlt, descriptor.publicUrl) }
}
```

Pass the callback into `MarkdownEditor` and the preview URL map into `PreviewPane`.

- [ ] **Step 4: Implement safe Markdown image rendering in `PreviewPane`**

In `admin-app/src/app/editor/preview-pane.tsx`:
- add a prop for the current-session preview overrides, e.g. `previewImageUrls?: Record<string, string>`
- extend the inline Markdown tokenization/rendering path so standard `![alt](url)` syntax works even when the image appears mid-line or adjacent to text
- if the original URL exists in the override map, render `<img src={override}>`
- otherwise sanitize the original URL and render the final site URL only when it is safe
- keep the existing link sanitization logic intact for normal links

Target shape:

```tsx
type PreviewPaneProps = {
  title: string
  date: string
  markdown: string
  previewImageUrls?: Record<string, string>
}
```

And inside the renderer:

```tsx
const overrideSrc = previewImageUrls?.[imageUrl]
const safeSrc = overrideSrc ?? sanitizeImageSrc(imageUrl)
if (safeSrc) {
  nodes.push(<img key={`image-${nodes.length}`} src={safeSrc} alt={altText} />)
}
```

- [ ] **Step 5: Run the targeted integration tests again**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/App.preview.test.tsx src/app/App.image-upload.test.tsx`

Expected: PASS

- [ ] **Step 6: Optional checkpoint commit (only if the user explicitly asks for a commit)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" add admin-app/src/app/App.tsx admin-app/src/app/editor/preview-pane.tsx admin-app/src/app/App.preview.test.tsx admin-app/src/app/App.image-upload.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" commit -m "feat: preview uploaded markdown images"
```

## Task 5: Prune dead rich-editor code and run final verification

**Files:**
- Delete: `admin-app/src/app/editor/rich-editor.tsx`
- Delete: `admin-app/src/app/editor/rich-editor.test.tsx`
- Delete: `admin-app/src/app/editor/rich-markdown.ts`
- Delete: `admin-app/src/app/editor/rich-markdown.test.ts`
- Delete: `admin-app/src/app/editor/unsupported-banner.tsx`
- Modify: `admin-app/src/styles/app.css`

- [ ] **Step 1: Remove the dead rich-editor files and unused CSS selectors**

Delete the five dead files listed above.

Then remove now-unused `.rich-editor*` and `.unsupported-banner*` blocks from `admin-app/src/styles/app.css`, while keeping the new Markdown upload selectors and the existing preview selectors intact.

- [ ] **Step 2: Run the focused verification suite**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/editor/use-editor-document.test.ts src/app/editor/image-upload.test.ts src/app/editor/markdown-editor.test.tsx src/app/github-client.test.ts src/app/App.editor-modes.test.tsx src/app/App.preview.test.tsx src/app/App.image-upload.test.tsx src/app/App.save-flow.test.tsx src/app/layout/post-list-pane.test.tsx`

Expected: PASS

- [ ] **Step 3: Run the full admin-app test suite and production build**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test && npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" build`

Expected:
- all Vitest tests PASS
- Vite build completes successfully and regenerates the admin bundle

- [ ] **Step 4: Optional checkpoint commit (only if the user explicitly asks for a commit)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" add admin-app/src/app/App.tsx admin-app/src/app/editor/use-editor-document.ts admin-app/src/app/editor/use-editor-document.test.ts admin-app/src/app/editor/image-upload.ts admin-app/src/app/editor/image-upload.test.ts admin-app/src/app/editor/markdown-editor.tsx admin-app/src/app/editor/markdown-editor.test.tsx admin-app/src/app/editor/preview-pane.tsx admin-app/src/app/github-client.ts admin-app/src/app/github-client.test.ts admin-app/src/app/App.editor-modes.test.tsx admin-app/src/app/App.preview.test.tsx admin-app/src/app/App.image-upload.test.tsx admin-app/src/app/App.save-flow.test.tsx admin-app/src/styles/app.css
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" commit -m "feat: add markdown editor image uploads"
```
