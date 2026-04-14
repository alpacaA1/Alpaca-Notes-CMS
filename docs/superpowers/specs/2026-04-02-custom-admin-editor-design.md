# Custom Admin Editor Design

**Date:** 2026-04-02
**Project:** `alpacaA1.github.io`
**Status:** Approved in conversation, pending written-spec review
**Supersedes:** `docs/superpowers/specs/2026-04-01-online-post-editor-design.md` for admin UI direction only

## Goal

Replace the current Decap-native editing experience with a custom `/admin/` editor that improves both article management and writing experience, while preserving the existing GitHub OAuth flow, GitHub-backed markdown storage, and Hexo frontmatter content model.

The new admin should feel like a focused writing workspace rather than a generic CMS form.

## Confirmed product decisions

### Direction
- Build a custom admin shell instead of continuing with Decap's native editor UI
- Do **not** include AI polishing in v1
- Optimize **both** article management and writing workflow in v1
- Support **dual editing modes**:
  - rich editor mode for comfortable writing
  - markdown mode for precise source control
- Support an **immersive writing mode** with expanded editor width and reduced UI chrome
- Keep the current backend model:
  - existing GitHub OAuth service
  - GitHub repository as source of truth
  - Hexo-compatible markdown files in `source/_posts`
  - existing frontmatter schema and publish rules

### v1 priorities
1. Search and filter posts quickly
2. Sort and jump into editing quickly
3. Make the writing surface smoother and more immersive
4. Preserve compatibility with existing content and deployment flow

## Why this replaces the previous UI direction

The earlier design chose Decap's native collection editor because it was the lowest-cost path to get online editing live. That remains a valid baseline for storage and auth, but it no longer matches the desired product shape.

The user now wants:
- stronger article management
- a more intentional writing experience
- dual-mode editing
- immersive writing

Those goals sit outside Decap's comfort zone and justify a custom admin UI while keeping the existing storage and authentication architecture.

## Scope

### In scope for v1
- Custom admin shell at `/admin/`
- Reuse the current GitHub OAuth backend and owner-only restriction
- Read posts from `source/_posts`
- List posts with searchable/filterable/sortable metadata
- Create a new post
- Open and edit an existing post
- Dual-mode editor:
  - rich editor mode using Tiptap
  - markdown source mode
- Preview mode
- Immersive writing mode
- Settings panel for frontmatter fields
- Save back to GitHub as Hexo-compatible markdown
- Preserve published/draft rules already established in the project

### Out of scope for v1
- AI polishing or generation
- Multi-user collaboration
- Batch operations
- Media library redesign
- Scheduled publishing
- Content comments or review workflows
- A custom visual page builder
- Replacing Hexo or GitHub Pages
- Replacing the current OAuth provider model

## Repository and deployment contract

This section is the source-of-truth contract for implementation.

### Target repository
- The repository of record is **`alpacaA1/Alpaca-Notes-CMS`**
- The target branch is **`main`**
- The local working directory is named `alpacaA1.github.io`, but its Git remote points to `alpacaA1/Alpaca-Notes-CMS`
- The custom admin reads from and writes to this same repository and branch

### Relationship to deployment
- The existing GitHub Actions workflow in `.github/workflows/deploy-pages.yml` builds and deploys GitHub Pages on pushes to `main`
- Therefore, a successful save from the admin that commits to `alpacaA1/Alpaca-Notes-CMS@main` is the direct trigger for the next Pages build
- V1 does **not** introduce a second content repo, a sync repo, or a separate publishing branch

### Content location
- Posts remain in `source/_posts`
- Each file remains a Hexo markdown document with frontmatter + body
- The repository remains the only content source of truth

## Authentication contract

The custom admin must reuse the existing owner-only GitHub OAuth flow, but the runtime boundary must stay explicit.

### Existing backend pieces to preserve
- OAuth state/callback helpers in `api/_lib/github-oauth.js`
- auth entrypoint in `api/auth.js`
- callback exchange in `api/callback.js`
- owner restriction via `GITHUB_OWNER`

### Hosting boundary
- The admin UI is served as static content from GitHub Pages under `/admin/`
- The OAuth service continues to be hosted separately at the current auth base URL: **`https://alpaca-notes-cms.vercel.app`**
- The custom admin starts login through `https://alpaca-notes-cms.vercel.app/api/auth`
- GitHub redirects back to `https://alpaca-notes-cms.vercel.app/api/callback`
- The callback page returns the token to the opener window via `postMessage`, matching the current popup-based behavior

### OAuth popup protocol
V1 should keep the current popup contract rather than inventing a new auth transport.

#### Start URL
- The opener window launches `https://alpaca-notes-cms.vercel.app/api/auth` in a popup

#### Expected popup origin
- The opener only accepts auth messages from the configured auth base URL origin
- In production, that origin is `https://alpaca-notes-cms.vercel.app`
- In local development, the accepted origin follows the local auth base URL configured at build time
- Messages from any other origin must be ignored

#### Message flow
1. the opener launches the popup
2. the popup completes GitHub auth on the Vercel-hosted callback page
3. the popup sends the existing readiness message: `authorizing:github`
4. when the opener receives that message from `https://alpaca-notes-cms.vercel.app`, it replies once to the popup with a simple acknowledgment via `postMessage` to that same origin
5. the popup then sends one terminal message back to the opener:
   - `authorization:github:success:{...}` or
   - `authorization:github:error:{...}`
6. the opener validates the sender origin again, resolves login on success, and surfaces the returned error payload on failure

#### Failure handling
- If the popup is blocked, the app shows a retry path
- If the popup is closed before a terminal auth message arrives, the app returns to the login gate and offers retry
- If no terminal auth message arrives within a short timeout window, v1 should treat the attempt as failed and offer retry

### Session behavior
- Unauthenticated users see a login gate
- On success, the admin app receives the GitHub access token and uses it for repository operations
- The token is stored for the current browser session only
- V1 should prefer in-memory state plus `sessionStorage` for refresh resilience
- V1 must **not** use `localStorage` for long-lived token persistence
- Logout clears client-side session state and returns the user to the login gate
- If the token expires or is missing, the app returns the user to the login gate

### Runtime configuration
The admin app must have an explicit config for:
- auth base URL
- repo owner
- repo name
- branch
- posts path

For v1, these values should resolve to:
- auth base URL: `https://alpaca-notes-cms.vercel.app`
- repo: `alpacaA1/Alpaca-Notes-CMS`
- branch: `main`
- posts path: `source/_posts`

### Config delivery mechanism
- V1 uses **build-time embedded constants** in the admin bundle
- V1 does **not** fetch a remote runtime config file at page load
- Local development may override these values through the admin app's local build environment, but production Pages output is fixed at build time

## Build and deployment boundary

The custom admin is a client application, so the build contract must be explicit.

### Source and output locations
- Admin source code should live outside generated static content, in a dedicated app directory such as `admin-app/`
- The admin build output should be emitted into `source/admin/`
- `source/admin/` becomes a **generated-only** directory owned by the custom admin build
- `source/admin/` is the deployed static admin entrypoint and asset directory

### Build behavior
- `npm run build` must be updated so the admin app is built before `hexo generate`
- The v1 build sequence should be:
  1. build admin assets into `source/admin/`
  2. run `hexo generate`
  3. upload `public/` through the existing Pages workflow

### Migration note
- The new admin UI no longer depends on Decap at runtime
- The current Decap files under `source/admin/` are migration references only and must be moved to a non-generated location such as `docs/legacy-admin/` before the custom build fully owns `source/admin/`
- After that migration, the custom UI must not depend on Decap rendering or on files that live inside the generated `source/admin/` directory

## Content model

The new editor must preserve the existing frontmatter schema established by the current project.

### Fields
- `title`
- `date`
- `desc`
- `published`
- `categories`
- `tags`
- `permalink`
- `body`

### Compatibility requirements
- Existing posts without `published` are shown as **published** in the management list and treated as published when loaded
- Existing posts without `permalink` remain editable without forced backfill
- Saving a legacy post must not silently change its URL behavior
- New and existing posts must serialize back into Hexo-compatible markdown

### Legacy serialization rules
- If a legacy post is missing `published`, the editor treats it as published on load and displays it as published in list status UI
- When that legacy post is saved, the editor writes back `published: true` to match current project behavior
- If a legacy post is missing `permalink`, the editor preserves that omission unless the user explicitly adds a permalink

## New post contract

The new-post flow must preserve the current project's file and URL rules.

### File creation rule
- New posts are created in `source/_posts`
- New filenames must follow the current timestamp-based pattern from the existing admin setup:
  - `YYYYMMDDHHmmss.md`
- Filename generation is ASCII-safe and independent from the visible title

### Default frontmatter for new posts
- `title: ""`
- `date: <current timestamp formatted as YYYY-MM-DD HH:mm:ss>`
- `desc: ""`
- `published: false`
- `categories: []`
- `tags: []`
- `permalink: ""`

### Save-time validation rules
For v1, the following fields are required on every successful save, not only first save:
- `title`
- `date`
- `desc`

Additional new-post rule:
- `permalink` is required before the first successful save of a new post

### Date serialization rule
- `date` must serialize using the existing project format: `YYYY-MM-DD HH:mm:ss`
- the custom editor must preserve this format for both new posts and edited posts

### Permalink rule
- `permalink` is required for new posts on first save
- `permalink` is **not** auto-generated from Chinese titles in v1
- legacy posts without `permalink` stay editable without forced backfill
- once a post is published, permalink should be treated as stable and not auto-regenerated

## Canonical document model

The dual-mode editor must be defined around a lossless storage model.

### Canonical in-memory state
For v1, the authoritative document state is:
- file metadata: `path`, `sha`, legacy flags
- frontmatter object
- raw markdown body string

This canonical state is the storage truth inside the app.

### Rich mode relationship
- Tiptap rich mode is a **derived editing view** over the canonical markdown body
- Rich mode is only enabled for the supported markdown subset defined by v1
- After a successful rich-mode edit, the app serializes the rich document back into the canonical markdown string

### Fallback rule
- If an opened document contains unsupported markdown constructs that cannot be represented safely in rich mode, the app preserves the raw markdown body unchanged
- In that case, the app must show a clear banner and treat markdown mode as the safe editing mode
- Unsupported content must not be silently dropped, normalized away, or rewritten just because the user opened the post

This rule is more important than keeping rich mode available for every document.

## Supported rich-mode subset for v1

Rich mode in v1 only needs to support the common editorial structures the user is likely to use.

### Supported structures
- paragraphs
- headings
- blockquotes
- ordered lists
- unordered lists
- links
- code blocks
- horizontal rules
- inline emphasis such as bold and italic

### Out of scope in rich mode for v1
- arbitrary HTML blocks
- unsupported custom markdown extensions
- any markdown construct that cannot round-trip safely through the rich-mode serializer

## Media contract for v1

The project already uses the repository uploads convention defined by the current admin setup.

### Media behavior
- V1 does **not** add a media library UI
- V1 does **not** add an upload manager or browsing interface
- V1 does **not** support uploading new binaries from the custom admin UI
- Existing markdown image or file references, including `/uploads/...`, must be preserved unchanged
- New media references in v1 are added manually in markdown mode using the existing repository convention:
  - binary files are still expected to live under `source/uploads`
  - public references use `/uploads`
- Managing new binary files remains an out-of-band workflow in v1, outside the custom admin UI
- Rich mode may render simple existing markdown image syntax if it can do so safely, but image insertion and media editing are not required in rich mode for v1
- If a document depends on media syntax that rich mode cannot represent safely, markdown mode remains the editing path

## Admin information architecture

The admin page should be structured into four primary areas.

## 1. Top bar

The top bar holds global actions and current-document actions.

### Required controls
- New post
- Search input
- Filter trigger
- Sort trigger
- Save
- Preview
- Immersive mode toggle
- Current document status

### Design intent
The top bar should stay compact and operational, not become a large toolbar that competes with the writing surface.

## 2. Post management pane

The left pane is a management-first post list, replacing Decap's generic collection list.

### Each list item should show
- title
- draft/published state
- date
- lightweight category/tag summary when available

### V1 management capabilities
- Keyword search by title and permalink
- Filters for draft/published state
- Filters for category and tag
- Sorting by date and title
- Quick entry into edit mode
- Quick creation of a new post

### Explicitly not required in v1
- bulk editing
- bulk publish actions
- bulk tag/category changes
- most-recently-updated sorting
- Git-history-based update signals

## 3. Editor workspace

The center workspace is the primary writing surface.

### Modes
#### Rich mode
Use Tiptap to provide a smoother writing experience across the supported v1 markdown subset.

This mode is for comfort and flow.

#### Markdown mode
Provide direct markdown editing for precise control.

This mode is for users who want exact source visibility and fast manual adjustments.

#### Preview mode
Render the current document as a read-oriented preview.

This gives a fast confidence check before save/publish without leaving the editor.

### Preview fidelity contract
- V1 preview is an **approximate client-side markdown preview**
- V1 preview is **not** required to match final Hexo rendering or the production theme pixel-for-pixel
- Hexo-specific tags, theme-specific behavior, or unsupported custom markdown can render approximately, as raw text, or behind a warning banner
- Faithful full-site preview is out of scope for v1

### Mode principles
- The app edits one canonical document state, not separate source-of-truth copies per mode
- Switching modes must not silently drop content
- Rich mode is optional per document, not guaranteed for every legacy post
- Markdown mode is always the safe fallback

## 4. Settings panel

Metadata editing should live in a dedicated side panel or slide-out panel rather than cluttering the writing surface.

### Fields managed here
- title
- date
- desc
- published
- categories
- tags
- permalink

### Design intent
Keep the writing surface centered on body content while still making article metadata easy to edit.

## Immersive writing mode

Immersive mode is a first-class requirement.

### Behavior
- Collapse or hide the post management pane
- Reduce the top bar to minimal controls
- Expand the editor width
- Keep focus on body editing
- Preserve easy exit back to full admin mode

### Intent
The admin should be able to switch from “manage content” mode into “write deeply” mode without changing tools.

## List indexing strategy

V1 should optimize for clarity and reasonable speed, not for enterprise-scale content volumes.

### Indexing rule
- Enumerate post files under `source/_posts`
- Build a client-side list index from repository file contents by parsing frontmatter once per session
- Store only the metadata needed for list rendering, filtering, sorting, and quick open
- Do **not** add Git-history lookups in v1
- Do **not** add an `updated` field to the content model in v1

This keeps the list implementation simple and aligned with the current project size.

## Save and publish flow

## Loading a post
When the user opens a post:
1. fetch the markdown file from GitHub
2. parse frontmatter and body
3. normalize legacy behavior without silently changing semantics
4. populate canonical document state
5. derive rich-mode state only if the document fits the supported subset safely

## Saving a post
When the user saves:
1. validate required fields for the current workflow
2. enforce publish-state rules
3. serialize frontmatter and canonical markdown body back into Hexo-compatible markdown
4. write the file back to GitHub with the current file SHA
5. refresh local list metadata after success

## New post flow
When the user creates a new post:
1. create a new canonical document state
2. initialize the timestamp-based file path under `source/_posts`
3. initialize frontmatter with the defaults defined above
4. require first-save fields for new posts
5. write a new markdown file into the repo
6. return the new file path and updated list state

## Publish-state rule
Preserve the existing one-way publish rule:
- draft may remain draft
- draft may become published
- published stays published
- published must not revert to draft

This rule already exists in the current admin logic and must remain true in the custom editor.

## Error handling

V1 only needs practical, high-value safeguards.

### Required cases
- **Auth failure or expiry**: show a clear re-login path
- **Save conflict**: detect stale SHA or remote change and prompt the user to reload before overwriting
- **Rich-mode unsupported content**: keep the raw markdown unchanged and direct the user to markdown mode
- **Unsaved navigation**: warn before leaving the current document
- **Save failure**: keep editor state local and show a retry path

### Not required in v1
- collaborative merge resolution
- document version history UI
- multi-step recovery workflows

## Security and authorization

The current owner-only restriction is preserved.

### Rules
- only the configured GitHub owner may authenticate successfully
- the client must not expose additional write surfaces beyond repository editing already permitted by the token
- the admin UI should avoid storing tokens in unsafe or long-lived ways beyond what is necessary for the current session
- all destructive or irreversible actions should remain explicit
- v1 should continue using the existing GitHub OAuth scope expectations unless the implementation proves a narrower scope is sufficient

## Testing strategy

### Product-level validation
- login works only for the allowed GitHub owner
- existing posts load without URL or publish-state regression
- new posts save into the correct folder with the correct timestamp-based filename pattern
- search/filter/sort behavior is correct
- switching between rich and markdown modes preserves content for supported documents
- unsupported documents fall back safely to markdown mode
- immersive mode does not block save/preview/exit
- published posts cannot be reverted to draft

### Compatibility validation
- legacy posts without `published` remain treated as published
- saving a legacy post without `published` writes back `published: true`
- legacy posts without `permalink` remain editable without forced backfill
- saved output remains valid for the existing Hexo build pipeline

### Failure validation
- expired auth returns to login cleanly
- save conflict is surfaced clearly
- unsupported content does not get dropped during mode switching

## Migration strategy

The custom admin should replace the current editing surface incrementally rather than changing the whole project architecture.

### Migration decisions
- keep the current OAuth backend and hosting boundary
- keep the current target repo and branch
- keep the current storage folder and content model
- replace the Decap-native editor UI with the custom admin shell
- preserve the same deployment workflow

This minimizes project risk while allowing a meaningfully better editor.

## Implementation boundaries for planning

The implementation plan should assume the following boundaries:
- do not add AI features in v1
- do not redesign the public site
- do not change Hexo content storage rules
- do not replace GitHub OAuth with a different auth model
- do not broaden scope into a multi-user CMS

## Recommended v1 rollout

### Phase 1
- custom admin shell
- login gate integration
- post list plus search/filter/sort
- runtime config wiring

### Phase 2
- canonical document model
- rich editor mode
- markdown mode
- metadata settings panel
- immersive mode

### Phase 3
- save flow
- preview flow
- publish-state rule enforcement
- unsupported-content fallback handling
- auth/session handling and save-conflict handling

### Phase 4
- UX polish
- keyboard shortcuts
- small workflow refinements

## Summary

The recommended v1 is a custom `/admin/` writing and management workspace built around Tiptap, while preserving the current GitHub OAuth backend, the `alpacaA1/Alpaca-Notes-CMS@main` repository contract, the Hexo markdown/frontmatter model, and the existing GitHub Pages deployment pipeline.

This is the right level of change for the user's new goal: significantly better editorial ergonomics without replacing the blog's core architecture.
