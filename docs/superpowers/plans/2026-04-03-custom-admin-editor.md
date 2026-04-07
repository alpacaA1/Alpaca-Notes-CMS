# Custom Admin Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current Decap-native `/admin/` experience with a custom writing and management workspace that preserves the existing GitHub OAuth flow, GitHub-backed Hexo markdown storage, and publish rules.

**Architecture:** Build a standalone `admin-app/` client that outputs generated static assets into `source/admin/`, authenticates through the existing Vercel-hosted GitHub OAuth service, reads and writes `source/_posts` through the GitHub Contents API, and treats frontmatter plus raw markdown as the canonical document model. Tiptap is used only as a derived rich-text editing surface over a supported markdown subset, with markdown mode as the safe fallback for unsupported content.

**Tech Stack:** Hexo, GitHub Pages, GitHub Contents API, Vercel serverless OAuth endpoints, Tiptap, Vite, Vitest, markdown/frontmatter parsing, browser session storage.

---

## File structure and responsibilities

### Existing files to modify
- `package.json` — add root scripts that build `admin-app/` before `hexo generate`.
- `package-lock.json` — lock any added root-level dependency changes.
- `.github/workflows/deploy-pages.yml` — only if the final build command must change beyond `npm run build`.
- `api/auth.js` — preserve behavior; only touch if shared auth constants/helpers are safely extracted.
- `api/callback.js` — preserve behavior; only touch if shared auth constants/helpers are safely extracted.
- `api/_lib/github-oauth.js` — preserve OAuth popup protocol; only touch for safe shared config extraction if needed.

### Existing files to retire from authored source
- `source/admin/index.html` — migrate to `docs/legacy-admin/index.html`, then replace with generated-only output from `admin-app/`.
- `source/admin/config.yml` — migrate to `docs/legacy-admin/config.yml`, then remove it from authored source so `source/admin/` is fully build-owned.

### New directories and files to create
- `admin-app/package.json` — standalone admin package.
- `admin-app/vite.config.ts` — admin build configuration and cleanup of generated `source/admin/` output before emit.
- `admin-app/vitest.config.ts` — admin test configuration.
- `admin-app/tsconfig.json` — admin TypeScript config.
- `admin-app/index.html` — Vite entry HTML for the admin app.
- `admin-app/scripts/build-smoke.test.ts` — build-owned-output smoke test for generated `source/admin/` assets.
- `admin-app/src/main.tsx` — app bootstrap.
- `admin-app/src/app/App.tsx` — top-level admin shell and layout routing.
- `admin-app/src/app/config.ts` — build-time config values for auth base URL, repo owner, repo name, branch, and posts path.
- `admin-app/src/app/login-gate.tsx` — owner-only login UI.
- `admin-app/src/app/session.ts` — token storage, login popup orchestration, logout, auth state hydration.
- `admin-app/src/app/github-client.ts` — GitHub Contents API wrapper for listing, fetching, and saving files.
- `admin-app/src/app/posts/post-types.ts` — shared document and list item types.
- `admin-app/src/app/posts/index-posts.ts` — build the client-side list index from repository contents.
- `admin-app/src/app/posts/parse-post.ts` — parse frontmatter + markdown body into canonical state.
- `admin-app/src/app/posts/serialize-post.ts` — serialize canonical state back into Hexo-compatible markdown.
- `admin-app/src/app/posts/new-post.ts` — timestamp filename generation, new-post defaults, and validation helpers.
- `admin-app/src/app/editor/use-editor-document.ts` — canonical document state, dirty tracking, mode switching, publish lock, unsaved navigation state.
- `admin-app/src/app/editor/rich-markdown.ts` — supported-subset detection plus markdown ↔ rich-mode conversion rules.
- `admin-app/src/app/editor/rich-editor.tsx` — Tiptap view layer over the supported markdown subset.
- `admin-app/src/app/editor/markdown-editor.tsx` — markdown-mode editing surface.
- `admin-app/src/app/editor/preview-pane.tsx` — approximate client-side preview.
- `admin-app/src/app/editor/unsupported-banner.tsx` — unsupported-content warning UI.
- `admin-app/src/app/layout/top-bar.tsx` — new post, search, filter, sort, save, preview, immersive toggle, status.
- `admin-app/src/app/layout/post-list-pane.tsx` — searchable/filterable/sortable post list.
- `admin-app/src/app/layout/settings-panel.tsx` — frontmatter editing panel.
- `admin-app/src/app/layout/immersive-mode.ts` — layout state for immersive writing.
- `admin-app/src/styles/app.css` — admin-specific styles.
- `docs/legacy-admin/config.yml` — relocated Decap config reference.
- `docs/legacy-admin/index.html` — relocated Decap admin reference.
- `source/admin/` — generated-only build output emitted by `admin-app/`.
- `docs/superpowers/plans/2026-04-03-custom-admin-editor.md` — this plan file.

### Tests to create
- `admin-app/scripts/build-smoke.test.ts`
- `admin-app/src/app/session.test.ts`
- `admin-app/src/app/posts/parse-post.test.ts`
- `admin-app/src/app/posts/serialize-post.test.ts`
- `admin-app/src/app/posts/new-post.test.ts`
- `admin-app/src/app/posts/index-posts.test.ts`
- `admin-app/src/app/editor/use-editor-document.test.ts`
- `admin-app/src/app/editor/rich-markdown.test.ts`
- `admin-app/src/app/layout/post-list-pane.test.tsx`
- `admin-app/src/app/layout/settings-panel.test.tsx`
- `admin-app/src/app/App.auth.test.tsx`
- `admin-app/src/app/App.indexing.test.tsx`
- `admin-app/src/app/App.editor-modes.test.tsx`
- `admin-app/src/app/App.preview.test.tsx`
- `admin-app/src/app/App.save-flow.test.tsx`

### Notes for implementers
- Keep files focused. Do not collapse parsing, serialization, API access, auth, and layout into one large file.
- Treat markdown body string as canonical. Do not treat Tiptap state as source of truth.
- Preserve current publish-lock and permalink-first-save rules from `source/admin/index.html` and `source/admin/config.yml`.
- Keep v1 media support minimal: preserve existing `/uploads/...` references; do not add upload UI.
- `source/admin/` is generated-only output. Do not hand-edit files there.
- Use **npm workspaces** rooted in the repo `package.json` with `admin-app` as a workspace and a single root `package-lock.json`.
- Do **not** create or depend on `admin-app/package-lock.json`.
- Production config in `admin-app/src/app/config.ts` must default to:
  - auth base URL: `https://alpaca-notes-cms.vercel.app`
  - repo owner: `alpacaA1`
  - repo name: `Alpaca-Notes-CMS`
  - branch: `main`
  - posts path: `source/_posts`

## Task 1: Scaffold the standalone admin app build pipeline

**Files:**
- Create: `admin-app/package.json`
- Create: `admin-app/vite.config.ts`
- Create: `admin-app/vitest.config.ts`
- Create: `admin-app/tsconfig.json`
- Create: `admin-app/index.html`
- Create: `admin-app/scripts/build-smoke.test.ts`
- Create: `admin-app/src/main.tsx`
- Create: `admin-app/src/app/App.tsx`
- Create: `admin-app/src/styles/app.css`
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `docs/legacy-admin/config.yml`
- Create: `docs/legacy-admin/index.html`
- Modify: `source/admin/` via build output only
- Test: `admin-app/scripts/build-smoke.test.ts`
- Test: `npm run build`

- [ ] **Step 1: Write the failing build smoke test**

Create `admin-app/scripts/build-smoke.test.ts` to assert that:
- the custom admin build emits generated assets into `source/admin/`
- the generated entrypoint is no longer the Decap runtime shell
- `source/admin/` is fully build-owned after migration, not a mixed Decap/custom directory
- a stale sentinel file created under `source/admin/` before the build is removed by the cleanup step

- [ ] **Step 2: Run smoke test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- build-smoke`
Expected: FAIL because no standalone admin app or generated output contract exists yet.

- [ ] **Step 3: Write minimal build integration**

Implement the smallest working admin build pipeline:
- create the standalone `admin-app/` package with Vite/Vitest config
- configure root `package.json` to use npm workspaces with `admin-app` and keep a single root `package-lock.json`
- copy or move `source/admin/index.html` to `docs/legacy-admin/index.html`
- copy or move `source/admin/config.yml` to `docs/legacy-admin/config.yml`
- add root build scripts that run the admin build before Hexo
- make `admin-app/vite.config.ts` or a root prebuild script clean stale files from `source/admin/` before emit
- emit generated assets into `source/admin/`

- [ ] **Step 4: Run build verification to confirm the generated admin output exists**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" run build`
Expected: PASS and generated admin assets exist under `source/admin/`, then Hexo generates `public/admin/...`.

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add package.json package-lock.json admin-app docs/legacy-admin source/admin
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: scaffold custom admin build"
```

## Task 2: Implement config and OAuth session handling

**Files:**
- Create: `admin-app/src/app/config.ts`
- Create: `admin-app/src/app/session.ts`
- Create: `admin-app/src/app/login-gate.tsx`
- Modify: `admin-app/src/app/App.tsx`
- Test: `admin-app/src/app/session.test.ts`
- Test: `admin-app/src/app/App.auth.test.tsx`

- [ ] **Step 1: Write the failing session tests**

Cover:
- production config defaults in `config.ts` are exactly:
  - `https://alpaca-notes-cms.vercel.app`
  - `alpacaA1`
  - `Alpaca-Notes-CMS`
  - `main`
  - `source/_posts`
- popup URL is derived from the configured auth base URL
- GitHub Contents API paths are derived from configured repo owner, repo name, branch, and posts path
- only accept popup messages from configured auth origin
- ignore unrelated `postMessage` events
- send one acknowledgment back to the popup after receiving `authorizing:github`
- reject login when `window.open` returns `null`
- surface popup timeout/close as login failure
- store token in memory plus `sessionStorage`
- clear session state on logout

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- session App.auth`
Expected: FAIL because config/session modules and login gate do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement:
- build-time config constants with the exact production defaults above
- popup launcher for `${AUTH_BASE_URL}/api/auth`
- origin-validated message listener for `authorizing:github` and terminal auth messages
- one-time popup acknowledgment to the configured auth origin
- popup blocked/closed/timeout handling
- session hydration from `sessionStorage`
- logout and expired-token reset path
- login gate UI mounted by `App.tsx`

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- session App.auth`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/config.ts admin-app/src/app/session.ts admin-app/src/app/login-gate.tsx admin-app/src/app/App.tsx admin-app/src/app/session.test.ts admin-app/src/app/App.auth.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add admin auth session flow"
```

## Task 3: Implement GitHub repository access and post indexing

**Files:**
- Create: `admin-app/src/app/github-client.ts`
- Create: `admin-app/src/app/posts/post-types.ts`
- Create: `admin-app/src/app/posts/index-posts.ts`
- Test: `admin-app/src/app/posts/index-posts.test.ts`
- Test: `admin-app/src/app/App.indexing.test.tsx`

- [ ] **Step 1: Write the failing indexing tests**

Cover:
- listing post files from `source/_posts`
- parsing enough metadata for list rows
- representing legacy missing `published` as published in UI state
- search by title/permalink
- filter by publish state/category/tag
- sort by date/title only
- clearing session state and returning to login gate when GitHub API returns 401/403 during indexing

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- index-posts App.indexing`
Expected: FAIL because GitHub client and indexer are not implemented.

- [ ] **Step 3: Write minimal implementation**

Implement:
- authenticated Contents API reads
- lightweight session-scoped post indexing
- list item normalization with publish-state display rules
- pure helpers for search/filter/sort
- auth-expiry handling for load/index operations

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- index-posts App.indexing`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/github-client.ts admin-app/src/app/posts/post-types.ts admin-app/src/app/posts/index-posts.ts admin-app/src/app/posts/index-posts.test.ts admin-app/src/app/App.indexing.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add post indexing and repo client"
```

## Task 4: Implement frontmatter parsing and serialization

**Files:**
- Create: `admin-app/src/app/posts/parse-post.ts`
- Create: `admin-app/src/app/posts/serialize-post.ts`
- Test: `admin-app/src/app/posts/parse-post.test.ts`
- Test: `admin-app/src/app/posts/serialize-post.test.ts`

- [ ] **Step 1: Write the failing parser/serializer tests**

Cover:
- parse frontmatter and raw markdown body
- preserve legacy missing `permalink`
- write back missing `published` as `true` on save
- serialize `date` as `YYYY-MM-DD HH:mm:ss`
- preserve markdown body exactly when untouched

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- parse-post serialize-post`
Expected: FAIL because parser and serializer do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement pure parsing/serialization helpers that:
- separate frontmatter object from markdown body string
- normalize legacy rules without changing URL semantics
- serialize required fields in the existing content format
- keep markdown body untouched unless intentionally edited

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- parse-post serialize-post`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/posts/parse-post.ts admin-app/src/app/posts/serialize-post.ts admin-app/src/app/posts/parse-post.test.ts admin-app/src/app/posts/serialize-post.test.ts
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add post parsing and serialization"
```

## Task 5: Implement new-post creation rules

**Files:**
- Create: `admin-app/src/app/posts/new-post.ts`
- Modify: `admin-app/src/app/posts/post-types.ts`
- Test: `admin-app/src/app/posts/new-post.test.ts`

- [ ] **Step 1: Write the failing new-post tests**

Cover:
- generate timestamp filename `YYYYMMDDHHmmss.md`
- initialize default frontmatter
- require `title`, `date`, `desc` on every save
- require `permalink` before first save of new posts
- keep `published: false` as default

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- new-post`
Expected: FAIL because new-post helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement:
- timestamp-based file path creation
- default document factory
- save-time validation helpers
- explicit first-save permalink validation for new posts only

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- new-post`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/posts/new-post.ts admin-app/src/app/posts/post-types.ts admin-app/src/app/posts/new-post.test.ts
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add new post creation rules"
```

## Task 6: Implement canonical editor document state

**Files:**
- Create: `admin-app/src/app/editor/use-editor-document.ts`
- Test: `admin-app/src/app/editor/use-editor-document.test.ts`

- [ ] **Step 1: Write the failing editor-state tests**

Cover:
- maintain canonical state with frontmatter + raw markdown body
- dirty tracking
- mode switching
- unsupported rich-mode fallback flag
- publish-lock enforcement signal for already-published posts
- browser `beforeunload` warning for dirty state
- switching to another post while dirty
- starting a new post while dirty
- clearing navigation warning after successful save

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- use-editor-document`
Expected: FAIL because canonical document state hook does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement the smallest state container that:
- loads canonical document data
- exposes frontmatter/body update methods
- tracks dirty state and unsupported-content status
- blocks published-to-draft transitions
- exposes unsaved-navigation guard state for `beforeunload` and in-app document switching

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- use-editor-document`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/editor/use-editor-document.ts admin-app/src/app/editor/use-editor-document.test.ts
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add canonical editor document state"
```

## Task 7: Implement markdown/rich conversion boundaries

**Files:**
- Create: `admin-app/src/app/editor/rich-markdown.ts`
- Test: `admin-app/src/app/editor/rich-markdown.test.ts`

- [ ] **Step 1: Write the failing conversion tests**

Cover:
- supported rich-mode subset: paragraphs, headings, blockquotes, ordered lists, unordered lists, links, code blocks, horizontal rules, bold, and italic
- detect whether a document belongs to that supported subset
- convert supported markdown into rich-editor input
- serialize supported rich-editor output back to markdown
- unsupported cases: raw HTML blocks, custom markdown extensions, and media/image syntax not explicitly declared supported
- refuse unsupported markdown constructs without data loss and force markdown-mode fallback

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- rich-markdown`
Expected: FAIL because conversion helpers do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement a dedicated conversion module that owns subset detection and markdown/rich-mode conversion rules, keeping this logic out of UI components.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- rich-markdown`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/editor/rich-markdown.ts admin-app/src/app/editor/rich-markdown.test.ts
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add markdown rich-mode conversion rules"
```

## Task 8: Implement the management pane and top-bar controls

**Files:**
- Create: `admin-app/src/app/layout/top-bar.tsx`
- Create: `admin-app/src/app/layout/post-list-pane.tsx`
- Create: `admin-app/src/app/layout/immersive-mode.ts`
- Modify: `admin-app/src/app/App.tsx`
- Test: `admin-app/src/app/layout/post-list-pane.test.tsx`

- [ ] **Step 1: Write the failing layout tests**

Cover:
- list renders normalized metadata
- search, filter, and sort controls update visible rows
- clicking a post opens it
- top bar shows `New post`, `Search`, `Filter`, `Sort`, `Save`, `Preview`, `Immersive toggle`, and current document status
- immersive toggle hides/collapses the list pane
- quick create starts a new document

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- post-list-pane`
Expected: FAIL because layout components do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement:
- top bar controls for new post, search, filter, sort, save, preview, immersive mode, and status
- left management pane with search/filter/sort UI
- immersive layout state
- integration into the root app shell

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- post-list-pane`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/layout/top-bar.tsx admin-app/src/app/layout/post-list-pane.tsx admin-app/src/app/layout/immersive-mode.ts admin-app/src/app/App.tsx admin-app/src/app/layout/post-list-pane.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add admin management layout"
```

## Task 9: Implement the settings panel and save validation UI

**Files:**
- Create: `admin-app/src/app/layout/settings-panel.tsx`
- Modify: `admin-app/src/app/editor/use-editor-document.ts`
- Test: `admin-app/src/app/layout/settings-panel.test.tsx`

- [ ] **Step 1: Write the failing settings tests**

Cover:
- editing title/date/desc/published/categories/tags/permalink
- validation errors for required fields
- legacy permalink omission remains allowed for existing posts
- published posts cannot be switched back to draft

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- settings-panel`
Expected: FAIL because settings panel and validation UI do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement a focused metadata panel wired to canonical document state and save validation errors.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- settings-panel`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/layout/settings-panel.tsx admin-app/src/app/editor/use-editor-document.ts admin-app/src/app/layout/settings-panel.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add post settings panel"
```

## Task 10: Implement markdown mode, rich mode, and unsupported-content fallback

**Files:**
- Create: `admin-app/src/app/editor/markdown-editor.tsx`
- Create: `admin-app/src/app/editor/rich-editor.tsx`
- Create: `admin-app/src/app/editor/unsupported-banner.tsx`
- Modify: `admin-app/src/app/App.tsx`
- Modify: `admin-app/src/app/editor/use-editor-document.ts`
- Modify: `admin-app/src/app/editor/rich-markdown.ts`
- Test: `admin-app/src/app/App.editor-modes.test.tsx`

- [ ] **Step 1: Write the failing editor-mode tests**

Cover:
- markdown mode always available
- supported documents using only paragraphs, headings, blockquotes, ordered lists, unordered lists, links, code blocks, horizontal rules, bold, and italic open in rich mode
- unsupported documents containing raw HTML blocks, custom markdown extensions, or unsupported media/image syntax show the banner and stay safe in markdown mode
- mode switches preserve canonical markdown for supported docs

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- App.editor-modes`
Expected: FAIL because editor surfaces and fallback UI are not implemented.

- [ ] **Step 3: Write minimal implementation**

Implement:
- markdown editor surface
- Tiptap rich editor for supported subset
- unsupported-content warning banner
- app integration that never drops unsupported content

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- App.editor-modes`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/editor/markdown-editor.tsx admin-app/src/app/editor/rich-editor.tsx admin-app/src/app/editor/unsupported-banner.tsx admin-app/src/app/App.tsx admin-app/src/app/editor/use-editor-document.ts admin-app/src/app/editor/rich-markdown.ts admin-app/src/app/App.editor-modes.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add dual editor modes"
```

## Task 11: Implement preview mode

**Files:**
- Create: `admin-app/src/app/editor/preview-pane.tsx`
- Modify: `admin-app/src/app/App.tsx`
- Test: `admin-app/src/app/App.preview.test.tsx`

- [ ] **Step 1: Write the failing preview tests**

Cover:
- preview renders approximate markdown output
- preview can coexist with unsupported-content warnings
- preview does not claim exact Hexo/theme fidelity

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- App.preview`
Expected: FAIL for preview assertions because preview pane does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement a simple client-side preview that is clearly approximate and safe for v1.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- App.preview`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/editor/preview-pane.tsx admin-app/src/app/App.tsx admin-app/src/app/App.preview.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add editor preview mode"
```

## Task 12: Implement save flow, auth-expiry handling, and conflict handling

**Files:**
- Modify: `admin-app/src/app/github-client.ts`
- Modify: `admin-app/src/app/App.tsx`
- Modify: `admin-app/src/app/editor/use-editor-document.ts`
- Test: `admin-app/src/app/App.save-flow.test.tsx`

- [ ] **Step 1: Write the failing save-flow tests**

Cover:
- save sends serialized markdown with current SHA
- save conflict surfaces a reload message
- save failure preserves dirty local state
- successful save refreshes list metadata
- 401/403 responses during fetch/save clear session state and return the user to the login gate

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- App.save-flow`
Expected: FAIL for save/conflict/auth-expiry cases because write flow is not complete yet.

- [ ] **Step 3: Write minimal implementation**

Implement:
- GitHub file update/create calls
- stale-SHA conflict detection
- save success/failure status handling
- list refresh after save
- auth-expiry handling for fetch and save paths

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test -- App.save-flow`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add admin-app/src/app/github-client.ts admin-app/src/app/App.tsx admin-app/src/app/editor/use-editor-document.ts admin-app/src/app/App.save-flow.test.tsx
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: add save flow and conflict handling"
```

## Task 13: Verify the integrated admin build end-to-end

**Files:**
- Modify: files found necessary during verification only
- Test: admin app test suite and Hexo build output

- [ ] **Step 1: Run focused admin tests**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan/admin-app" test`
Expected: PASS

- [ ] **Step 2: Run full site build**

Run: `npm --prefix "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" run build`
Expected: PASS and generated custom admin assets appear in `public/admin/`.

- [ ] **Step 3: Manually verify critical behaviors**

Check:
- login gate renders when unauthenticated
- successful login only works for the allowed owner account
- owner-only enforcement is still present in `api/_lib/github-oauth.js` via `assertAllowedOwner` and is still called by `api/callback.js`
- if a live non-owner negative test is impractical, document backend contract verification against those exact files instead of skipping the check
- list pane shows posts with correct draft/published status
- new post defaults are correct
- markdown/rich/preview modes behave as specified
- immersive mode hides management chrome
- dirty navigation warns before losing work
- published posts cannot revert to draft

- [ ] **Step 4: Fix only verification failures if needed**

If tests or manual checks fail, patch the smallest responsible files and rerun only the failing verification command first, then rerun the full build.

- [ ] **Step 5: Commit**

```bash
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" add -A
git -C "/Users/tianxucheng/Documents/analyze-data/alpacaA1.github.io/.worktrees/custom-admin-editor-plan" commit -m "feat: finish custom admin editor v1"
```
