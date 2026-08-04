# Context Canvas PoC Dev Log

Last updated: 2026-08-04

This file is a lightweight handoff note for future Codex work on the local PoC.

## Current Shape

Context Canvas is currently a frontend-heavy local Vite/React/TypeScript app.

The app lives in the local repository checkout.

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
cd <repository-root>
PATH=/path/to/node/bin:$PWD/node_modules/.bin:$PATH ./node_modules/.bin/vite --host 127.0.0.1
```

Then open:

```text
http://127.0.0.1:5173/
```

Validation:

```bash
cd <repository-root>
PATH=/path/to/node/bin:$PWD/node_modules/.bin:$PATH ./node_modules/.bin/tsc -b
PATH=/path/to/node/bin:$PWD/node_modules/.bin:$PATH ./node_modules/.bin/vite build
```

Latest validation:

- 2026-07-28: the bundled Node runtime build passed. Vite emitted the expected large-chunk warning after adding Mammoth.

Do not auto-start the dev server unless the user asks. The user wants to trigger testing.

## Implemented Features

### Semantic Text Box Nodes

- Canvas now has an insert toolbar for semantic text box nodes.
- Supported shapes are `rectangle`, `rounded_rectangle`, `diamond`, and `cylinder`.
- Text boxes are stored as `ContextNode` values with `type: "text_box"`, `body`, `shape`, and optional `shapeMeaning` fields.
- The shape is visual shorthand. `shapeMeaning` is an optional helper for agent-readable output; an empty field does not assign special meaning.
- Text box nodes can be connected like other context nodes and are included in Markdown/JSON bundle output when they contain text.
- React Flow Delete/Backspace now removes selected source nodes from both the visible flow and workspace state, including their connected edges. Start and End are protected.

### Local Markdown / Text / Docx Import

- Drag-and-drop `.md`, `.markdown`, `.txt`, `.docx`, and image files into the app.
- Import modal also supports `Add document` and `Add image`.
- Local files are read by the browser into app state. The original file is not modified, deleted, or written back.
- Empty markdown/text/docx imports show diagnostics instead of silently creating a confusing blank preview.

Docx implementation notes:

- Added `mammoth@1.12.0` as the client-side `.docx` text extractor.
- The app uses `mammoth.extractRawText({ arrayBuffer })`, so the `.docx` file remains local and read-only.
- Extracted `.docx` text becomes a regular document node; document bundle behavior is unchanged, so successfully imported `.docx` documents default to full include.
- Import diagnostics are shown in the source rail when `.docx` parsing fails, when Mammoth returns parser messages, or when parsing succeeds but no readable text is extracted.
- `src/mammoth-browser.d.ts` declares the browser bundle import because Mammoth's package types cover the main module but not the `mammoth/mammoth.browser` entry.
- 2026-07-29 button import fix: the Import modal file buttons now share the same importer as drag/drop, clear their file input after each selection, and show inline failure diagnostics. Workspace-to-canvas synchronization was moved out of nested state updates into an effect so modal-based imports reliably appear in the source rail, document reader, and canvas node data.

Current docx limitations:

- Text extraction is raw text only. Formatting, comments, tracked changes semantics, tables, headers/footers, footnotes, and images are not modeled as separate blocks.
- Password-protected, corrupt, old `.doc`, or heavily embedded documents may fail or import empty.
- Adding Mammoth increased the production JS bundle enough for Vite to warn about a chunk over 500 kB. This is acceptable for the local PoC, but a future production version should consider lazy-loading the docx parser.

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
- If a document or note has no paragraph breaks, the slicer falls back to chunks of five sentences.
- Chat blocks try speaker markers first, such as `User:`, `Assistant:`, `用户:`, `助手:`, or a short `Name:` prefix. If no speaker markers are found, chat falls back to sentence-level blocks.
- Sliced blocks store `sourceOrder` so the inspector can sort blocks by their position in the source text instead of by later annotation/edit time.

Product decision:

- Local documents default to `included` after import.
- The user's mental model is "I dropped this document in as context"; they should only need to mark important or stale parts.
- Block mode is for quick bulk operations on paragraphs/sections.

Tag decision:

- Built-in block tags are now limited to `requirement`, `decision`, and `assumption`.
- Users can add a custom string tag when a more specific label is useful.
- Status actions do not silently add tags; status and semantic tags remain separate decisions.

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
- 2026-07-28 update: default included documents now emit their full text into `Included Evidence`, not just a placeholder sentence. If the user ignores original document blocks, the bundle falls back to emitting the remaining included original blocks plus pinned/excluded/generated annotation blocks.

### Canvas / Document Editor Navigation

Product decision:

- The canvas is the main assembly surface. Opening a document reader is a focused editing mode, not a permanent replacement for the canvas.
- The canvas should always expose the context assembly lifecycle: `Start` as the source entry point and `End` as the bundle/output point.

Current implementation:

- `selectedNodeId` controls the selected source and right inspector.
- `activeDocumentId` controls whether the center pane is showing the document reader.
- Document editing has a `Save & Back` control. Edits are already autosaved into workspace state; the button exits focused reader mode and returns the center pane to the canvas.
- The structured block editor remains in the right inspector for now, even though it will need a cleaner high-volume UI later.
- The block inspector sorts blocks by source text order and includes a quick status filter for `all`, `included`, `excluded`, `pinned`, and `needs_review`.
- Focused document review now links the reader and inspector: scrolling the reader highlights the active preview block and scrolls the matching inspector block into view.
- Inspector blocks can be selected directly. Selecting a block opens the matching text review for document/chat/note sources when needed and scrolls the reader to the matching preview block.
- Chat and note nodes reuse the focused text review surface previously used by markdown/document nodes.
- Canvas source nodes for chat/document/note have a `Slice` action that rebuilds rule-based source blocks from the original body text, keeps generated in-text annotations, and shows a toast when complete.
- 2026-07-29 update: `Start` and `End` are system nodes that are always normalized into the workspace. Older `bundle` nodes are treated as `End` for compatibility.
- New imports stay unconnected by default. The user decides which sources connect on the canvas.
- If there are no user-authored source connections, bundle generation still follows workspace/import order, with pinned context emitted first.
- Connections can be selected on the canvas, renamed in the inspector, and deleted from the inspector or React Flow edge deletion.
- `End` has export controls for `md` and `json`. The top toolbar Bundle button shares the same selected output format.
- `md` exports the current bundle draft/generated text. `json` exports an agent-readable structured object; local persistence and `Export workspace` remain separate full-workspace state.
- 2026-07-29 update: bundle markdown is grouped by source component. Each source section includes type, file name, source path/import path, connection labels, included evidence, image annotations, excluded context, and open questions.
- Browser imports cannot expose the user's full local filesystem path for privacy reasons. `sourcePath` currently stores the browser-provided relative path when available, otherwise the file name. A desktop/plugin version can replace this with a real local path later.
- The top toolbar has `New canvas`. It opens a confirmation dialog that lets the user download the current bundle before clearing the workspace into a fresh Start/End canvas.
- 2026-07-30 update: bundle markdown is now a just-enough agent preview. It starts with a short read policy, keeps pinned/included content, keeps annotation reasons, and omits expanded excluded/needs_review content plus noisy source metadata.
- 2026-07-30 update: bundle JSON export is now agent-readable context only via `generateBundleJson`. It includes `_meta`, concise relations, readable nodes with pinned/included blocks/regions, and `skipped_nodes` indexes for excluded/needs_review material. It no longer embeds full markdown or the full workspace.
- Local persistence and `Export workspace` remain full workspace JSON for restoring the canvas UI state.
- 2026-07-29 update: source nodes can be deleted from the left rail. Deleting a source removes its related edges and exits any active document reader for that source.
- Workspace state autosaves to `localStorage` under `context-canvas.workspace.v1`. The toolbar also has explicit `Save local` and `Export workspace` actions. Manual local saves show a short success/failure toast.
- `localStorage` is a PoC persistence layer for text, blocks, edges, annotations, and small/medium imported images.
- 2026-07-29 update: imported images are stored as Data URLs in workspace state instead of temporary object URLs, so refresh/restart and workspace JSON export/import can preserve previews.
- This is intentionally a PoC tradeoff: Data URLs make workspace JSON larger and may hit browser `localStorage` quota with many large screenshots. A future app should move image bytes to IndexedDB or a zipped workspace asset folder.
- Top toolbar has basic undo/redo for workspace content operations. This covers imports, deletes, block edits, status changes, edges, and annotations. It does not currently preserve ReactFlow-only viewport/node-position drag history as a first-class undo target.
- Manual `Save local` writes the current workspace to `localStorage`, shows a short toast, and clears the redo branch. This matches the user's expectation that saving after an undo establishes the current state as the active branch.

### Image Annotation

- Image nodes can be created by importing `.png`, `.jpeg`, and `.jpg` files.
- Image inspector supports two annotation tools:
  - bounding boxes by dragging on the image
  - text boxes by clicking or dragging on the image
- The image toolbar has five preset annotation colors and five text font choices.
- Region metadata supports kind, box, color, font, label, note, status, and tags.
- Image annotations are included in bundle output with type/color/font metadata.
- Image nodes support both quick inspector annotation and a focused zoom editor with `Save & Back`.
- Image previews persist across refresh and workspace JSON export/import because imported image files are encoded as Data URLs in the workspace.
- Native browser image dragging is disabled inside the annotation stage, and the app shell only reacts to real file drags. This prevents bbox/text drawing from accidentally triggering the global import drop state.

## Key Product Decisions

1. Start local-only. The npm CLI is a distribution wrapper for the local web app; native plugin packaging remains future work.
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
- Repository visibility: prepared for public showcase after the `1.0.0` documentation and privacy checklist are reviewed.
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
- No reason input in the floating menu yet; reason must be edited in the right inspector.
- Imported image bytes are stored as Data URLs in workspace state so refresh and workspace export/import preserve previews. Large image collections may still exceed localStorage limits.
- Block inspector gets visually noisy with many generated annotations.

## Next Good Tasks

2026-07-30 interaction note:

- Text review now keeps block selection bidirectional.
- Selecting a block in the inspector centers the matching reader paragraph with light smooth scrolling.
- Clicking or scrolling reader paragraphs updates the inspector selection and centers the matching block without forcing the reader to scroll itself.

Short-term:

- Add quick reason editing after floating annotation.
- Add a clearer distinction between source blocks and generated in-text annotations in the inspector.
- Add explicit reset/clear local workspace.
- Add workspace JSON import/restore.
- Add copy-to-clipboard for current bundle draft.

Medium-term:

- Improve markdown parsing and selection anchoring.
- Add search/filter by status and tag.
- Add bundle variants.
- Add a local Codex skill that explains how to consume `context-bundle.md`.
- Add optional model-assisted slicing/tagging only after manual workflow feels good.

Later:

- MCP tools for `list_blocks`, `get_active_context`, `set_block_status`, `export_bundle`.
- Deeper plugin packaging and direct agent integration after the local `1.0.0` workflow proves useful.
## 2026-08-04: 1.0.0 Packaging And Public-Repository Preparation

Current release decision:

- `1.0.0` represents the personal-use milestone: the local canvas, annotation workflow, bundle output, and Codex / Complex Chat context import are usable end to end.
- `2.0.0` is reserved for interaction stability and UI refinement.
- `3.0.0` is reserved for deeper agent integration and the human-in-the-loop feedback loop.

Current implementation:

- The package is named `context-canvas` and exposes `npx context-canvas` through a small Node static server.
- The package contains the built `dist`, CLI entrypoint, README, and package metadata; React and Vite remain build-time dependencies.
- The CLI binds to `127.0.0.1` by default, supports `--port` and `--host`, and does not read or upload workspace data itself.
- `experiment/codex-complex-chat` has been consolidated into `main` after manual testing of multi-turn import, used-context candidate review, `Read context`, deduplication, legacy JSONL import, localization, persistence, and bundle output.

Release validation:

- `tsc -b` and `vite build`
- `node scripts/verify-codex-import.mjs`
- `pnpm pack` contents check
- CLI `--help` and local server smoke test
