# Memos Browser Extension Handoff

## Goal

Build a Chrome MV3 browser extension for quick memo capture, inspired by `usememos/memos`, while keeping this project as a static Hexo/GitHub Pages site.

The extension should let the user quickly write a memo from the browser, optionally include the current page context, and commit the memo as Markdown into the existing content repository.

## Decisions Made

- Use a **separate browser extension project**, not a page inside the current admin app.
- Put extension code at repo root: `browser-extension/`, parallel to `admin-app/`.
- Add `browser-extension` to the root `package.json` workspaces.
- Use **PAT-based GitHub auth**, not the existing Vercel OAuth flow.
- Store extension settings in `chrome.storage.local`.
- Commit memo files to the content repository, not this GitHub Pages repo.

## Correct Content Target

Existing admin config is in `admin-app/src/app/config.ts`:

```ts
export const REPO_OWNER = 'alpacaA1'
export const REPO_NAME = 'Alpaca-Notes-Content'
export const REPO_BRANCH = 'main'
export const POSTS_PATH = 'source/_posts'
export const READ_LATER_PATH = 'source/read-later-items'
export const KNOWLEDGE_PATH = 'source/_knowledge'
```

New memo files should be committed to:

```text
alpacaA1/Alpaca-Notes-Content
source/_memos/
```

Suggested file naming:

```text
source/_memos/YYYY-MM-DD-HHmmss.md
```

Suggested Markdown format:

```markdown
---
date: 2026-06-30T14:20:00+08:00
tags: [idea]
sourceTitle: Example Page
sourceUrl: https://example.com
---

Memo body in Markdown.
```

Keep the schema small. Do not merge memos into `read-later`; they are a separate quick-capture content type.

## Existing Code To Reuse Or Mirror

Read these files before implementation:

- `admin-app/src/app/github-client.ts`
  - Already has GitHub Contents API request handling, base64 encoding, conflict/auth error classes, save/list/fetch patterns.
  - For the extension, copy the minimal needed pieces rather than importing across workspace boundaries unless a shared package is introduced.
- `admin-app/src/app/config.ts`
  - Source of repo owner/name/branch/path conventions.
- `admin-app/src/app/session.ts`
  - Existing OAuth flow. Do **not** use it for v1 extension auth, but it explains current admin behavior.
- `admin-app/src/styles/app.css`
  - Existing admin app style system is plain CSS, not Tailwind.
- `admin-app/vite.config.ts`
  - Minimal Vite + React config pattern.

## Auth Decision

Use PAT for v1.

Options page should collect:

- GitHub token: fine-grained PAT with Contents read/write access to `alpacaA1/Alpaca-Notes-Content`.
- Repo owner, default `alpacaA1`.
- Repo name, default `Alpaca-Notes-Content`.
- Branch, default `main`.
- Memo path, default `source/_memos`.
- Theme, default `default`.

Do not reuse admin app Vercel OAuth for v1. It uses popup + postMessage through `https://alpaca-notes-cms.vercel.app/api/auth` and may require extension-origin callback changes.

## Visual Direction

Reference `usememos/memos`, but do not copy its React components.

Memos frontend findings:

- React + Vite.
- Tailwind CSS v4.
- shadcn/ui `new-york` style.
- base color `zinc`.
- icon library `lucide`.
- Theme tokens live in `web/src/themes/default.css`, `default-dark.css`, and `paper.css`.

For this extension, use **plain CSS variables** instead of Tailwind, because the existing admin app also uses plain CSS.

Default Memos-like tokens to port:

```css
:root {
  --background: oklch(0.9818 0.0054 95.0986);
  --foreground: oklch(0.2438 0.0269 95.7226);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.1908 0.002 106.5859);
  --primary: oklch(0.45 0.08 250);
  --primary-foreground: oklch(0.9818 0.0054 95.0986);
  --secondary: oklch(0.9245 0.0138 92.9892);
  --secondary-foreground: oklch(0.4334 0.0177 98.6048);
  --muted: oklch(0.9341 0.0153 90.239);
  --muted-foreground: oklch(0.5559 0.0075 97.4233);
  --accent: oklch(0.9245 0.0138 92.9892);
  --accent-foreground: oklch(0.2671 0.0196 98.939);
  --border: oklch(0.8847 0.0069 97.3627);
  --input: oklch(0.7621 0.0156 98.3528);
  --ring: oklch(0.45 0.08 250);
  --radius: 0.5rem;
  --shadow-sm: 0 1px 3px 0px hsl(0 0% 0% / 0.1), 0 1px 2px -1px hsl(0 0% 0% / 0.1);
}
```

Also port dark and paper themes from Memos if time allows.

UI feel:

- Timeline-first.
- Open, type, save, close.
- No title required.
- Warm near-white background, dark brown-gray text, restrained blue CTA.
- 8px radius, very light border/shadow, thin scrollbar.
- System font stack.
- Use lucide icons if adding icons.

## Suggested Extension Structure

```text
browser-extension/
  package.json
  tsconfig.json
  vite.config.ts
  manifest.json
  src/
    background/
      service-worker.ts
    content/
      selection-capture.ts
    options/
      index.html
      main.tsx
      OptionsApp.tsx
    popup/
      index.html
      main.tsx
      PopupApp.tsx
    shared/
      config.ts
      github-client.ts
      memo-format.ts
      settings.ts
      types.ts
    styles/
      theme.css
      popup.css
      options.css
```

## Functional Scope For First Version

1. Popup shows a Memos-like quick editor.
2. Popup can read current active tab title and URL.
3. User can write Markdown body and optional comma-separated tags.
4. On save, popup sends message to background service worker.
5. Background creates a Markdown file in `source/_memos/` via GitHub Contents API.
6. Popup stores successful recent memos locally so the timeline updates immediately without waiting for Hexo deploy.
7. Options page stores PAT/repo/branch/path/theme.
8. Context menu item captures selected text and current page URL into a draft memo.

## Build Notes

Existing root `package.json` currently has workspaces:

```json
"workspaces": ["admin-app"]
```

Update to:

```json
"workspaces": ["admin-app", "browser-extension"]
```

Add root scripts only if useful, for example:

```json
"build:extension": "npm run build --workspace browser-extension"
```

Use MV3 permissions likely needed:

```json
{
  "permissions": ["storage", "activeTab", "contextMenus"],
  "host_permissions": ["https://api.github.com/*"]
}
```

## Important Cautions

- Do not write to `/images/...`; this project uses `/Alpaca-Notes-CMS/images/...` for uploaded article images, but v1 memo text capture does not need image upload.
- Do not redesign admin-app or the public Hexo site as part of this task.
- Keep the extension independent; no heavy CMS direction changes.
- Do not commit secrets or real PAT values.
- Check whether `scripts/sync-private-content.js` needs to include `source/_memos/` later if memos must appear on the public site. First version can focus on committing data.

## Current Status

No code files for the extension have been created yet. The work so far is discovery and decision-making.

Next implementation step: create `browser-extension/` skeleton and implement the popup/options/background minimum viable flow.
