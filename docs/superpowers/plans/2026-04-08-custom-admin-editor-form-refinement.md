# Custom Admin Editor Form Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the current custom admin prototype so preview becomes a centered reading canvas, the save button has readable explicit states, and category/tag fields become searchable multi-select controls.

**Architecture:** Work only in the existing dedicated worktree at `/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/`. Keep the current admin shell, GitHub-backed content model, and approximate markdown preview architecture intact. Limit the change to targeted UI/data-flow refinements in `App.tsx`, `preview-pane.tsx`, `top-bar.tsx`, `settings-panel.tsx`, and `app.css`, with one small extracted component for searchable taxonomy selection.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, existing admin-app worktree, Hexo-compatible frontmatter/markdown state.

---

## Implementation context

- **Implement in:** `/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/`
- **Spec:** `/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/docs/superpowers/specs/2026-04-08-custom-admin-editor-form-refinement-design.md`
- **Do not implement in:** the old Decap runtime under `public/admin/`
- **Keep unchanged:** auth/session flow, GitHub storage flow, publish-lock rules, frontmatter schema, markdown serialization contract

## File structure and responsibilities

### Existing files to modify
- `admin-app/src/app/App.tsx` — derive preview/save UI state from existing document state and pass the right props to child components
- `admin-app/src/app/editor/preview-pane.tsx` — render the centered article preview surface using frontmatter title/date plus body
- `admin-app/src/app/layout/top-bar.tsx` — render explicit save button states and keep top-bar actions stable
- `admin-app/src/app/layout/settings-panel.tsx` — replace inline taxonomy inputs with the reusable searchable multi-select control
- `admin-app/src/styles/app.css` — fix preview layout centering, reading-canvas styling, save-button contrast/states, and taxonomy control styling
- `admin-app/src/app/App.preview.test.tsx` — lock preview content and chrome expectations
- `admin-app/src/app/App.editor-modes.test.tsx` — lock preview/immersive layout boundaries and return-to-editing behavior
- `admin-app/src/app/App.save-flow.test.tsx` — lock save-button state mapping from real app state
- `admin-app/src/app/layout/settings-panel.test.tsx` — lock settings-panel integration with the new taxonomy control
- `admin-app/src/app/layout/post-list-pane.test.tsx` — update direct `TopBar` render coverage for the new save props

### New files to create
- `admin-app/src/app/layout/taxonomy-multi-select.tsx` — focused searchable multi-select control used by both 分类 and 标签 fields
- `admin-app/src/app/layout/taxonomy-multi-select.test.tsx` — unit tests for search, select, deselect, empty-state, and no-results behavior

### Notes for implementers
- Do not add new metadata fields.
- Do not add taxonomy creation in v1.
- Do not rework the overall three-column editor architecture outside preview mode.
- Do not replace the markdown preview parser; refine framing/layout only.
- Keep preview title/date derived from current frontmatter so unsaved edits appear in preview.
- Existing unsupported/success/error banners may remain **outside** the article canvas; only remove preview-specific utility chrome **inside** the preview canvas.
- Keep immersive editing behavior unchanged when not in preview mode.
- If you need a small helper for preview date formatting, keep it local to `preview-pane.tsx` unless duplication becomes obvious.
- Use TDD: write the failing test first, run it, make the smallest change, rerun.
- Checkpoint commits are included below as **optional** commands to use only if the user explicitly asks for commits.

## Task 1: Rebuild preview as a centered reading canvas

**Files:**
- Modify: `admin-app/src/app/App.tsx`
- Modify: `admin-app/src/app/editor/preview-pane.tsx`
- Modify: `admin-app/src/styles/app.css`
- Modify: `admin-app/src/app/App.preview.test.tsx`
- Modify: `admin-app/src/app/App.editor-modes.test.tsx`

- [ ] **Step 1: Write the failing preview regression tests**

Update `admin-app/src/app/App.preview.test.tsx` so the supported-preview case asserts **frontmatter title + frontmatter date + body content**, not just body headings:

```tsx
expect(await screen.findByRole('heading', { name: 'Preview supported post' })).toBeTruthy()
expect(screen.getByText('2026-04-03 12:00:00')).toBeTruthy()
expect(screen.getByRole('heading', { name: 'Preview Title' })).toBeTruthy()
expect(screen.getByText(/Body with/)).toBeTruthy()
expect(screen.queryByText('近似阅读效果')).toBeNull()
expect(screen.queryByText('阅读预览')).toBeNull()
expect(screen.queryByText(/当前为沉浸阅读视图/)).toBeNull()
expect(screen.queryByText(/这是客户端近似预览/)).toBeNull()
```

Update the unsupported-preview case to remove the old preview-note expectation while keeping the unsupported-content warning expectation:

```tsx
expect(await screen.findByRole('link', { name: 'alt' })).toBeTruthy()
expect(screen.getByText('富文本模式暂不支持图片语法。')).toBeTruthy()
expect(screen.queryByText(/这是客户端近似预览/)).toBeNull()
```

Update `admin-app/src/app/App.editor-modes.test.tsx` to fully remove stale preview-chrome expectations, not just the old utility heading:
- keep the focused-reading-layout assertion
- replace any expectation for the old preview utility heading, note block, eyebrow label, or preview stats with frontmatter title/date/body assertions
- add a regression that edits title/body before entering preview, asserts those unsaved values render in preview, exits preview, and confirms the edited values are still present in the editor while the prior editor mode is restored

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- src/app/App.preview.test.tsx src/app/App.editor-modes.test.tsx`

Expected: FAIL because preview still renders utility chrome (`近似阅读效果`, note, stats) and does not yet frame preview around frontmatter title/date.

- [ ] **Step 3: Implement the minimal preview data-flow and markup changes**

Make the smallest code change that satisfies the spec:
- pass the current document title/date/body from `App.tsx` into `PreviewPane`
- keep existing success/error/unsupported banners outside `<PreviewPane />`
- remove preview-only utility chrome from inside the preview canvas
- keep top bar visible
- keep both sidebars hidden in preview mode using the existing preview/immersive plumbing
- render one article canvas with title/date/body only

Target shape inside `preview-pane.tsx`:

```tsx
type PreviewPaneProps = {
  title: string
  date: string
  markdown: string
}

return (
  <section className="preview-pane preview-pane--reading-canvas">
    <article className="preview-article">
      <header className="preview-article__header">
        <h1>{title || '未命名草稿'}</h1>
        <p className="preview-article__date">{date}</p>
      </header>
      <div className="preview-content">{renderBlocks(markdown)}</div>
    </article>
  </section>
)
```

- [ ] **Step 4: Implement the minimal CSS fix for centering and reading rhythm**

Update `admin-app/src/styles/app.css` so preview becomes one centered reading canvas rather than a right-shifted editor panel:
- center the preview container horizontally
- give the article canvas a stable reading max-width
- remove old preview header/stats spacing rules that only supported the old utility-chrome layout
- keep immersive editing CSS unchanged outside preview-specific selectors

Keep the CSS localized to `.preview-pane`, `.preview-pane--reading-canvas`, `.preview-article`, `.preview-article__header`, and `.preview-article__date`.

- [ ] **Step 5: Run the preview tests again**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- src/app/App.preview.test.tsx src/app/App.editor-modes.test.tsx`

Expected: PASS

- [ ] **Step 6: Optional checkpoint commit (only if requested by the user)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/App.tsx admin-app/src/app/editor/preview-pane.tsx admin-app/src/styles/app.css admin-app/src/app/App.preview.test.tsx admin-app/src/app/App.editor-modes.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "fix: center admin preview canvas"
```

## Task 2: Make the save button readable with explicit UI states

**Files:**
- Modify: `admin-app/src/app/App.tsx`
- Modify: `admin-app/src/app/layout/top-bar.tsx`
- Modify: `admin-app/src/styles/app.css`
- Modify: `admin-app/src/app/App.save-flow.test.tsx`
- Modify: `admin-app/src/app/layout/post-list-pane.test.tsx`

- [ ] **Step 1: Write the failing save-state tests**

Extend `admin-app/src/app/App.save-flow.test.tsx` to cover four app-level states plus the invalid-save validation path:

1. **clean opened document** → disabled `已保存`

```tsx
fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
expect(await screen.findByRole('button', { name: '已保存' })).toHaveAttribute('disabled')
```

2. **dirty document** → enabled `保存`

```tsx
fireEvent.change(screen.getByLabelText('标题'), { target: { value: 'Dirty title' } })
expect(screen.getByRole('button', { name: '保存' })).not.toHaveAttribute('disabled')
```

3. **saving in progress** → disabled `保存中…`

```tsx
let resolveSave: (() => void) | null = null
const pendingSave = new Promise((resolve) => {
  resolveSave = () => resolve({ path: existingPost.path, sha: 'sha-updated', content: 'serialized' })
})
vi.spyOn(githubClientModule, 'savePostFile').mockReturnValue(pendingSave as never)
fireEvent.click(screen.getByRole('button', { name: '保存' }))
expect(screen.getByRole('button', { name: '保存中…' })).toHaveAttribute('disabled')
resolveSave?.()
```

4. **invalid dirty document** → still actionable `保存`, existing field-level validation appears on click, and no save request is sent

```tsx
fireEvent.change(screen.getByLabelText('标题'), { target: { value: '' } })
expect(screen.getByRole('button', { name: '保存' })).not.toHaveAttribute('disabled')
fireEvent.click(screen.getByRole('button', { name: '保存' }))
expect(await screen.findByText(/标题不能为空|请输入标题/)).toBeTruthy()
expect(githubClientModule.savePostFile).not.toHaveBeenCalled()
```

Also extend the successful-save case so the button returns to disabled `已保存` after the save finishes.

Update `admin-app/src/app/layout/post-list-pane.test.tsx` so the direct `TopBar` render passes the new props and covers the **no active document** state:

```tsx
render(
  <TopBar
    ...
    hasActiveDocument={false}
    saveLabel="保存"
    isSaveDisabled={true}
  />,
)
expect(screen.getByRole('button', { name: '保存' })).toHaveAttribute('disabled')
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- src/app/App.save-flow.test.tsx src/app/layout/post-list-pane.test.tsx`

Expected: FAIL because the current top bar only renders a static `保存` button and does not expose clean/saving/no-document states.

- [ ] **Step 3: Implement minimal save-state mapping in App.tsx**

In `admin-app/src/app/App.tsx`, derive explicit save UI state from existing app state only:

```tsx
const saveLabel = !document ? '保存' : isSaving ? '保存中…' : isDirty ? '保存' : '已保存'
const isSaveDisabled = !document || isSaving || !isDirty
```

Pass those props into `TopBar`.

Do not introduce a validation-only disabled state: when the document is dirty but invalid, the button must still render actionable `保存`, and clicking it must continue to surface the existing field-level validation flow.

- [ ] **Step 4: Update TopBar markup and CSS for readable states**

In `admin-app/src/app/layout/top-bar.tsx`:
- add `saveLabel` and `isSaveDisabled` props
- keep save in the same top-bar location
- render the label from props
- set `disabled={isSaveDisabled}`

In `admin-app/src/styles/app.css`:
- increase contrast for the primary save button text/background pairing
- keep disabled save text readable
- make the `已保存` state visibly quieter without hiding the label
- keep hover/focus/active styles on the actionable `保存` state only

- [ ] **Step 5: Run the save-state tests again**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- src/app/App.save-flow.test.tsx src/app/layout/post-list-pane.test.tsx`

Expected: PASS

- [ ] **Step 6: Optional checkpoint commit (only if requested by the user)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/App.tsx admin-app/src/app/layout/top-bar.tsx admin-app/src/styles/app.css admin-app/src/app/App.save-flow.test.tsx admin-app/src/app/layout/post-list-pane.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "fix: clarify admin save button states"
```

## Task 3: Build the searchable taxonomy multi-select component

**Files:**
- Create: `admin-app/src/app/layout/taxonomy-multi-select.tsx`
- Create: `admin-app/src/app/layout/taxonomy-multi-select.test.tsx`
- Modify: `admin-app/src/styles/app.css`

- [ ] **Step 1: Write the failing component tests**

Create `admin-app/src/app/layout/taxonomy-multi-select.test.tsx` and define the accessibility contract up front:
- trigger uses `button`
- dropdown uses `listbox`
- selectable rows use `option`
- search input has an explicit label such as `搜索分类` / `搜索标签`

Cover:
- opening the dropdown
- filtering options from a search input
- selecting multiple options
- deselecting from the dropdown
- removing from selected chips
- empty indexed-option state
- no-results state
- no freeform creation path

Example assertions:

```tsx
fireEvent.click(screen.getByRole('button', { name: '分类' }))
fireEvent.change(screen.getByRole('textbox', { name: '搜索分类' }), { target: { value: '思' } })
fireEvent.click(screen.getByRole('option', { name: '思考' }))
expect(onChange).toHaveBeenCalledWith(['专业', '思考'])
expect(screen.getByRole('listbox', { name: '分类选项' })).toBeTruthy()
expect(screen.getByText('暂无可选分类')).toBeTruthy()
expect(screen.getByText('没有匹配结果')).toBeTruthy()
expect(screen.queryByText(/创建/)).toBeNull()
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- src/app/layout/taxonomy-multi-select.test.tsx`

Expected: FAIL because the component does not exist yet.

- [ ] **Step 3: Implement the reusable component with explicit semantics**

Create `admin-app/src/app/layout/taxonomy-multi-select.tsx` with one clear responsibility:
- render selected chips
- toggle dropdown open/closed
- filter `availableOptions` with a local search query
- call `onChange(nextValues)` with string arrays only
- show empty/no-results messages
- never create new options from user input
- keep selected chips visible even if `availableOptions` is empty

Minimal component contract:

```tsx
type TaxonomyMultiSelectProps = {
  label: '分类' | '标签'
  value: string[]
  availableOptions: string[]
  onChange: (value: string[]) => void
}
```

- [ ] **Step 4: Add minimal component CSS**

In `admin-app/src/styles/app.css`, add only the selectors needed for:
- trigger
- dropdown panel
- search input
- listbox/option rows
- selected chips
- chip remove affordance
- empty-state / no-results messages

Do not restyle unrelated settings-panel fields.

- [ ] **Step 5: Run the component tests again**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- src/app/layout/taxonomy-multi-select.test.tsx`

Expected: PASS

- [ ] **Step 6: Optional checkpoint commit (only if requested by the user)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/layout/taxonomy-multi-select.tsx admin-app/src/app/layout/taxonomy-multi-select.test.tsx admin-app/src/styles/app.css
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add taxonomy multi-select control"
```

## Task 4: Integrate taxonomy multi-select into the settings panel

**Files:**
- Modify: `admin-app/src/app/layout/settings-panel.tsx`
- Modify: `admin-app/src/app/layout/settings-panel.test.tsx`

- [ ] **Step 1: Write the failing settings-panel integration tests**

Update `admin-app/src/app/layout/settings-panel.test.tsx` so it no longer expects comma-entry behavior and instead expects:
- taxonomy trigger buttons
- searchable dropdown interaction
- selected chips visible in the field
- selected values removable without manual comma editing
- existing document selections still visible and removable even when `availableCategories` / `availableTags` are empty

Example assertions:

```tsx
fireEvent.click(screen.getByRole('button', { name: '分类' }))
fireEvent.change(screen.getByRole('textbox', { name: '搜索分类' }), { target: { value: '思' } })
fireEvent.click(screen.getByRole('option', { name: '思考' }))
expect(onFieldChange).toHaveBeenCalledWith('categories', ['专业', '思考'])
```

And for empty options:

```tsx
expect(screen.getByText('专业')).toBeTruthy()
expect(screen.getByText('产品')).toBeTruthy()
expect(screen.getByText('暂无可选分类')).toBeTruthy()
```

- [ ] **Step 2: Run the settings-panel tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- src/app/layout/settings-panel.test.tsx`

Expected: FAIL because taxonomy still uses a plain text input plus inline option chips.

- [ ] **Step 3: Wire the new component into SettingsPanel**

Update `admin-app/src/app/layout/settings-panel.tsx`:
- remove the comma-separated taxonomy text input
- replace the inline taxonomy implementation with `TaxonomyMultiSelect`
- preserve the same `frontmatter.categories` / `frontmatter.tags` array writes
- preserve visibility/removability of already-selected values even when the indexed options array is empty
- keep publish/date/title/desc/permalink fields unchanged

- [ ] **Step 4: Run the settings-panel tests again**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- src/app/layout/settings-panel.test.tsx`

Expected: PASS

- [ ] **Step 5: Optional checkpoint commit (only if requested by the user)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/layout/settings-panel.tsx admin-app/src/app/layout/settings-panel.test.tsx admin-app/src/app/layout/taxonomy-multi-select.tsx admin-app/src/app/layout/taxonomy-multi-select.test.tsx admin-app/src/styles/app.css
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: use searchable taxonomy selectors"
```

## Task 5: Run final verification on the whole refinement

**Files:**
- Verify only; no new files expected

- [ ] **Step 1: Run the full admin-app test suite**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test`

Expected: PASS

- [ ] **Step 2: Run the worktree build**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" run build`

Expected: PASS

- [ ] **Step 3: Manually smoke-test the refinement in the browser**

Run:
`cd "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" && npx vite --host 127.0.0.1 --port 4100`

Manual checks at `http://127.0.0.1:4100/admin/`:
- open a post, click **预览**, confirm the article canvas is centered and no longer shifted right
- confirm preview shows frontmatter title/date above the rendered body
- confirm preview no longer shows utility chrome such as `近似阅读效果`, stats, or the approximate-preview note block inside the article canvas
- confirm both sidebars are hidden in preview mode
- confirm existing unsupported/success/error banners still behave outside the preview canvas if present
- edit title/body, enter preview, confirm the unsaved values render there, then return to editing and confirm the edited values are still present and the prior editor mode is restored
- before opening any post, confirm the save button is disabled/readable with label `保存`
- confirm save button reads `已保存` on a clean open post
- hover and focus the actionable `保存` state and confirm the label remains readable
- edit the title/body and confirm the button becomes `保存`
- make the document invalid, confirm the button still stays actionable as `保存`, click it, and confirm the existing field-level validation errors appear without saving
- click save on a valid dirty document and confirm the button shows `保存中…` during the in-flight save state, then returns to `已保存`
- open 分类/标签, search existing values, select multiple, and remove one selection
- confirm an unmatched search shows a no-results message instead of a freeform creation path
- confirm a document with already-selected 分类/标签 still shows removable chips even when the indexed option set is empty

- [ ] **Step 4: Optional checkpoint commit (only if requested by the user)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app admin-app/src/styles/app.css
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: refine custom admin editor form"
```

## Execution notes

- Implement tasks in order.
- Do not start Task 2 until Task 1 tests pass.
- Do not start Task 3 until Task 2 tests pass.
- Do not start Task 4 until Task 3 tests pass.
- If any targeted test does not fail when expected, stop and update the test so it proves the regression.
- If preview CSS changes accidentally affect immersive editing mode, add the smallest selector split needed rather than reworking the whole layout system.
- If a new helper/component grows beyond one responsibility, split it before continuing.
- Keep every change DRY and YAGNI: no new preview engine, no taxonomy creation workflow, no top-bar redesign.