# Context Canvas PoC Dev Log

Last updated: 2026-07-28

This file is a lightweight handoff note for future Codex work on the local PoC.

## Current Shape

Context Canvas is currently a frontend-heavy local Vite/React/TypeScript app.

The app lives in:

- `/Users/keith/Desktop/AI/context-forge`

Core files:

- `src/App.tsx`: main UI, import flow, canvas, inspector, markdown reader, bundle preview.
- `src/domain.ts`: block slicing, node creation, bundle markdown generation, download helper.
- `src/types.ts`: workspace/node/block/region types.
- `src/styles.css`: app layout and interaction styling.
- `docs/POC_PRD.md`: current PoC product scope.
- `docs/ENGINEERING_EVALUATION.md`: initial tech choice notes.

## Run Commands

Use bundled Codex Node runtime:

```bash
cd /Users/keith/Desktop/AI/context-forge
PATH=/Users/keith/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PWD/node_modules/.bin:$PATH ./node_modules/.bin/vite --host 127.0.0.1
```

Then open:

```text
http://127.0.0.1:5173/
```

Validation:

```bash
cd /Users/keith/Desktop/AI/context-forge
PATH=/Users/keith/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PWD/node_modules/.bin:$PATH ./node_modules/.bin/tsc -b
PATH=/Users/keith/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PWD/node_modules/.bin:$PATH ./node_modules/.bin/vite build
```

Do not auto-start the dev server unless the user asks. The user wants to trigger testing.

## Implemented Features

### Local Markdown / Text Import

- Drag-and-drop `.md`, `.markdown`, `.txt`, and image files into the app.
- Import modal also supports `Add md/txt` and `Add image`.
- Local files are read by the browser into app state. The original file is not modified, deleted, or written back.
- Empty markdown files show an explicit empty state instead of silently creating a confusing blank preview.

### Markdown Reader

- Selecting a document node opens a center markdown reader.
- Markdown rendering is intentionally lightweight and dependency-free for now:
  - headings
  - lists
  - code fences
  - paragraphs
- This is not a full Markdown parser yet.

### Block Mode

Current block slicing:

- Document/plain text blocks are split on blank lines.
- Chat blocks try speaker markers first, such as `User:`, `Assistant:`, `用户:`, `助手:`, then fall back to blank-line splitting.

Product decision:

- Local documents default to `included` after import.
- The user's mental model is "I dropped this document in as context"; they should only need to mark important or stale parts.
- Block mode is for quick bulk operations on paragraphs/sections.

Block statuses:

- `included`
- `excluded`
- `pinned`
- `needs_review`

Block-level controls:

- `Pin`
- `Include`
- `Ignore`
- Clicking active `Pin` or `Ignore` returns the block to `included`.

### In-text Annotation Mode

Product decision:

- Block mode is not enough for real reading. Users need to select a sentence or phrase and mark it in place.

Current implementation:

- Select text in the markdown reader.
- A floating menu appears near the selection with `Pin`, `Include`, and `Ignore`.
- The older sticky selection toolbar still exists as a visible fallback.
- Selecting text creates an `isGenerated: true` annotation block.
- The selected text is highlighted inline in the source reader.
- Annotation blocks still appear in the structured block inspector and can be edited there.

Known limitation:

- Inline highlighting currently does a simple text match. It may behave poorly for repeated identical text, overlapping selections, or selections spanning multiple rendered blocks.

### Bundle Preview / Output Draft

Product decision:

- The final output bundle should be directly editable because users may want a last-mile cleanup or quick deletion without going back through source annotations.

Current implementation:

- Right panel has `Edit`, `Generated`, and `Reset`.
- `Generated` shows the bundle built from current blocks/annotations.
- `Edit` is an editable final draft.
- If the user edits the draft, the top `Bundle` download button exports the draft instead of the generated text.
- `Reset` restores the draft to the generated bundle.

Bundle generation decision:

- Documents are treated as full-document included by default.
- Pinned and excluded blocks/annotations are emitted explicitly.
- If a document has excluded non-generated blocks, that changes how it appears in bundle output.

### Image Annotation

- Image nodes can be created by file import.
- Image inspector supports drag-to-create bounding boxes.
- Region metadata supports label, note, status, and tags.
- This is still early and not the current focus.

## Key Product Decisions

1. Start local-only. No plugin packaging yet.
2. Frontend-heavy PoC. No traditional backend in the first phase.
3. Local file import is read-only. Original files must not be mutated.
4. Document import defaults to full include.
5. Users mainly mark exceptions:
   - pin what must survive compression or guide the model
   - ignore stale or misleading content
6. Keep both interaction speeds:
   - block mode for bulk editing
   - in-text annotation mode for precise reading flow
7. Bundle output should be inspectable and editable.
8. User-triggered testing only; do not keep dev server running unless asked.

## Project Shell

Created on 2026-07-28:

- GitHub repository: https://github.com/KeithWangJunzhe/context-canvas
- Figma design file: https://www.figma.com/design/niYXxdhD4xwKbTi6YRlwc8
- Repository visibility: private initial repo, suitable for later public showcase.
- Initial local commit: `Initial Context Canvas PoC`.

Figma setup:

- Created a `Context Canvas` design file.
- Added the current live UI capture.
- Uploaded two user-feedback screenshots as reference material.
- Added concise PoC decision notes directly on canvas.

## Known Issues / Follow-ups

- Markdown parser is rough. Consider `react-markdown` or Tiptap/ProseMirror later if selection anchoring matters.
- In-text annotations use simple string matching, not durable offsets or AST positions.
- Repeated identical text may highlight more than intended.
- No delete annotation/block action yet.
- No reason input in the floating menu yet; reason must be edited in the right inspector.
- No import diagnostics beyond empty file warning.
- No workspace load/import yet, only download/export.
- Image upload uses object URLs; exported workspaces do not preserve image file bytes.
- Bundle JSON export is in PRD but not fully implemented as a separate button.
- Canvas disappears when a document is selected because center pane becomes the reader. This is probably acceptable for now but may need tabs later.

## Next Good Tasks

Short-term:

- Add delete/remove for blocks and annotations.
- Add quick reason editing after floating annotation.
- Add a clearer distinction between source blocks and generated in-text annotations in the inspector.
- Add save/load workspace JSON.
- Add copy-to-clipboard for current bundle draft.

Medium-term:

- Improve markdown parsing and selection anchoring.
- Add search/filter by status and tag.
- Add bundle variants.
- Add a local Codex skill that explains how to consume `context-bundle.md`.
- Add optional model-assisted slicing/tagging only after manual workflow feels good.

Later:

- MCP tools for `list_blocks`, `get_active_context`, `set_block_status`, `export_bundle`.
- Plugin packaging after the local PoC proves useful.
