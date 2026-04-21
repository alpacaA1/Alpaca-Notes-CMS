# Global Taxonomy Management Design

**Date:** 2026-04-20
**Project:** `alpacaA1.github.io`
**Status:** Approved in conversation, pending written-spec review

## Goal

Add a minimal global taxonomy management flow to the admin editor so categories and tags can be added, renamed, and deleted without leaving the current editing surface.

This version is intentionally optimized for fast development, focused testing, and immediate rollout.

## Approved product decisions

- Management stays inside the existing editor/settings flow.
- There is no separate taxonomy page in v1.
- The feature must support category and tag add / rename / delete.
- Rename and delete are global operations across indexed posts.
- The implementation should stay simple and avoid a new standalone taxonomy storage system.
- If the currently open article is affected by a taxonomy change, the editor should update immediately.
- Empty and duplicate taxonomy names must be rejected.
- Delete must require confirmation.

## Scope

### In scope
- Add a compact taxonomy-management UI inside the existing settings panel.
- Support adding a new category or tag from the current article context.
- Support globally renaming an existing category or tag across indexed posts.
- Support globally deleting an existing category or tag across indexed posts.
- Refresh indexed taxonomy options immediately after management actions complete.
- Keep the current article in sync when it is affected by a rename or delete.
- Add focused tests for the new management flows.

### Out of scope
- A separate taxonomy-management page.
- A persistent standalone taxonomy registry file.
- Creating an unused global taxonomy that exists without any article referencing it.
- Bulk merge tools beyond simple rename.
- Reordering taxonomies, usage analytics, or history.
- Undo/rollback UI for global rename/delete.
- Converting a category into a tag or vice versa.

## Existing surfaces affected

- settings panel layout and field wiring in `admin-app/src/app/layout/settings-panel.tsx`
- taxonomy selector behavior in `admin-app/src/app/layout/taxonomy-multi-select.tsx`
- app-level post state, active document sync, and busy/error handling in `admin-app/src/app/App.tsx`
- post parsing / serialization helpers already used for frontmatter changes under `admin-app/src/app/posts/*`
- GitHub-backed file fetch/save flow in `admin-app/src/app/github-client.ts`
- settings-panel and app flow tests under `admin-app/src/app/*.test.tsx`

## Design

## 1. Taxonomy model: stay article-derived

### Direction
This feature should keep the current source of truth: categories and tags are derived from article frontmatter, not from a separate taxonomy table.

### Rules
- Indexed taxonomy options continue to come from scanning post frontmatter.
- Rename and delete operate on existing indexed terms only.
- Add does **not** create a free-standing global taxonomy record.
- Adding a taxonomy value should attach it to the currently open article immediately so it becomes part of the article-derived model.
- Because the manager lives inside the settings panel, v1 taxonomy actions require an open article; there is no separate no-document management surface.

### Consequence
This means v1 can support real global rename/delete without inventing a new persistence layer, but “create a taxonomy that no article uses yet” stays out of scope.

## 2. UI placement: lightweight manager inside the settings panel

### Direction
The management controls should live directly below the existing `分类` and `标签` selectors in the settings panel so the user can manage taxonomy where they already edit article metadata.

### Layout
Each taxonomy block should keep the current multi-select UI and add a compact management section beneath it:
- a small `新增分类` / `新增标签` input row
- a compact list of currently indexed terms
- inline `重命名` and `删除` actions for each term

The goal is a practical editor tool, not a separate admin surface.

### Interaction style
- Only one rename row per taxonomy type should be editable at a time.
- Controls should stay text-first and compact.
- The UI should reuse the existing settings panel tone and spacing instead of introducing a new modal-heavy workflow.

## 3. Add flow: create from the current article context

### Direction
Because taxonomy remains article-derived, add must be anchored to the current article.

### Rules
- Add is available only when an article is open.
- Entering a new category/tag and confirming add should:
  1. normalize and validate the value
  2. append it to the current article’s selected categories/tags if not already present
  3. add it to the current in-memory available taxonomy options immediately
- The current draft becomes dirty through the normal editor flow.
- Persistence still happens through the normal article save button.
- In v1, a newly added term becomes part of the global taxonomy only after the current article is saved and the post index is refreshed.

### Unsaved lifecycle
- Unsaved newly added terms are visible only while that draft stays open in the current session.
- If the user reloads, opens another article, or otherwise discards the unsaved draft before saving, the temporary taxonomy option should disappear with that draft state.

### Validation
- Trim whitespace.
- Reject empty values.
- Reject duplicates after normalization.
- Reuse the existing normalized comparison style already used by taxonomy selection.

### Result
This gives the user a fast “create and use it now” path without adding a separate taxonomy database.

## 4. Global rename flow

### Direction
Rename should update every indexed post that currently uses the selected category or tag.

### Rules
- Rename starts from an existing indexed term.
- The replacement value is normalized before comparison.
- Empty or duplicate replacements are rejected.
- If the replacement normalizes to the same value as the original term, treat it as a no-op and reject it in v1.
- Rename applies only to exact normalized matches within the chosen taxonomy type.
- Categories only rename categories; tags only rename tags.

### Batch update behavior
The app should run a focused batch mutation flow:
1. list markdown post files
2. fetch candidate files
3. parse frontmatter
4. replace the exact matched taxonomy value in the relevant array
5. serialize the article back to markdown
6. save only changed files

### Failure behavior
Rename is a multi-file GitHub-backed mutation and is not atomic in v1.
- Stop on the first fetch, parse, serialize, save, auth, or conflict failure.
- Do not attempt rollback for files already updated before the failure.
- After failure, refresh from the persisted repo state so the UI reflects what actually saved.
- Surface a partial-result message that includes how many files were changed before the failure and which file failed.

### Local sync behavior
After rename completes successfully:
- rebuild or refresh the post index once
- update the current article in memory if it contained the renamed taxonomy
- refresh available category/tag options immediately
- surface one success message that clearly says what changed

### Non-goal
v1 does not need a separate preview screen or diff review before applying rename.

## 5. Global delete flow

### Direction
Delete should remove the chosen category or tag from every indexed post that currently uses it.

### Rules
- Delete starts from an existing indexed term.
- Delete must show a confirmation step before the batch mutation runs.
- Delete removes only the chosen taxonomy value from the relevant array.
- All other frontmatter fields and article body content stay unchanged.

### Batch update behavior
Delete uses the same batch mutation pipeline as rename, but the mutation removes the matched term instead of replacing it.

### Failure behavior
Delete follows the same non-atomic v1 rule as rename.
- Stop on the first fetch, parse, serialize, save, auth, or conflict failure.
- Do not attempt rollback for files already updated before the failure.
- After failure, refresh from the persisted repo state so the UI reflects what actually saved.
- Surface a partial-result message that includes how many files were changed before the failure and which file failed.

### Local sync behavior
After delete completes successfully:
- affected post index items should no longer expose the removed taxonomy value
- the currently open article should immediately drop the removed value if it had it
- the available taxonomy list should no longer include the deleted term

## 6. Safety rule: require a clean current document before global rename/delete

### Direction
Global rename/delete should avoid colliding with unsaved local article edits.

### Rule
- If the current article has unsaved changes, global rename/delete controls should be disabled.
- The panel should show a short note telling the user to save the current article first.

### Why
This is the smallest safe way to avoid merging global frontmatter mutations with unrelated unsaved local edits in v1.

### Exception
Add does not need this restriction because it intentionally edits the current draft.

## 7. App state and execution model

### Direction
Global taxonomy mutations should be treated as app-level busy operations, similar in seriousness to save/open flows.

### Required state
Add a dedicated busy state for taxonomy management so the app can:
- disable repeated taxonomy actions while one is running
- keep error/success messaging coherent
- prevent overlapping rename/delete submissions

### Execution style
For v1, run taxonomy batch mutations sequentially. This is simpler, easier to reason about, and safer for a small personal content repo than introducing parallel mutation logic.

### Post-operation refresh
After a successful rename/delete run, the app should refresh its post list from the updated results once, not after every individual file mutation.

## 8. Suggested module boundaries

### Direction
Keep the UI thin and move batch taxonomy mutation logic into a dedicated helper instead of burying it inside `App.tsx`.

### Suggested split
- `settings-panel.tsx`: render controls and emit management intents
- `App.tsx`: orchestration, busy state, messages, current-document sync
- a new focused helper under `admin-app/src/app/posts/` or `admin-app/src/app/taxonomy/`: normalize values, compute mutations, and apply rename/delete across fetched posts

### Why
This keeps the global mutation logic testable without forcing large UI-driven test setups for every branch.

## 9. Error handling and user feedback

### Validation errors
Surface immediate inline or nearby errors for:
- empty taxonomy value
- duplicate taxonomy value
- rename target matching an existing term

### Runtime errors
Surface app-level errors for:
- fetch failure during taxonomy scan
- save failure for any affected file
- auth expiry during batch mutation
- stale save conflicts or unexpected GitHub API failures

### Success messages
Keep success feedback short and explicit, for example:
- `已新增分类：思考（已加入当前文章）`
- `已重命名标签：记录 → 月记`
- `已删除分类：生活`

The message should reflect whether the action was local-draft add or global mutation.

## 10. Testing strategy

### Update existing settings-panel coverage
Add focused settings-panel tests for:
- adding a new category/tag attaches it to the current article selection
- add rejects empty and duplicate values
- rename enters inline edit mode and validates empty/duplicate targets
- delete requires confirmation before firing
- global rename/delete controls are disabled when the current article is dirty

### Add app-level flow coverage
Add targeted app tests for:
- global rename updates indexed post metadata and the currently open article
- global delete removes the taxonomy from indexed posts and the current article
- add immediately exposes the new taxonomy option in the current session and marks the draft dirty
- auth expiry during rename/delete resets the session like other GitHub-backed mutations
- runtime failure during rename/delete preserves the current UI state and surfaces an error

### Keep tests tight
Do not build a broad matrix of taxonomy UI permutations. Favor:
- one focused helper test layer for mutation logic
- one focused component test layer for settings-panel interactions
- a small number of app integration tests for end-to-end rename/delete behavior

## Recommended implementation order

1. Add the taxonomy-management UI contract to the settings panel.
2. Add normalization and validation helpers for taxonomy management actions.
3. Implement add-to-current-article behavior.
4. Implement the batch rename helper and app orchestration.
5. Implement the batch delete helper and confirmation flow.
6. Refresh post index / current document sync after mutations.
7. Add focused settings-panel, helper, and app tests.

## Acceptance criteria

- The settings panel exposes compact management controls for both categories and tags.
- Adding a new category/tag immediately adds it to the current article selection and to the current session’s available taxonomy options.
- Add rejects empty and duplicate values.
- Rename updates the chosen taxonomy across indexed posts of the relevant type only.
- Delete removes the chosen taxonomy across indexed posts of the relevant type only.
- Delete requires confirmation before applying.
- Rename and delete are disabled while the current article has unsaved changes.
- If the current article is affected by rename/delete, the open editor updates immediately after the operation completes.
- The post list reflects updated category/tag metadata after global mutations.
- Auth expiry and GitHub failures reuse the existing app error/session handling behavior.
- The implementation does not introduce a standalone taxonomy registry.
- The implementation does not add a separate taxonomy management page.
- Tests cover add, rename, delete, dirty-state restrictions, and current-article sync.
