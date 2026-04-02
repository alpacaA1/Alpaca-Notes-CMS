# Online Post Editor Design

**Date:** 2026-04-01
**Project:** `alpacaA1.github.io`
**Status:** Finalized for planning

## Goal

Add an online post editor for the existing Hexo + GitHub Pages blog so the site owner can log in, create posts, edit posts, save drafts, and directly publish without changing the current static-site publishing model.

## Context

The current blog is a Hexo site deployed through GitHub Pages. Content lives in markdown files under `source/_posts`. The user wants an online editing experience, but only for themselves, and only for blog posts. They also want both draft and direct-publish modes.

The existing architecture should remain stable:
- Hexo remains the static generator
- GitHub Pages remains the site host
- Markdown in the repository remains the source of truth

## Recommended Approach

Use **Decap CMS** as the admin UI, backed by **GitHub OAuth** and a small authentication service, while keeping all content stored in the GitHub repository.

### Why this approach

This option fits the current stack best:
- It preserves the existing Hexo content model
- It avoids rewriting the blog into a dynamic application
- It keeps markdown files in the repo as the authoritative content source
- It provides an online admin experience with relatively low implementation cost

## Scope

### In scope
- Owner-only login
- Online admin page at `/admin/`
- List posts and show whether each is draft or published
- Create new post
- Edit existing post
- Save as draft
- Direct publish
- Write content into Hexo-compatible markdown files

### Out of scope for v1
- Editing standalone pages like `About`
- Editing theme config or site config
- Media library / image upload workflow
- Multi-user collaboration
- Visitor submissions
- Rich text editor customization
- Scheduled publishing
- Public-site inline editing
- Unpublish action in the admin UI
- Custom-built admin shell or custom React admin frontend

## Architecture

### Components

1. **GitHub Pages site**
   - Continues serving the generated static blog
   - Also serves the Decap admin frontend at `/admin/`

2. **Decap CMS admin UI**
   - Provides login, list view, and editor UI
   - Reads and writes markdown files in the repo
   - Uses a single post collection for v1
   - Must **not** enable Decap `editorial_workflow`, because v1 draft state is controlled only by Hexo frontmatter
   - Uses Decap's native editor UI as the base; v1 does not require a separate custom dashboard implementation
   - A lightweight custom admin script is explicitly allowed in v1 to do two things only:
     1. show draft/published status clearly in the admin list UI
     2. block published → draft saves for already-published entries before commit
   - No broader custom CMS rewrite is allowed in v1

3. **OAuth/authentication service**
   - Handles GitHub OAuth callback flow
   - Restricts access to the owner GitHub account only
   - Issues tokens for Decap CMS to interact with the repository

4. **GitHub repository**
   - Stores all post content as markdown files
   - Remains the source of truth

5. **GitHub Actions deployment workflow**
   - The implementation must add a workflow under `.github/workflows/`
   - Trigger: push to `main`
   - Install dependencies
   - Run `npm run build`
   - Deploy generated `public/` output to GitHub Pages

6. **Hexo build pipeline**
   - Reads repository content
   - Generates static output for GitHub Pages
   - Excludes draft posts automatically when `published: false`

## Content model

### Storage strategy

Use **one collection only** for v1:
- All posts are stored in `source/_posts/`
- Draft state is represented by frontmatter: `published: false`
- Published state is represented by frontmatter: `published: true`

This is the recommended v1 workflow because it matches Hexo's native unpublished-post behavior and avoids needing a custom file move operation between `_drafts` and `_posts`.

### Why not use `source/_drafts/`

For this CMS integration, using `_drafts` would require custom publish transitions and file relocation logic that is not part of the simplest Decap setup.

By using `published: false` inside normal post files:
- the CMS can manage a single collection cleanly
- Hexo will not publish those posts in normal production builds
- publishing a draft becomes a metadata change, not a file move

### Frontmatter schema for v1

#### Required for new CMS-created posts
- `title`
- `date`
- `desc`
- `published`
- `body` (markdown body, not frontmatter)

#### Optional
- `categories`
- `tags`
- `permalink`

### Field behavior
- `title`: required plain text
- `date`: required timestamp; set on creation and preserved during later edits unless intentionally changed before first publish
- `desc`: required short summary used for cards/meta description
- `published`: boolean
  - `false` = draft
  - `true` = published
- `categories`: optional list of strings
- `tags`: optional list of strings
- `permalink`: optional at raw schema level for legacy compatibility, but required for new CMS-created posts by the new-post flow rule described below
- `body`: markdown content after the frontmatter block

### New-post permalink rule
To preserve legacy compatibility while still avoiding bad URLs for new entries:
- The CMS schema should allow missing `permalink` so legacy posts can be edited safely
- For **new posts created through the CMS**, the creation flow must require the editor to provide a `permalink` value before the post is first saved
- Legacy posts without `permalink` remain editable without backfill
- The CMS must not auto-insert `permalink` into a legacy post during a routine edit

### Example draft output

```md
---
title: 文章标题
date: 2026-04-01 20:10:00
desc: 一句话摘要
published: false
categories:
  - 思考
tags:
  - 记录
  - 随笔
permalink: article-title/
---

正文内容
```

### Example published output

```md
---
title: 文章标题
date: 2026-04-01 20:10:00
desc: 一句话摘要
published: true
categories:
  - 思考
tags:
  - 记录
  - 随笔
permalink: article-title/
---

正文内容
```

## Legacy post compatibility

The existing site already contains posts that do not consistently define `published` or `permalink`.

### Compatibility rules for existing posts
- Missing `published` must be treated as **published**
- When an existing post without `published` is saved through the CMS, the CMS should write back `published: true`
- Existing posts without `permalink` must keep their current date-based public URL behavior
- The CMS must **not** auto-backfill `permalink` for a legacy post during a normal edit
- Adding a new `permalink` to a legacy post should be considered a deliberate URL change and is out of scope for v1

This prevents the CMS from accidentally changing URLs or hiding existing content.

## Filename and URL strategy

### Problem to solve
The blog is Chinese-first. Generating URL slugs directly from Chinese titles creates ambiguity, and relying on title-derived filenames would make later edits unstable.

### v1 decision
- New CMS-created posts must always have an explicit `permalink`
- The CMS should ask for permalink input at creation time
- The CMS must not try to transliterate Chinese titles automatically in v1
- Filename generation for new CMS-created posts should be ASCII-safe and independent from the visible title
- Once created, the markdown filename should remain stable even if the title changes
- Once published, the `permalink` should remain stable and not be auto-regenerated

### Recommended filename rule for implementation
Use a timestamp-based ASCII filename for new CMS-created posts, for example a creation-time identifier, while using frontmatter `permalink` as the public URL.

This keeps file management simple and avoids URL drift.

## Admin UI behavior in v1

### Important boundary
V1 uses **Decap's native collection editor**, not a custom admin product.

That means:
- Separate custom “Save Draft” and “Publish” buttons are **not required**
- Separate custom tabs for drafts and published posts are **not required**
- V1 uses Decap's native list view as the base
- A lightweight custom admin script may decorate each entry in the list with visible draft/published status derived from the `published` field
- If Decap native filtering/grouping is available, it may be used, but the implementation must not depend on it
- The required product capability is semantic, not pixel-specific:
  - saving with `published: false` = save draft
  - saving with `published: true` = publish

This keeps the design aligned with Decap's real customization boundaries and avoids sneaking a custom admin frontend into v1.

### Published-state restriction
The user explicitly does **not** want published posts to be moved back to draft.

V1 rule:
- New post: may be saved with `published: false` or `published: true`
- Draft post: may later change from `published: false` to `published: true`
- Already-published post: must remain `published: true`
- Any attempted transition from `published: true` to `published: false` must be rejected at save time by the lightweight custom admin script before the content is committed

So the `published` field still exists as part of the content model, but the state machine is one-way after first publish.

## User flow

### Login flow
1. User visits `/admin/`
2. User clicks GitHub login
3. User completes OAuth authorization
4. Auth service verifies the GitHub account matches the configured owner account
5. User is returned to the admin UI and allowed to edit content

### Create draft flow
1. User opens admin UI
2. User clicks “new post”
3. User fills title, summary, categories, tags, permalink, and body
4. User keeps `published` set to `false`
5. User saves the entry
6. A markdown file is written into `source/_posts/` with `published: false`
7. Draft does not appear on the public site during normal production builds

### Direct publish flow
1. User creates or edits a post
2. User sets `published` to `true`
3. User saves the entry
4. The markdown file is written into `source/_posts/` with `published: true`
5. Repository change triggers the normal GitHub Actions Pages deployment workflow
6. Post appears on the public site

### Publish draft flow
1. User opens a draft post from the admin list
2. User changes `published` from `false` to `true`
3. User saves the entry
4. The same markdown file remains in `source/_posts/`
5. The post keeps its original `date`, `permalink`, and filename
6. Repository change triggers the normal GitHub Actions Pages deployment workflow
7. Post appears on the public site

## Draft and publish behavior

### State transition rules
- Draft creation: create file in `source/_posts/` with `published: false`
- Draft update: same file remains in place, still `published: false`
- Publish draft: same file remains in place, `published` becomes `true`
- No file copy or move between directories in v1
- No duplicate file should be created when changing state
- The admin UI should expose only the existing Decap save flow plus the `published` field in v1
- Unpublish is not part of the v1 editor scope
- Any attempt to save an already-published entry with `published: false` must fail validation and leave the stored content unchanged

### Preserved fields on draft → publish
- `title`
- `date`
- `desc`
- `categories`
- `tags`
- `permalink`
- `body`
- filename

Only `published` changes during the state transition unless the editor explicitly modifies other fields.

## File and routing design

### New admin entry points
- `source/admin/index.html` or equivalent static admin entrypoint for Decap CMS
- `source/admin/config.yml` for Decap CMS configuration

### Content directories for v1
- `source/_posts/`

### Supporting integration
- OAuth service configuration lives outside the static blog runtime
- The blog repo contains the CMS config that references the auth endpoint

## Security model

- Only one GitHub account is allowed to log in
- Public visitors cannot access editing capabilities
- Any GitHub account other than the configured owner account must be rejected
- Repository write access happens through authenticated GitHub-backed CMS operations
- No anonymous submission path exists in v1
- The allowed owner identity must be configured explicitly in the auth layer

## Deployment model

### Required deployment path for v1
Because the current project does not yet define a Pages workflow, implementation must make the deployment path explicit.

V1 deployment model:
- Source branch: `main`
- CMS writes content changes into the repository on `main`
- GitHub Actions workflow runs on every content push to `main`
- Workflow installs dependencies and runs `npm run build`
- Workflow deploys generated `public/` output to GitHub Pages

This removes ambiguity around how CMS edits become visible on the public blog.

## Media strategy

V1 is **text-first**.

### Allowed in v1
- Markdown body content
- Links to external images if the author pastes them manually

### Not included in v1
- Image upload button
- Media library
- Asset management workflow

This prevents scope creep while keeping the post editor useful immediately.

## Operational constraints

- GitHub Pages cannot by itself perform the OAuth callback/backend role needed by the CMS login flow
- A small external auth service is therefore required
- The selected approach is acceptable because the user explicitly approved using external services such as GitHub OAuth, Vercel, or Supabase

## Testing and acceptance criteria

The feature is accepted when all of the following are true:

1. Unauthenticated users cannot enter the admin editor
2. A GitHub account other than the configured owner account is rejected
3. The owner can log in successfully with GitHub
4. The admin UI can list existing posts, including legacy posts without explicit `published`
5. The admin UI visibly distinguishes draft vs published status for each entry
6. Legacy posts without `published` are treated as published in the editor
7. Editing a legacy post without `permalink` does not change its public URL behavior
8. The admin UI can create a draft post in `source/_posts/` with valid Hexo frontmatter
9. Draft posts do not appear on the public blog after a normal production build
10. The admin UI can publish a draft by changing `published` from `false` to `true`
11. Publishing a draft does not create a duplicate file
12. A new CMS-created post requires explicit `permalink` input before first save
13. A published post appears on the public blog after rebuild/deploy
14. The admin UI can edit an existing published post and the public page updates after rebuild/deploy
15. `date`, `permalink`, and filename remain stable across edit and draft→publish transitions unless intentionally changed before first publish
16. Frontmatter remains valid for Hexo across create/edit flows
17. GitHub Actions deployment from `main` to Pages succeeds after a CMS content change
18. Attempting to change an already-published post from `published: true` back to `published: false` is rejected and does not modify the stored file

## Alternatives considered

### A. Decap CMS + GitHub OAuth + auth service
**Recommended** because it best matches the current Hexo + GitHub Pages + markdown repo architecture.

### B. Headless CMS (Sanity / Tina / similar)
Rejected for v1 because it adds architectural weight and moves the project away from repo-native markdown editing.

### C. Custom-built admin panel using GitHub API
Rejected for v1 because it offers maximum control but costs much more to build and maintain.

## Implementation notes for the next phase

The implementation plan should cover:
- Decap admin files and configuration
- Auth provider choice and integration pattern
- Single-collection content setup based on `source/_posts/`
- `published: false` draft workflow
- Native Decap UI usage without `editorial_workflow`
- Lightweight custom admin script for status decoration in the list view and one-way publish validation before commit
- Manual permalink input for new CMS-created posts
- Legacy-post compatibility rules
- ASCII-safe filename generation independent of title
- GitHub Actions Pages deployment workflow on `main`
- Local preview/development workflow
- End-to-end verification against the current Hexo build and GitHub Pages deployment path

## Recommendation

Proceed with a v1 online post editor based on:
- Decap CMS
- GitHub OAuth
- Small external auth service
- Owner-only access
- Post-only scope
- Draft + direct publish support
- `published: false` for drafts
- Native Decap save flow plus visible `published` status
- Manual explicit permalink for new CMS-created posts
- Stable ASCII-safe filenames independent of title
- Legacy-post compatibility that preserves existing URLs
- Repository markdown as the source of truth
