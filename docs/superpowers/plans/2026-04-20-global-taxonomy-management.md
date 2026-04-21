# Global Taxonomy Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add fast in-app taxonomy management so the admin editor can add categories/tags to the current article and globally rename/delete existing taxonomy terms across posts.

**Architecture:** Keep taxonomy article-derived. Use one small pure helper module for normalization, validation, local post updates, and merged available options; extend the existing post parse/serialize layer so unknown frontmatter keys and optional-field absence round-trip safely; use one focused async batch helper for sequential GitHub-backed rename/delete mutations; and render a compact taxonomy manager component inside the existing settings panel. `App.tsx` stays responsible for orchestration, busy/error/message state, dirty-state safety rules, temporarily locking post switching/new-post creation during global mutations, and syncing the open document plus post list after management actions.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, GitHub Contents API, existing frontmatter parse/serialize helpers.

---

## Implementation context

- **Spec:** `docs/superpowers/specs/2026-04-20-global-taxonomy-management-design.md`
- **Repo root:** `/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io`
- **Admin app root:** `/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app`
- **Execution discipline:** use @superpowers:test-driven-development for each task, @superpowers:verification-before-completion before claiming success, and @superpowers:requesting-code-review before merge.
- **Keep unchanged:** GitHub auth/session model, article save contract, post frontmatter schema, existing taxonomy multi-select behavior, no separate taxonomy page.
- **Important v1 constraints:**
  - add is article-anchored only
  - rename/delete are sequential global mutations
  - rename/delete require a clean current document
  - batch mutations are non-atomic: stop on first failure, no rollback
- **Build outputs:** `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" build` regenerates tracked files under `source/admin/index.html` and `source/admin/assets/*`; include those diffs in final verification.

## File structure and responsibilities

### Existing files to modify
- `admin-app/src/app/App.tsx` — own add/rename/delete orchestration, busy/error/message state, current-document sync, merged available taxonomy options, and temporary lockouts for new/open during global mutations.
- `admin-app/src/app/posts/parse-post.ts` — parse known frontmatter fields while preserving unknown frontmatter lines/order for round-trip serialization.
- `admin-app/src/app/posts/parse-post.test.ts` — lock unknown-key preservation and optional-field absence semantics.
- `admin-app/src/app/posts/serialize-post.ts` — serialize taxonomy changes without dropping unrelated frontmatter keys/body content.
- `admin-app/src/app/posts/serialize-post.test.ts` — lock round-trip preservation coverage for unknown frontmatter keys and optional-field omission.
- `admin-app/src/app/layout/settings-panel.tsx` — render taxonomy manager blocks and forward callbacks/state into them.
- `admin-app/src/app/layout/settings-panel.test.tsx` — keep settings-panel wiring coverage green after the new props are added.
- `admin-app/src/app/layout/post-list-pane.tsx` — support temporarily disabling post-opening while a global taxonomy mutation is running.
- `admin-app/src/app/layout/post-list-pane.test.tsx` — cover the disabled-open behavior.
- `admin-app/src/app/layout/top-bar.tsx` — support temporarily disabling new-post creation while a global taxonomy mutation is running.
- `admin-app/src/app/layout/top-bar.test.tsx` — if split out later, otherwise keep top-bar coverage in `post-list-pane.test.tsx` green after the new disabled prop is added.
- `admin-app/src/styles/app.css` — add compact taxonomy manager styling consistent with the current settings panel.

### New files to create
- `admin-app/src/app/taxonomy/taxonomy-management.ts` — pure helpers for normalization, validation, merging indexed options with the current draft, and updating taxonomy arrays/posts.
- `admin-app/src/app/taxonomy/taxonomy-management.test.ts` — unit tests for pure taxonomy helper behavior.
- `admin-app/src/app/taxonomy/run-global-taxonomy-operation.ts` — sequential GitHub-backed rename/delete helper plus structured failure type.
- `admin-app/src/app/taxonomy/run-global-taxonomy-operation.test.ts` — mocked tests for sequential mutation behavior, frontmatter/body preservation, and stop-on-first-failure semantics.
- `admin-app/src/app/layout/taxonomy-manager.tsx` — compact add/rename/delete UI for one taxonomy kind.
- `admin-app/src/app/layout/taxonomy-manager.test.tsx` — focused component tests for add/rename/delete UI behavior.
- `admin-app/src/app/App.taxonomy-management.test.tsx` — integration tests for app orchestration, dirty-state restrictions, auth expiry, current-document/post-list sync, and temporary navigation locks during global mutations.

### Notes for implementers
- Keep taxonomy helpers focused. Do **not** build a general metadata framework.
- Keep global mutation logic out of `App.tsx`; use the dedicated batch helper.
- Do **not** introduce a standalone taxonomy registry file.
- Add success feedback for taxonomy actions separately from the existing save success message, because add intentionally leaves the document dirty.
- Render taxonomy action feedback through its own visible message UI, independent of the existing save-status label/button state, so add/rename/delete results are still visible while the document is dirty.
- Reuse `parsePost`, `serializePost`, `parsePostIndexItem`, and `sortPostIndex`, but extend `parsePost`/`serializePost` first so unknown frontmatter keys and optional-field absence survive a taxonomy-only round trip.
- Temporary taxonomy options must be derived only from the active document draft so they disappear after the user switches articles, reloads, or discards an unsaved draft.
- The taxonomy manager must receive indexed-only options for rename/delete rows, while merged indexed+draft options are used only for add validation and selector visibility.
- Clear `taxonomyMessage` whenever the active document changes, a new document/workspace is loaded, or auth-expiry/logout resets the session, so taxonomy feedback never leaks onto the wrong article.
- After a partial global rename/delete failure, always refresh the indexed post list and, if an article is open, re-fetch that active file from GitHub so the UI reflects persisted repo state without guessing whether the article was affected.
- After a successful global rename/delete, refresh the active document from persisted GitHub content so the editor gets the latest saved content and SHA before the next manual save.
- While a global taxonomy operation is in flight, disable all taxonomy actions and also block opening another post or creating a new post until the operation settles, so the active-document refresh target cannot change mid-mutation.
- Keep the scope of that temporary lock narrow: search input, preview toggle, and normal editing can stay as-is; only actions that replace the active document need to be blocked in v1.

## Task 1: Preserve frontmatter round trips and build the pure taxonomy helper layer

**Files:**
- Modify: `admin-app/src/app/posts/parse-post.ts`
- Modify: `admin-app/src/app/posts/parse-post.test.ts`
- Modify: `admin-app/src/app/posts/serialize-post.ts`
- Modify: `admin-app/src/app/posts/serialize-post.test.ts`
- Create: `admin-app/src/app/taxonomy/taxonomy-management.ts`
- Create: `admin-app/src/app/taxonomy/taxonomy-management.test.ts`

- [ ] **Step 1: Write the failing frontmatter-preservation and helper tests**

First, extend `admin-app/src/app/posts/parse-post.test.ts` and `admin-app/src/app/posts/serialize-post.test.ts` with preservation coverage that currently fails.

Add a parse test proving unknown frontmatter survives parsing metadata:

```ts
const parsed = parsePost({
  path: 'source/_posts/example.md',
  sha: 'sha-1',
  content: `---
layout: post
cover: /images/demo.png
title: Example
date: 2026-04-01 20:10:00
categories:
  - 思考
tags:
  - 记录
desc: Example desc
custom_field: keep-me
---

Hello world
`,
})

expect(parsed.rawFrontmatterLines).toContain('layout: post')
expect(parsed.rawFrontmatterLines).toContain('cover: /images/demo.png')
expect(parsed.rawFrontmatterLines).toContain('custom_field: keep-me')
```

Add a serialize test proving taxonomy-only edits preserve unknown keys and optional-field absence:

```ts
const output = serializePost({
  ...parsed,
  hasExplicitPublished: false,
  hasExplicitPermalink: false,
  frontmatter: {
    ...parsed.frontmatter,
    categories: ['洞察'],
  },
})

expect(output).toContain('layout: post')
expect(output).toContain('cover: /images/demo.png')
expect(output).toContain('custom_field: keep-me')
expect(output).not.toContain('published:')
expect(output).not.toContain('permalink:')
expect(output).toContain('\n\ncategories:\n  - 洞察\n')
expect(output).toContain('\n\nHello world\n')
```

Then create `admin-app/src/app/taxonomy/taxonomy-management.test.ts` with focused unit tests for normalization, validation, local array updates, and merged options.

Include a normalization + merge test:

```ts
expect(mergeAvailableTaxonomyOptions(['专业', '思考'], [' 思考 ', '记录'])).toEqual([
  '思考',
  '专业',
  '记录',
])
```

Include add validation tests:

```ts
expect(validateNewTaxonomyValue('', '分类', ['专业'])).toEqual({
  ok: false,
  message: '请填写分类名称。',
})

expect(validateNewTaxonomyValue(' 专业 ', '分类', ['专业'])).toEqual({
  ok: false,
  message: '该分类已存在。',
})
```

Include rename validation tests:

```ts
expect(validateRenameTaxonomyValue('记录', ' 记录 ', '标签', ['记录', '月记'])).toEqual({
  ok: false,
  message: '新标签名不能与原值相同。',
})

expect(validateRenameTaxonomyValue('记录', '月记', '标签', ['记录', '月记'])).toEqual({
  ok: false,
  message: '该标签已存在。',
})
```

Include local post-update tests:

```ts
expect(addTaxonomyValue(['专业'], '思考')).toEqual(['专业', '思考'])
expect(renameTaxonomyValues(['记录', '产品'], '记录', '月记')).toEqual(['月记', '产品'])
expect(deleteTaxonomyValue(['生活', '记录'], '生活')).toEqual(['记录'])
```

- [ ] **Step 2: Run the frontmatter/helper tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/posts/parse-post.test.ts src/app/posts/serialize-post.test.ts src/app/taxonomy/taxonomy-management.test.ts`

Expected: FAIL because the new parse/serialize preservation assertions and `taxonomy-management.ts` do not exist yet.

- [ ] **Step 3: Extend parse/serialize, then implement the minimal pure helper module**

In `admin-app/src/app/posts/parse-post.ts` and `admin-app/src/app/posts/serialize-post.ts`, add the minimum metadata needed to preserve unrelated frontmatter lines during taxonomy-only rewrites.

Target shape:

```ts
export type ParsedPost = {
  path: string
  sha: string
  frontmatter: PostFrontmatter
  body: string
  hasExplicitPublished: boolean
  hasExplicitPermalink: boolean
  rawFrontmatterLines: string[]
}
```

Implementation rules for the frontmatter layer:
- keep parsing known fields exactly as today for editor usage
- preserve the original frontmatter line order in `rawFrontmatterLines`
- when serializing, replace only the managed keys (`title`, `permalink`, `date`, `published`, `categories`, `tags`, `desc`) while leaving unknown keys untouched
- preserve absence of optional keys: if `hasExplicitPublished` is false, omit `published:`; if `hasExplicitPermalink` is false and permalink is empty, omit `permalink:`
- keep the article body byte-for-byte the same apart from the normal frontmatter separator/newline framing already used by the serializer

Then in `admin-app/src/app/taxonomy/taxonomy-management.ts`, add:
- `export type TaxonomyField = 'categories' | 'tags'`
- `normalizeTaxonomyValue(value: string)`
- `mergeAvailableTaxonomyOptions(indexedOptions: string[], draftValues: string[])`
- `validateNewTaxonomyValue(value: string, label: '分类' | '标签', availableOptions: string[])`
- `validateRenameTaxonomyValue(currentValue: string, nextValue: string, label: '分类' | '标签', availableOptions: string[])`
- `addTaxonomyValue(currentValues: string[], nextValue: string)`
- `renameTaxonomyValues(currentValues: string[], from: string, to: string)`
- `deleteTaxonomyValue(currentValues: string[], target: string)`

Target shape:

```ts
export function normalizeTaxonomyValue(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, '').trim()
}

export function mergeAvailableTaxonomyOptions(indexedOptions: string[], draftValues: string[]) {
  return Array.from(
    new Set([...indexedOptions, ...draftValues].map(normalizeTaxonomyValue).filter((value) => value.length > 0)),
  ).sort((left, right) => left.localeCompare(right, 'zh-CN'))
}
```

Keep the module pure. No React, no fetch, no GitHub calls.

- [ ] **Step 4: Re-run the frontmatter/helper tests to verify they pass**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/posts/parse-post.test.ts src/app/posts/serialize-post.test.ts src/app/taxonomy/taxonomy-management.test.ts`

Expected: PASS

- [ ] **Step 5: Optional checkpoint commit (only if the user explicitly asks for a commit)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" add admin-app/src/app/taxonomy/taxonomy-management.ts admin-app/src/app/taxonomy/taxonomy-management.test.ts
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" commit -m "feat: add taxonomy management helpers"
```

## Task 2: Add the sequential global rename/delete batch helper

**Files:**
- Create: `admin-app/src/app/taxonomy/run-global-taxonomy-operation.ts`
- Create: `admin-app/src/app/taxonomy/run-global-taxonomy-operation.test.ts`

- [ ] **Step 1: Write the failing batch-helper tests**

Create `admin-app/src/app/taxonomy/run-global-taxonomy-operation.test.ts` with mocked GitHub client behavior.

Add a rename-success test:

```ts
vi.spyOn(githubClientModule, 'listPostFiles').mockResolvedValue([
  { type: 'file', path: 'source/_posts/a.md', sha: 'sha-a', name: 'a.md' },
  { type: 'file', path: 'source/_posts/b.md', sha: 'sha-b', name: 'b.md' },
])
vi.spyOn(githubClientModule, 'fetchPostFile')
  .mockResolvedValueOnce({ path: 'source/_posts/a.md', sha: 'sha-a', content: postA })
  .mockResolvedValueOnce({ path: 'source/_posts/b.md', sha: 'sha-b', content: postB })
vi.spyOn(githubClientModule, 'savePostFile').mockResolvedValue({
  path: 'source/_posts/a.md',
  sha: 'sha-a-2',
  content: renamedPostA,
})

const result = await runGlobalTaxonomyOperation(
  { token: 'token' },
  {
    type: 'rename',
    field: 'categories',
    from: '专业',
    to: '洞察',
  },
  { activePostPath: 'source/_posts/a.md' },
)

expect(result.changedCount).toBe(1)
expect(result.posts[0].categories).toEqual(['洞察'])
expect(result.activePostSave?.path).toBe('source/_posts/a.md')
expect(result.activePostSave?.sha).toBe('sha-a-2')
expect(githubClientModule.savePostFile).toHaveBeenCalledTimes(1)
```

Add a failure test proving the helper stops on the first failing file and preserves changed count:

```ts
await expect(
  runGlobalTaxonomyOperation({ token: 'token' }, {
    type: 'delete',
    field: 'tags',
    value: '记录',
  }),
).rejects.toMatchObject({
  name: 'GlobalTaxonomyOperationError',
  changedCount: 1,
  failedPath: 'source/_posts/b.md',
})
```

Add an exact-match + field-isolation test:

```ts
const result = await runGlobalTaxonomyOperation(
  { token: 'token' },
  {
    type: 'rename',
    field: 'categories',
    from: '专业',
    to: '洞察',
  },
)

expect(result.posts[0].categories).toEqual(['洞察', '专业化'])
expect(result.posts[0].tags).toEqual(['专业', '记录'])
expect(githubClientModule.savePostFile).toHaveBeenCalledTimes(1)
```

Add a preservation test so unrelated frontmatter/body stay unchanged:

```ts
const savedFile = vi.mocked(githubClientModule.savePostFile).mock.calls[0]?.[1]
expect(savedFile?.content).toContain('layout: post')
expect(savedFile?.content).toContain('custom_field: keep-me')
expect(savedFile?.content).toContain('title: 保留标题')
expect(savedFile?.content).toContain('desc: 保留摘要')
expect(savedFile?.content).not.toContain('published:')
expect(savedFile?.content).not.toContain('permalink:')
expect(savedFile?.content).toContain('\n\n这里是保留的正文')
```

- [ ] **Step 2: Run the batch-helper tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/taxonomy/run-global-taxonomy-operation.test.ts`

Expected: FAIL because the batch helper module does not exist yet.

- [ ] **Step 3: Implement the sequential global operation helper**

In `admin-app/src/app/taxonomy/run-global-taxonomy-operation.ts`, create:
- `export type GlobalTaxonomyOperation = { type: 'rename'; field: TaxonomyField; from: string; to: string } | { type: 'delete'; field: TaxonomyField; value: string }`
- `export class GlobalTaxonomyOperationError extends Error`
- `runGlobalTaxonomyOperation(session, operation)`

Implementation rules:
- call `listPostFiles(session)` first
- fetch each post sequentially
- parse via `parsePost()`
- apply rename/delete using Task 1 helpers
- mutate only the selected taxonomy field and only exact normalized matches; never touch the other taxonomy field
- preserve all unrelated frontmatter fields, unknown frontmatter keys, optional-field absence, and article body content when serializing
- only serialize + save when taxonomy values actually changed
- rebuild the returned `PostIndexItem[]` with `parsePostIndexItem()` and `sortPostIndex()`
- when the active document file is changed, keep the saved GitHub response for that file so the caller can refresh the editor with the new persisted sha/content
- stop on the first fetch/parse/serialize/save failure and throw `GlobalTaxonomyOperationError`

Target shape:

```ts
export class GlobalTaxonomyOperationError extends Error {
  constructor(
    message: string,
    readonly changedCount: number,
    readonly failedPath: string,
    readonly cause: unknown,
  ) {
    super(message)
    this.name = 'GlobalTaxonomyOperationError'
  }
}
```

```ts
export async function runGlobalTaxonomyOperation(
  session: SessionState,
  operation: GlobalTaxonomyOperation,
  options?: { activePostPath?: string | null },
) {
  const files = await listPostFiles(session)
  const nextPosts: PostIndexItem[] = []
  let changedCount = 0
  let activePostSave: { path: string; sha: string; content: string } | null = null

  for (const file of files) {
    try {
      ...
      if (savedFile.path === options?.activePostPath) {
        activePostSave = savedFile
      }
    } catch (error) {
      throw new GlobalTaxonomyOperationError(
        `全局${operation.field === 'categories' ? '分类' : '标签'}更新失败。`,
        changedCount,
        file.path,
        error,
      )
    }
  }

  return {
    changedCount,
    posts: sortPostIndex(nextPosts, 'date-desc'),
    activePostSave,
  }
}
```

- [ ] **Step 4: Re-run the batch-helper tests to verify they pass**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/taxonomy/run-global-taxonomy-operation.test.ts`

Expected: PASS

- [ ] **Step 5: Optional checkpoint commit (only if the user explicitly asks for a commit)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" add admin-app/src/app/taxonomy/run-global-taxonomy-operation.ts admin-app/src/app/taxonomy/run-global-taxonomy-operation.test.ts
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" commit -m "feat: add global taxonomy mutation helper"
```

## Task 3: Build the taxonomy manager UI and settings-panel wiring

**Files:**
- Create: `admin-app/src/app/layout/taxonomy-manager.tsx`
- Create: `admin-app/src/app/layout/taxonomy-manager.test.tsx`
- Modify: `admin-app/src/app/layout/settings-panel.tsx`
- Modify: `admin-app/src/app/layout/settings-panel.test.tsx`
- Modify: `admin-app/src/app/layout/post-list-pane.tsx`
- Modify: `admin-app/src/app/layout/post-list-pane.test.tsx`
- Modify: `admin-app/src/app/layout/top-bar.tsx`
- Modify: `admin-app/src/app/App.tsx`
- Modify: `admin-app/src/styles/app.css`

- [ ] **Step 1: Write the failing taxonomy-manager tests**

Create `admin-app/src/app/layout/taxonomy-manager.test.tsx` with focused component coverage.

Add an add test:

```tsx
render(
  <TaxonomyManager
    label="分类"
    field="categories"
    selectedValues={['专业']}
    indexedOptions={['专业', '思考']}
    addOptions={['专业', '思考']}
    isBusy={false}
    globalActionsDisabled={false}
    onAdd={onAdd}
    onRename={onRename}
    onDelete={onDelete}
  />,
)

fireEvent.change(screen.getByLabelText('新增分类'), { target: { value: ' 洞察 ' } })
fireEvent.click(screen.getByRole('button', { name: '添加分类' }))

expect(onAdd).toHaveBeenCalledWith('categories', '洞察')
```

Add duplicate/empty validation tests:

```tsx
expect(screen.getByText('请填写分类名称。')).toBeTruthy()
expect(screen.getByText('该分类已存在。')).toBeTruthy()
```

Add rename + delete tests:

```tsx
fireEvent.click(screen.getByRole('button', { name: '重命名分类 专业' }))
fireEvent.change(screen.getByLabelText('重命名分类 专业'), { target: { value: '洞察' } })
fireEvent.click(screen.getByRole('button', { name: '确认重命名分类 专业' }))
expect(onRename).toHaveBeenCalledWith('categories', '专业', '洞察')
```

```tsx
vi.spyOn(window, 'confirm').mockReturnValue(true)
fireEvent.click(screen.getByRole('button', { name: '删除分类 专业' }))
expect(onDelete).toHaveBeenCalledWith('categories', '专业')
```

Add a dirty-lock test:

```tsx
render(...globalActionsDisabled={true} ...)
expect(screen.getByRole('button', { name: '重命名分类 专业' })).toBeDisabled()
expect(screen.getByRole('button', { name: '删除分类 专业' })).toBeDisabled()
expect(screen.getByRole('button', { name: '添加分类' })).not.toBeDisabled()
```

Add a cancel-delete test:

```tsx
const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
fireEvent.click(screen.getByRole('button', { name: '删除分类 专业' }))
expect(confirmSpy).toHaveBeenCalledWith('确认删除分类「专业」吗？这会影响所有文章。')
expect(onDelete).not.toHaveBeenCalled()
```

Add an indexed-only global-action test:

```tsx
render(
  <TaxonomyManager
    label="分类"
    field="categories"
    selectedValues={['专业', '临时分类']}
    indexedOptions={['专业']}
    addOptions={['专业', '临时分类']}
    isBusy={false}
    globalActionsDisabled={false}
    onAdd={onAdd}
    onRename={onRename}
    onDelete={onDelete}
  />,
)

expect(screen.queryByRole('button', { name: '重命名分类 临时分类' })).toBeNull()
expect(screen.queryByRole('button', { name: '删除分类 临时分类' })).toBeNull()
fireEvent.change(screen.getByLabelText('新增分类'), { target: { value: '临时分类' } })
fireEvent.click(screen.getByRole('button', { name: '添加分类' }))
expect(screen.getByText('该分类已存在。')).toBeTruthy()
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/layout/taxonomy-manager.test.tsx`

Expected: FAIL because `taxonomy-manager.tsx` does not exist yet.

- [ ] **Step 3: Implement the compact taxonomy manager component**

In `admin-app/src/app/layout/taxonomy-manager.tsx`, add a focused component that renders:
- add input + `添加分类` / `添加标签` button
- compact indexed term list
- per-row `重命名` and `删除` buttons
- one inline rename input at a time
- local validation messages using Task 1 helper validators
- `window.confirm()` delete confirmation
- add validation against `addOptions`, but rename/delete rows sourced only from `indexedOptions`

Target shape:

```tsx
type TaxonomyManagerProps = {
  label: '分类' | '标签'
  field: TaxonomyField
  selectedValues: string[]
  indexedOptions: string[]
  addOptions: string[]
  isBusy: boolean
  globalActionsDisabled: boolean
  onAdd: (field: TaxonomyField, value: string) => void
  onRename: (field: TaxonomyField, from: string, to: string) => void
  onDelete: (field: TaxonomyField, value: string) => void
}
```

Important rules:
- selected values still come from the existing multi-select and should remain visible there
- global actions are disabled when `globalActionsDisabled` is true
- add remains available while the document is dirty
- delete confirmation text should be explicit, e.g. `确认删除分类「专业」吗？这会影响所有文章。`

- [ ] **Step 4: Wire the new component into the settings panel and update settings-panel tests**

In `admin-app/src/app/layout/settings-panel.tsx`:
- import `TaxonomyManager`
- add the new taxonomy props to `SettingsPanel`
- make the smallest `App.tsx` prop-wiring change needed in this task so `SettingsPanel` still compiles while the layout/UI work lands
- render one `TaxonomyManager` below the `分类` selector and one below the `标签` selector
- pass indexed-only arrays for rename/delete rows and merged arrays for add validation
- show the dirty-lock note under each manager when global actions are disabled

In the same task, add the temporary global-mutation lock plumbing for document-switching surfaces:
- `top-bar.tsx`: add `isNewPostDisabled?: boolean` and pass it to the `新建文章` button
- `post-list-pane.tsx`: add `isOpenDisabled?: boolean` and pass it to each post button
- `post-list-pane.test.tsx`: add one assertion that the disabled props prevent `onOpenPost` firing and disable `新建文章` when the prop is true

Target prop additions:

```ts
indexedCategories: string[]
indexedTags: string[]
availableCategories: string[]
availableTags: string[]
isManagingTaxonomy: boolean
globalTaxonomyActionsDisabled: boolean
onAddTaxonomy: (field: TaxonomyField, value: string) => void
onRenameTaxonomy: (field: TaxonomyField, from: string, to: string) => void
onDeleteTaxonomy: (field: TaxonomyField, value: string) => void
```

Update `admin-app/src/app/layout/settings-panel.test.tsx` so it passes the new props and adds one wiring test, for example:

```tsx
fireEvent.change(screen.getByLabelText('新增标签'), { target: { value: '月记' } })
fireEvent.click(screen.getByRole('button', { name: '添加标签' }))
expect(onAddTaxonomy).toHaveBeenCalledWith('tags', '月记')
```

In the same task, add the minimal `App.tsx` prop plumbing needed so the typecheck/build stays green even before full taxonomy orchestration is implemented. Use temporary no-op handlers and existing facet values if needed; Task 4 will replace those placeholders with the real orchestration.

- [ ] **Step 5: Add the minimal taxonomy-manager styling**

In `admin-app/src/styles/app.css`, add only the selectors needed for the compact manager:
- `.taxonomy-manager`
- `.taxonomy-manager__add-row`
- `.taxonomy-manager__list`
- `.taxonomy-manager__item`
- `.taxonomy-manager__rename-row`
- `.taxonomy-manager__note`

Keep the styling restrained and aligned with the current settings panel.

- [ ] **Step 6: Re-run the focused UI tests**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/layout/taxonomy-manager.test.tsx src/app/layout/settings-panel.test.tsx`

Expected: PASS

- [ ] **Step 7: Optional checkpoint commit (only if the user explicitly asks for a commit)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" add admin-app/src/app/layout/taxonomy-manager.tsx admin-app/src/app/layout/taxonomy-manager.test.tsx admin-app/src/app/layout/settings-panel.tsx admin-app/src/app/layout/settings-panel.test.tsx admin-app/src/styles/app.css
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" commit -m "feat: add taxonomy manager UI"
```

## Task 4: Wire app orchestration, messages, and integration tests

**Files:**
- Modify: `admin-app/src/app/App.tsx`
- Create: `admin-app/src/app/App.taxonomy-management.test.tsx`

- [ ] **Step 1: Write the failing app integration tests**

Create `admin-app/src/app/App.taxonomy-management.test.tsx` with focused integration coverage.

Add an add-to-current-article test:

```tsx
render(<App />)
await waitFor(() => expect(screen.getByText('Save flow post')).toBeTruthy())
fireEvent.click(screen.getByRole('button', { name: /save flow post/i }))
await screen.findByLabelText('Markdown 编辑器')

fireEvent.change(screen.getByLabelText('新增分类'), { target: { value: '洞察' } })
fireEvent.click(screen.getByRole('button', { name: '添加分类' }))

expect(screen.getByRole('button', { name: '移除分类 洞察' })).toBeTruthy()
expect(screen.getByText('已新增分类：洞察（已加入当前文章）')).toBeTruthy()
expect(screen.getByText(/未保存修改/)).toBeTruthy()
```

Add a rename integration test using a mocked `runGlobalTaxonomyOperation()`:

```tsx
runGlobalTaxonomyOperation.mockResolvedValue({
  changedCount: 1,
  posts: [{ ...existingPost, categories: ['洞察'] }],
  activePostSave: {
    path: existingPost.path,
    sha: 'sha-updated',
    content: renamedMarkdown,
  },
})

fireEvent.click(screen.getByRole('button', { name: '重命名分类 专业' }))
fireEvent.change(screen.getByLabelText('重命名分类 专业'), { target: { value: '洞察' } })
fireEvent.click(screen.getByRole('button', { name: '确认重命名分类 专业' }))

await waitFor(() => {
  expect(runGlobalTaxonomyOperation).toHaveBeenCalledWith(
    { token: 'persisted-token' },
    { type: 'rename', field: 'categories', from: '专业', to: '洞察' },
    { activePostPath: existingPost.path },
  )
})
expect(screen.getByRole('button', { name: '移除分类 洞察' })).toBeTruthy()
expect(screen.getByText('已重命名分类：专业 → 洞察')).toBeTruthy()
```

Add a delete test, an auth-expiry test, a temporary-option lifecycle test, a taxonomy-message reset test, an in-flight lock test, a new/open lock test, and a partial-failure refresh test:

```tsx
fireEvent.change(screen.getByLabelText('新增标签'), { target: { value: '临时标签' } })
fireEvent.click(screen.getByRole('button', { name: '添加标签' }))
expect(screen.getByRole('button', { name: '移除标签 临时标签' })).toBeTruthy()

fireEvent.click(screen.getByRole('button', { name: /other post/i }))
await screen.findByDisplayValue('other-post/')
expect(screen.queryByRole('button', { name: '移除标签 临时标签' })).toBeNull()
```

```tsx
fireEvent.change(screen.getByLabelText('新增分类'), { target: { value: '洞察' } })
fireEvent.click(screen.getByRole('button', { name: '添加分类' }))
expect(screen.getByText('已新增分类：洞察（已加入当前文章）')).toBeTruthy()

fireEvent.click(screen.getByRole('button', { name: /other post/i }))
await screen.findByDisplayValue('other-post/')
expect(screen.queryByText('已新增分类：洞察（已加入当前文章）')).toBeNull()
```

```tsx
let resolveOperation:
  | ((value: { changedCount: number; posts: typeof posts; activePostSave: { path: string; sha: string; content: string } | null }) => void)
  | null = null
runGlobalTaxonomyOperation.mockReturnValue(
  new Promise((resolve) => {
    resolveOperation = resolve
  }),
)
...
fireEvent.click(screen.getByRole('button', { name: '确认重命名分类 专业' }))
expect(screen.getByRole('button', { name: '确认重命名分类 专业' })).toBeDisabled()
expect(screen.getByRole('button', { name: '删除分类 专业' })).toBeDisabled()
expect(screen.getByRole('button', { name: '新建文章' })).toBeDisabled()
expect(screen.getByRole('button', { name: /save flow post/i })).toBeDisabled()
expect(runGlobalTaxonomyOperation).toHaveBeenCalledTimes(1)
resolveOperation?.({
  changedCount: 1,
  posts: [{ ...existingPost, categories: ['洞察'] }],
  activePostSave: {
    path: existingPost.path,
    sha: 'sha-updated',
    content: renamedMarkdown,
  },
})
```

```tsx
runGlobalTaxonomyOperation.mockRejectedValue(
  new GlobalTaxonomyOperationError('全局标签更新失败。', 1, 'source/_posts/b.md', new Error('save failed')),
)
buildPostIndex.mockResolvedValueOnce([refreshedPost])
fetchPostFile.mockResolvedValueOnce({ path: refreshedPost.path, sha: 'sha-refreshed', content: refreshedMarkdown })
...
expect(await screen.findByText('全局标签更新失败。已更新 1 篇文章，失败文件：source/_posts/b.md。')).toBeTruthy()
expect(screen.getByRole('button', { name: '移除标签 月记' })).toBeTruthy()
```

```tsx
runGlobalTaxonomyOperation.mockRejectedValue(
  new GlobalTaxonomyOperationError('全局分类更新失败。', 0, existingPost.path, new GitHubAuthError()),
)
...
expect(await screen.findByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy()
```

- [ ] **Step 2: Run the integration tests to verify they fail**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/App.taxonomy-management.test.tsx`

Expected: FAIL because `App.tsx` does not expose taxonomy management handlers or taxonomy-specific messages yet.

- [ ] **Step 3: Implement the app-level taxonomy orchestration**

In `admin-app/src/app/App.tsx`:
- import Task 1 and Task 2 helpers
- add `isManagingTaxonomy` state
- add a separate taxonomy action message state, e.g. `taxonomyMessage`
- clear `taxonomyMessage` when opening/switching documents, creating/resetting workspace state, and handling auth-expiry/logout
- compute indexed taxonomy options from `collectPostIndexFacets(posts)` for global rename/delete lists
- separately merge indexed taxonomy options with current draft values so unsaved add terms stay visible while the draft remains open
- add `handleAddTaxonomy(field, value)`
- add `handleRenameTaxonomy(field, from, to)`
- add `handleDeleteTaxonomy(field, value)`
- pass both indexed-only and merged taxonomy props into `SettingsPanel`
- while `isManagingTaxonomy` is true, disable `onNewPost` and `onOpenPost` entry points so the active document cannot change until the global mutation finishes and refresh logic settles

Target shape for merged options:

```ts
const indexedFacets = useMemo(() => collectPostIndexFacets(posts), [posts])
const indexedCategories = indexedFacets.categories
const indexedTags = indexedFacets.tags
const availableCategories = useMemo(
  () => mergeAvailableTaxonomyOptions(indexedCategories, document?.frontmatter.categories ?? []),
  [indexedCategories, document?.frontmatter.categories],
)
const availableTags = useMemo(
  () => mergeAvailableTaxonomyOptions(indexedTags, document?.frontmatter.tags ?? []),
  [indexedTags, document?.frontmatter.tags],
)
```

Target shape for add:

```ts
const handleAddTaxonomy = (field: TaxonomyField, value: string) => {
  if (!document) {
    return
  }

  clearSaveSuccessMessageOnDirty()
  setTaxonomyMessage(null)
  setError(null)

  const nextValues = addTaxonomyValue(document.frontmatter[field], value)
  updateFrontmatter(field, nextValues)
  setTaxonomyMessage(`已新增${field === 'categories' ? '分类' : '标签'}：${value}（已加入当前文章）`)
}
```

Target shape for global rename/delete:

The app should render `taxonomyMessage` in a dedicated visible feedback area near the settings panel or editor status area, separate from the normal save button label, so messages like `已新增分类：洞察（已加入当前文章）` remain visible even while the draft is still dirty.

```ts
const handleRenameTaxonomy = async (field: TaxonomyField, from: string, to: string) => {
  if (!session || !document || isDirty) {
    return
  }

  setIsManagingTaxonomy(true)
  setTaxonomyMessage(null)
  setError(null)

  try {
    const result = await runGlobalTaxonomyOperation(
      session,
      { type: 'rename', field, from, to },
      { activePostPath },
    )
    setPosts(result.posts)
    if (result.activePostSave) {
      replaceDocument(parsePost(result.activePostSave))
      markSaved(parsePost(result.activePostSave))
    }
    setTaxonomyMessage(`已重命名${field === 'categories' ? '分类' : '标签'}：${from} → ${to}`)
  } catch (caughtError) {
    ...
  } finally {
    setIsManagingTaxonomy(false)
  }
}
```

Failure-handling rules inside `catch`:
- if `caughtError` is `GlobalTaxonomyOperationError` and `caughtError.cause instanceof GitHubAuthError`, call `handleAuthExpiry()`
- otherwise attempt repo resync in this order: `buildPostIndex(session)`, then if an article is open `fetchPostFile(session, activePostPath)` and refresh the editor from persisted content
- if that recovery resync hits `GitHubAuthError`, call `handleAuthExpiry()`
- if recovery resync fails for any other reason, keep the original taxonomy error visible and append a short recovery note such as `刷新最新仓库状态失败，请手动重新打开文章。`
- if no article is open, just keep the refreshed post index and clear any stale taxonomy success message

- [ ] **Step 4: Re-run the integration tests to verify they pass**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/App.taxonomy-management.test.tsx`

Expected: PASS

- [ ] **Step 5: Run the focused taxonomy suite**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/taxonomy/taxonomy-management.test.ts src/app/taxonomy/run-global-taxonomy-operation.test.ts src/app/layout/taxonomy-manager.test.tsx src/app/layout/settings-panel.test.tsx src/app/App.taxonomy-management.test.tsx`

Expected: PASS

- [ ] **Step 6: Optional checkpoint commit (only if the user explicitly asks for a commit)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" add admin-app/src/app/App.tsx admin-app/src/app/App.taxonomy-management.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" commit -m "feat: wire global taxonomy management"
```

## Task 5: Final verification, build, and review handoff

**Files:**
- Modify: any files touched above
- Build output: `source/admin/index.html`, `source/admin/assets/*` (if changed by the final build)

- [ ] **Step 1: Run the full targeted taxonomy-related suite**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test -- src/app/taxonomy/taxonomy-management.test.ts src/app/taxonomy/run-global-taxonomy-operation.test.ts src/app/layout/taxonomy-manager.test.tsx src/app/layout/settings-panel.test.tsx src/app/App.taxonomy-management.test.tsx src/app/App.save-flow.test.tsx src/app/App.indexing.test.tsx src/app/App.auth.test.tsx`

Expected: PASS

- [ ] **Step 2: Run the full admin-app test suite and production build**

Run:
`npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" test && npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/admin-app" build`

Expected:
- all Vitest tests PASS
- Vite build completes successfully
- tracked admin build outputs under `source/admin/` update cleanly if the bundle hash changed
- immediately inspect `git status` / `git diff -- source/admin` so hashed asset additions, modifications, and deletions are all reviewed and staged explicitly

- [ ] **Step 3: Run @superpowers:verification-before-completion before any completion claim**

Re-run the exact verification commands from Steps 1-2 in the same session and confirm the output shows:
- focused taxonomy-related suite PASS
- full `admin-app` suite PASS
- production build PASS

Do not claim the feature is finished, ready, or passing until those fresh command outputs are in hand.

- [ ] **Step 4: Request code review before merge**

Use @superpowers:requesting-code-review with:
- **WHAT_WAS_IMPLEMENTED:** compact in-app taxonomy add/rename/delete for categories and tags
- **PLAN_OR_REQUIREMENTS:** this plan + `docs/superpowers/specs/2026-04-20-global-taxonomy-management-design.md`
- **DESCRIPTION:** article-derived taxonomy management with clean-document guard for global rename/delete, sequential GitHub-backed mutations, draft-scoped temporary options, partial-failure resync, and current-document/post-list sync

Expected: resolve any Critical or Important issues before merge.

- [ ] **Step 5: Optional final commit (only if the user explicitly asks for a commit)**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" add admin-app/src/app/App.tsx admin-app/src/app/App.taxonomy-management.test.tsx admin-app/src/app/layout/settings-panel.tsx admin-app/src/app/layout/settings-panel.test.tsx admin-app/src/app/layout/taxonomy-manager.tsx admin-app/src/app/layout/taxonomy-manager.test.tsx admin-app/src/app/taxonomy/taxonomy-management.ts admin-app/src/app/taxonomy/taxonomy-management.test.ts admin-app/src/app/taxonomy/run-global-taxonomy-operation.ts admin-app/src/app/taxonomy/run-global-taxonomy-operation.test.ts admin-app/src/styles/app.css source/admin/index.html
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" add -A -- source/admin/assets
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io" commit -m "feat: add global taxonomy management"
```
