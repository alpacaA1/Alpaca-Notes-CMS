# Markdown-Only Editor with Image Upload Design

**Date:** 2026-04-15
**Project:** `alpacaA1.github.io`
**Status:** Approved in conversation, pending written-spec review

## Goal

Simplify the admin editor to a single Markdown editing surface and add fast in-editor image insertion so posts can be written, illustrated, previewed, and saved without a separate visual editor.

This change is intentionally optimized for fast development, fast testing, and fast rollout.

## Approved product decisions

- Remove the visual editor entirely.
- Keep only two editor states: `markdown` and `preview`.
- Posts should open directly in Markdown editing mode.
- Keep the existing preview flow and save flow.
- v1 should support two image insertion paths inside the Markdown editor:
  1. click an upload button and choose a local image file
  2. paste an image from the clipboard directly into the editor
- v1 should **not** include drag-and-drop upload.
- Uploaded images should be committed into the repo and inserted into the article body as standard Markdown image syntax.
- Preview should render uploaded images as actual images, not as text or links.
- Current-session preview should render newly uploaded images immediately through a temporary local preview mapping, while the saved Markdown continues to use the final `/images/...` site URL.
- v1 explicitly accepts orphaned uploaded images when a draft is abandoned or a later article save fails; automated cleanup is out of scope for this rollout.

## Scope

### In scope
- Remove visual-editor mode selection and rich-markdown compatibility logic
- Keep Markdown editor and preview mode
- Add Markdown-editor image upload button
- Add Markdown-editor paste-image upload support
- Add GitHub image upload client support
- Insert uploaded image Markdown at the current caret position
- Render Markdown images in preview mode
- Update tests that currently depend on the visual editor

### Out of scope
- Drag-and-drop upload
- Batch multi-image upload
- Image resizing, cropping, compression, or format conversion
- Inline image caption UI beyond standard Markdown alt text
- Enabling Hexo `post_asset_folder`
- Migrating existing image URLs
- Building a new toolbar system beyond the upload affordance needed for this feature

## Existing surfaces affected

- app-level editor mode and document wiring in `admin-app/src/app/App.tsx`
- editor mode state in `admin-app/src/app/editor/use-editor-document.ts`
- Markdown editing interactions in `admin-app/src/app/editor/markdown-editor.tsx`
- GitHub file operations in `admin-app/src/app/github-client.ts`
- preview rendering in `admin-app/src/app/editor/preview-pane.tsx`
- mode- and save-related tests in `admin-app/src/app/*.test.tsx`

## Design

## 1. Editor architecture: markdown-first and preview-only

### Direction
The app should stop offering a separate visual-editing mode. The editor becomes a Markdown-first tool with preview as the only alternate view.

### Rules
- `EditorMode` should be reduced from `rich | markdown | preview` to `markdown | preview`.
- Opening a post should always land in Markdown mode.
- Leaving preview should always return to Markdown mode.
- The editor frame should stop rendering the mode switcher because there is no longer a second editing mode to choose from.
- Rich-markdown support detection, unsupported-content banners, rich-text conversion helpers, and visual-editor components should be removed from the active app flow.

### Outcome
This removes a large amount of branching from the editing surface and makes image upload a single-path feature instead of a dual-mode feature.

## 2. Repository storage contract for uploaded images

### Storage path
Uploaded images should be written to:

`source/images/YYYY/MM/<timestamp>-<sanitized-name>.<ext>`

Examples:
- `source/images/2026/04/1713181012345-cover.png`
- `source/images/2026/04/1713181012456-product-shot.webp`

### Inserted article URL
The Markdown inserted into the editor should use the public site path:

`/images/YYYY/MM/<timestamp>-<sanitized-name>.<ext>`

Example:

`![cover](/images/2026/04/1713181012345-cover.png)`

### Naming rules
- Keep the original file extension when it is allowed.
- Sanitize the base filename into a URL-safe slug.
- Prefix with a timestamp so uploads do not collide during fast iteration.
- If the selected or pasted file has no usable name, use `pasted-image` as the fallback base filename.
- If the extension is missing, derive it from the MIME type using: `png`, `jpg`, `webp`, or `gif`.

### File rules
Allowed image types in v1:
- `image/png`
- `image/jpeg`
- `image/webp`
- `image/gif`

Rejected files should show an error and should not modify the editor body.

### Size rule
Use a simple client-side maximum file size of **10 MB** in v1. Larger files should be rejected before upload.

## 3. Upload flow from the Markdown editor button

### UI
The Markdown editor should gain a small upload affordance near the existing editor label/hint area. It can be implemented with:
- a visible `上传图片` button
- a hidden file input wired to that button

This keeps the feature close to the editing surface instead of burying it in the top bar.

### Flow
1. user clicks `上传图片`
2. the editor captures the current selection range before the file picker opens
3. user selects a local image file
4. client validates type and size
5. client uploads the image to GitHub
6. on success, the editor inserts Markdown image syntax at the originally captured selection
7. the caret moves to the end of the inserted Markdown
8. body dirty state updates normally through the existing editor change flow

### In-flight behavior
- While upload is in progress, the Markdown textarea and upload button should both be temporarily disabled.
- v1 uses the originally captured selection and does not attempt concurrent typing while the upload is in flight.

### Inserted Markdown contract
On success, the editor inserts:

`![<default-alt>](<public-url>)`

Default alt text should use the sanitized filename without the extension. When the upload comes from a clipboard image without a useful filename, the default alt text should use `pasted-image`. Users can edit the alt text manually in Markdown after insertion.

### Failure behavior
- If selection is canceled, do nothing.
- If validation fails, show an error and keep the body unchanged.
- If upload fails, show an error and keep the body unchanged.
- While upload is in progress, the upload button should be temporarily disabled to avoid duplicate submissions from repeated clicks.

## 4. Paste-image flow inside the Markdown editor

### Direction
Pasting an image into the Markdown editor should feel like a shortcut for the same upload pipeline.

### Rules
- Inspect `clipboardData.items` before falling back to text paste behavior.
- If the clipboard contains an allowed image file, prevent the default paste, upload the image, and insert Markdown image syntax at the current selection.
- If the clipboard does not contain an image file, keep the current text normalization and insertion behavior unchanged.
- If image upload fails, keep the document body unchanged and surface the error.

### Non-goals
- Do not try to parse pasted rich HTML for remote images in v1.
- Do not upload both text and image contents from the same paste event in v1; image wins when a valid image file is present.

## 5. GitHub upload client

### Direction
The existing GitHub contents client should be extended with a dedicated image-upload path instead of overloading the article save function.

### Required behavior
- Read the selected/pasted `File` as base64 in the browser
- PUT the file to the GitHub contents API under the generated `source/images/...` path
- Reuse the existing auth and API error handling style
- Return both the repo path and the public URL needed by the editor insertion logic

### Boundaries
- Image upload should be a separate helper from article save
- Article save remains responsible only for Markdown files
- Uploading an image should not auto-save the article; it only inserts Markdown into the current draft

## 6. Preview rendering

### Direction
Preview mode should render Markdown images as actual images inside the reading canvas.

### Rules
- Recognize standard inline Markdown image syntax: `![alt](url)`
- Render an `<img>` with the provided alt text
- Allow safe relative URLs and `http` / `https` URLs
- Reject unsafe protocols in preview rendering, consistent with the current link-sanitizing posture
- Keep existing preview behavior for headings, paragraphs, lists, blockquotes, code blocks, and links

### Current-session preview contract
- Saved Markdown should still contain the final site URL form: `/images/YYYY/MM/...`.
- Because the preview renderer is client-side and the static site may not have rebuilt yet, the app should keep an in-memory map from the inserted site URL to a temporary object URL for the current session.
- Preview should prefer that temporary object URL when rendering a newly uploaded image in the same editing session.
- After reload or reopening the document, preview falls back to the saved Markdown URL and depends on the normal site build/output path.

### Expected result
After uploading or pasting an image, the user can switch to preview and immediately confirm the image appears correctly in the current session.

## 7. Error handling and status behavior

### Errors to surface
- unsupported file type
- file too large
- upload failed
- auth expired during upload
- GitHub conflict or unexpected API failure

### UI behavior
- Upload errors should appear in the same general error surface already used by the app.
- Failed uploads must not insert partial Markdown.
- Existing save success behavior should remain unchanged.
- Uploading an image counts as an unsaved edit once Markdown has been inserted successfully.

## 8. Testing strategy

### Update existing tests
- Replace visual-editor-dependent app tests with markdown-only expectations.
- Update save-flow tests to open and edit through `Markdown 编辑器` instead of `可视编辑器`.

### Add targeted tests
- Markdown editor inserts uploaded image Markdown from button selection.
- Markdown editor does nothing when the file picker is canceled.
- Markdown editor disables the textarea and upload button while an image upload is in flight.
- Markdown editor uploads pasted image content and inserts Markdown at the caret.
- When the clipboard contains both image and text, image upload wins in v1.
- Non-image paste still uses the current text normalization flow.
- Invalid file type and oversized file show errors and do not change the body.
- Auth expiry during upload surfaces the existing session-expired flow.
- Upload API failures do not change the body.
- Preview renders uploaded image Markdown as an actual image element and rejects unsafe image URLs.
- App opens posts in Markdown mode and returns to Markdown mode after leaving preview.

### Keep test scope tight
Favor focused unit/integration tests around the Markdown editor and app flow rather than rebuilding a broad editor-mode matrix that will no longer exist.

## Recommended implementation order

1. Remove visual-editor mode from app state and UI
2. Add GitHub image upload helper and path generation rules
3. Add `上传图片` button flow in the Markdown editor
4. Add paste-image upload flow in the Markdown editor
5. Update preview to render Markdown images correctly
6. Rewrite mode-related tests and add focused image-upload tests

## Acceptance criteria

- The app no longer exposes `可视编辑` mode.
- Opening a post lands in `Markdown 编辑器`.
- Clicking `上传图片` lets the user upload an allowed local image and inserts standard Markdown image syntax at the originally captured caret/selection.
- Canceling the file picker leaves the draft unchanged.
- Pasting an allowed image into the Markdown editor uploads it and inserts standard Markdown image syntax at the caret.
- When a paste event contains both image data and text, the image upload path wins in v1.
- Non-image paste behavior continues to work as it does today.
- Uploaded image paths are stored in the repo under `source/images/YYYY/MM/...`.
- Inserted Markdown uses `/images/YYYY/MM/...` public URLs.
- Clipboard images without filenames use the `pasted-image` fallback basename and derived extension.
- Failed uploads do not modify the draft body.
- The textarea and upload button are disabled while an upload is in flight.
- Preview renders Markdown images as actual images.
- Newly uploaded images render immediately in preview during the current session through the temporary preview mapping.
- Save flow continues to work with uploaded-image Markdown in the article body.
- Orphaned uploaded images are an accepted v1 trade-off for faster rollout.
- Tests cover the new upload flows and the simplified markdown-only editor flow.
