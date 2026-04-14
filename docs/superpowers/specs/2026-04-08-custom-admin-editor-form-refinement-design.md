# Custom Admin Editor Form Refinement Design

**Date:** 2026-04-08
**Project:** `alpacaA1.github.io`
**Status:** Approved in conversation, pending written-spec review
**Refines:** `docs/superpowers/specs/2026-04-02-custom-admin-editor-design.md`

## Goal

Refine the current custom admin prototype so the editor form feels stable and intentional in day-to-day use.

This refinement pass focuses on three user-confirmed issues in the real prototype served from the `custom-admin-editor-plan` worktree:

1. preview mode currently shifts to the right after entering preview
2. the save button can become unreadable because its text and background lose contrast
3. categories and tags should become searchable multi-select controls instead of comma-based text entry

## Confirmed product decisions

### Source of truth for this work
- Use the current custom admin prototype as the baseline, not the old Decap admin screen.
- Keep the existing custom admin architecture, GitHub-backed storage model, Hexo frontmatter model, and top-level information architecture.
- This is a refinement of the editor experience, not a redesign of authentication, storage, publishing, or the broader admin shell.

### User-approved direction
- Preview should stay **inside the admin experience**.
- Preview should feel **closer to the public site** visually, while still clearly being part of the admin UI.
- On preview, **both sidebars should hide**.
- The **top bar should remain visible**.
- The preview should become a **centered reading canvas** instead of feeling trapped in the old three-column layout.
- The save button should remain the top-bar primary action, but its label and state must be visually readable.
- Categories and tags should become **searchable multi-select dropdowns**.

## Scope

### In scope
- Preview layout behavior inside the current admin shell
- Preview visual treatment and reading-canvas structure
- Preview content framing for title/date/body
- Save button readability and status expression
- Category and tag control redesign in the settings panel

### Out of scope
- Auth flow changes
- Post list architecture changes
- New metadata fields
- Taxonomy creation workflow in v1
- A full pixel-perfect recreation of the public site inside preview
- Replacing the approximate preview renderer with full Hexo rendering

## Existing surfaces being refined

The changes refine these current prototype areas:
- preview rendering flow in `admin-app/src/app/App.tsx`
- preview component in `admin-app/src/app/editor/preview-pane.tsx`
- top bar actions in `admin-app/src/app/layout/top-bar.tsx`
- taxonomy controls in `admin-app/src/app/layout/settings-panel.tsx`
- visual layout and state styling in `admin-app/src/styles/app.css`

## Design

## 1. Preview mode: admin-contained reading state

### Problem

The current preview mode is conceptually correct but visually unstable. After entering preview, the reading surface appears shifted to the right. From the user’s point of view, this makes preview feel like a broken panel rather than a deliberate reading state.

### Desired outcome

Preview should feel like a calm reading mode within the admin shell:
- top bar remains available for navigation and actions
- left post list hides
- right settings panel hides
- the center area becomes a single reading canvas
- the canvas is visually centered and no longer inherits the awkward residual proportions of the editing layout

### Layout rules
- Preview mode uses a **single central column** under the existing top bar.
- The preview container should align to the center of the available content area.
- The reading canvas should use a stable max width tuned for blog reading rather than form editing.
- The preview surface should be implemented as one centered article canvas, not as a panel nested inside the old editor frame.
- Preview should no longer look like a right-shifted card floating inside an editor grid.

### Visual rules
- The preview canvas should borrow the blog’s quieter reading feel: more stable line length, cleaner spacing, stronger title hierarchy, and more deliberate vertical rhythm.
- The preview can still use admin surfaces, but its proportions and tone should feel closer to the public article page than to a utility panel.
- For this refinement, “closer to the public site” means:
  - a centered single-column reading width
  - article title and date presented as article metadata rather than utility UI
  - removal of preview-specific utility chrome inside the canvas
  - body typography and spacing optimized for reading instead of form editing

### Preview content contract
This refinement defines “closer to the public site” as a **content framing and styling change**, not a full renderer swap.

Preview should render inside the canvas:
- the current article title from frontmatter
- the current article date from frontmatter
- the current markdown body in the existing approximate renderer

Preview should **not** render preview-only utility chrome inside the canvas in v1:
- preview eyebrow labels
- preview stats
- preview notes/warnings as separate decorative blocks above the article body

Preview does **not** need to render these as page chrome in v1:
- categories
- tags
- desc/summary
- site-level header/footer

### Behavioral rules
- Entering preview should not preserve a layout offset from the previous editor/settings composition.
- Exiting preview returns to the prior editing mode without losing document state.
- Preview remains an approximate client-side reading view, not a full theme-faithful site render.
- Preview may reuse existing immersive-layout plumbing internally, but this refinement must not degrade normal immersive editing mode behavior.

## 2. Save button: readable primary action

### Problem

The save button is already positioned like a primary action, but the user reported that its text can visually disappear because the label color and button background become too similar.

### Desired outcome

The save button must remain the clearest top-bar action related to document persistence.

### Design rules
- Keep save in the top bar action cluster.
- Preserve its primary-action status relative to surrounding controls such as preview and immersive mode.
- Increase contrast so the label is readable at a glance in all states.
- Do not rely on subtle shading alone to communicate affordance.

### State rules
The button should communicate these concrete states:
- **no active document**: disabled, readable, label stays `保存`
- **active clean document**: disabled, readable, visually quieter, label becomes `已保存`
- **active dirty document**: primary and clearly actionable, label `保存`
- **saving in progress**: disabled, label `保存中…`

### Validation rule
- This refinement does **not** introduce a separate validation-only button state.
- When the current document has blocking validation errors, the save button still follows the dirty-document visual state.
- Clicking save continues to surface field-level validation errors using the existing validation flow.

### Behavioral rules
- Save keeps its current semantic placement in the top bar.
- This refinement is about readability and state expression, not relocation.

## 3. Categories and tags: searchable multi-select

### Problem

The current taxonomy fields mix comma-separated text entry with clickable chips. That works technically, but it feels like a data-entry pattern rather than a purposeful selection workflow.

### Desired outcome

Categories and tags should feel like modern searchable selectors:
- easier to scan
- easier to reselect existing terms
- less error-prone than comma formatting

### Interaction rules
Each taxonomy field should become a searchable multi-select control:
- closed state shows current selections as chips/tags
- opening the control reveals a dropdown panel
- the panel includes a search input
- the result list filters existing options as the user types
- users can select multiple items without leaving the control after each click
- selected items remain visible as chips in the collapsed field
- users can remove a selection either by clicking a chip remove affordance or by deselecting the option in the dropdown

### Data rules
- Options are sourced from the already indexed category/tag sets collected from existing posts.
- The stored value remains the same array-based Hexo frontmatter shape.
- No schema change is introduced.
- This pass supports selecting **existing options only**.
- Freeform typing must not create a new category or tag in v1.

### Empty-state rules
- If the indexed option set is empty, the control still renders but opens to an empty-state message instead of a freeform text input.
- If a search returns no matches, the dropdown shows a no-results message and no create-new affordance.
- Existing selections from the current document must still remain visible and removable as chips even if the indexed option set is empty.

### v1 limitation
- v1 does **not** support inline creation of new categories or tags inside the control.
- This pass optimizes multi-selecting existing values first.

## Implementation boundaries

This refinement pass should stay inside the current prototype architecture:
- no change to repository contract
- no change to frontmatter field names
- no change to publish-lock rules
- no change to document serialization strategy beyond using the same arrays for `categories` and `tags`
- no change to non-preview immersive editing behavior except shared layout/style refactoring required to support the preview fix

## Acceptance criteria

### Preview
- Clicking preview produces a centered reading canvas under the existing top bar.
- Left and right sidebars are hidden in preview mode.
- The preview surface no longer appears shifted to the right.
- Preview uses one centered article canvas rather than the old editor-frame composition.
- Preview shows the current article title and date above the rendered body.
- Preview does not show preview-specific eyebrow labels, stats, or explanatory note blocks inside the article canvas.
- Exiting preview returns to the prior editing mode with the current document state preserved.
- Existing immersive editing behavior remains intact when not in preview mode.

### Save button
- The save label is readable in normal, hover, disabled, and saving states.
- The button remains visually identifiable as the primary persistence action.
- Users can tell whether there is no active document, the current document is already saved, the current document has unsaved changes, or a save is in progress.
- The clean-document state is a disabled `已保存` button.
- Validation errors continue to appear through the existing field-level validation flow when save is attempted on invalid content.

### Categories and tags
- Both fields support search inside a dropdown list.
- Both fields support selecting multiple existing options.
- Selected options remain visible as chips/tags.
- Users can remove an existing selection without manual comma editing.
- This pass does not create new categories or tags from field input.
- When there are no indexed options, the control shows an empty-state message rather than falling back to freeform creation.
- When a search returns no matches, the control shows a no-results message rather than a creation path.
- Saving still writes Hexo-compatible string arrays for `categories` and `tags`.

## Recommended implementation order

1. Fix preview layout and centered reading-canvas behavior
2. Fix save button contrast and state clarity
3. Replace taxonomy text-entry fields with searchable multi-select controls

This order resolves the clearest visual bug first, then the top-bar affordance issue, then the settings-panel interaction improvement.