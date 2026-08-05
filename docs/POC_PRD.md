# Context Canvas PoC PRD

Date: 2026-07-17

## Summary

Context Canvas is a local, canvas-based workspace for preparing structured context bundles for Codex and other AI agents. Users import messy source material, annotate what matters, exclude what is stale or misleading, connect related pieces, and export a markdown/JSON bundle for a model run.

The PoC should prove one thing: manually curated context is faster, clearer, and more controllable than pasting a messy transcript into a chat.

## Goals

- Give users a visual way to organize context before sending it to an AI agent.
- Support limited but realistic inputs: pasted chat transcripts, markdown/plain text documents, and images.
- Let users mark text and image regions as included, excluded, pinned, or noted.
- Preserve reasons for annotations so context decisions are auditable.
- Export a context bundle that Codex can read as canonical working context.

## Non-goals

- No native editing of Codex's hidden current-task context.
- No full plugin packaging in PoC.
- No Google Drive, Notion, Slack, GitHub, browser clipping, or collaboration.
- No automatic end-to-end context orchestration.
- No complex PDF support in the first pass.
- No guarantee that excluded content disappears from an already-running chat unless the next run uses the exported bundle as its source of truth.

## Target User

Advanced AI/coding-agent users who often have messy project context spread across:

- long chats
- copied notes
- screenshots
- requirements fragments
- docs and markdown files

They are willing to curate context if the tool makes that faster than rewriting a clean prompt from scratch.

## Core Workflow

```text
Import -> Editing -> Archived -> Output / Use
```

### Import

Users can:

- paste a chat transcript
- paste or upload markdown/plain text
- paste or upload an image
- create a note manually

System creates:

- source node on canvas
- initial blocks for text/chat
- image node for screenshot
- metadata for source type, creation time, and original content

### Editing

Users can:

- select a node on canvas
- open its detail view
- highlight text as included
- mark text as excluded or stale
- pin text as requirement or constraint
- add reason/note to any annotation
- split and merge text blocks
- draw bounding boxes on images
- add notes to image regions
- link nodes on canvas
- create a bundle node from selected nodes/blocks

### Archived

Users can:

- save a canvas state
- name a bundle
- add a version note
- reopen archived bundles
- fork a bundle into a new editing state

PoC can implement this as local JSON files; no account system required.

### Output / Use

Users can:

- preview active bundle
- edit the final bundle draft directly for last-mile cleanup
- export `context-bundle.md`
- export `context-bundle.json`
- copy bundle content

Export should clearly separate:

- pinned requirements
- included evidence
- image annotations
- excluded or stale context with reasons
- open questions

## PoC Scope

### Must Have

- Local web app.
- Freeform canvas with draggable nodes.
- Node types: document, chat transcript, image, note, bundle.
- Semantic canvas text box nodes with rectangle, rounded rectangle, diamond, and cylinder shapes.
- Paste/import flow for chat and markdown/plain text.
- Drag-and-drop local `.md`, `.markdown`, and `.txt` files into the app.
- Local markdown preview for document nodes.
- Local documents are included by default after import.
- Select text in the markdown preview and mark it as pinned, included, or ignored.
- Support both block-level status changes and in-text annotations.
- Show a floating annotation menu near selected text so users can keep reading and marking without jumping to a side panel.
- Upload or paste image.
- Heuristic text slicing into blocks.
- Block statuses: included, excluded, pinned, needs_review.
- Annotation reason field.
- Image bounding box annotation with note.
- Bundle preview panel.
- Editable bundle draft panel.
- Markdown export.
- JSON export.
- Local persistence as project files.

### Should Have

- Manual merge/split blocks.
- Simple relationship lines between nodes.
- Basic tags: requirement, decision, assumption, plus one user-defined tag string.
- Token or character estimate.
- Archive/version note for bundle.
- Sample imported transcript for testing.

### Could Have

- Model-assisted structure-only chat slicing.
- Auto-tag suggestions.
- Bundle diff.
- Search/filter blocks by status or tag.
- Copy-to-clipboard prompt bundle.

### Out of Scope

- Full plugin install flow.
- MCP server.
- Multi-user realtime canvas.
- OCR from screenshots.
- Full PDF text extraction.
- Cloud sync.
- Automatic replay inside Codex.

## Data Model

### Canvas

```json
{
  "id": "canvas_001",
  "title": "Context Canvas PoC",
  "nodes": [],
  "edges": [],
  "bundles": [],
  "created_at": "2026-07-17T00:00:00Z",
  "updated_at": "2026-07-17T00:00:00Z"
}
```

### Node

```json
{
  "id": "node_001",
  "type": "document|chat|image|note|bundle",
  "title": "Imported Chat",
  "position": { "x": 120, "y": 80 },
  "source_path": null,
  "blocks": [],
  "metadata": {}
}
```

### Block

```json
{
  "id": "block_001",
  "node_id": "node_001",
  "type": "text|message|image_region|note",
  "role": "user|assistant|system|tool|unknown",
  "text": "Original content here",
  "status": "included|excluded|pinned|needs_review",
  "tags": ["requirement"],
  "reason": "Latest version of the requirement",
  "is_generated": false
}
```

### Image Region

```json
{
  "id": "region_001",
  "node_id": "img_001",
  "box": [120, 80, 360, 210],
  "status": "included",
  "label": "wrong spacing",
  "note": "The button is too close to the title.",
  "tags": ["bug", "ui"]
}
```

### Edge

```json
{
  "id": "edge_001",
  "from": "node_001",
  "to": "node_002",
  "label": "contradicts"
}
```

## Bundle Markdown Format

```md
# Context Bundle

## Pinned Requirements

- ...

## Included Evidence

### Source: Imported Chat

- ...

## Image Annotations

### Screenshot: homepage.png

- Region `[120,80,360,210]`: wrong spacing
  Reason: The button is too close to the title.

## Excluded / Stale Context

- Block 17: excluded because this was an early misunderstanding.

## Open Questions

- ...
```

## UX Layout

Recommended PoC layout:

- Top toolbar: import, new note, create bundle, archive, export
- Left rail: sources and bundles
- Main area: freeform canvas
- Right inspector: selected node/block details
- Bottom or right preview: active bundle preview

The canvas should stay practical, not decorative. Nodes should be compact and information-dense:

- title
- type
- block count
- included/excluded/pinned counts
- last edited time

## Key Interaction Details

### Pasted Chat Import

1. User pastes transcript.
2. App asks for source type or auto-detects.
3. App slices into message/block candidates.
4. Imported chat blocks default to `included`; users can quickly remove noise with `Ignore`. Tool-level review remains available as an explicit import choice or later annotation.
5. User can accept all, merge/split, or mark statuses.

### Text Annotation

1. User opens a text node.
2. User selects text.
3. Floating action menu offers include, exclude, pin, tag, add reason.
4. Selection becomes an annotation/block.

### Document Block Logic

For the PoC, document blocks are created by splitting markdown/plain text on blank lines. Chat transcripts use simple speaker markers where possible.

Document imports should default to included because the user's mental model is "I dropped this file in as context." Block-level editing is for fast bulk operations on paragraphs or sections. In-text annotation is for finer markings inside a block, such as pinning one sentence or ignoring one stale claim.

### Image Annotation

1. User opens image node.
2. User draws bounding box.
3. Side panel asks for label, status, note, tags.
4. Region appears in bundle preview.

### Bundle Creation

1. User selects nodes or blocks.
2. Clicks create bundle.
3. Bundle node appears on canvas.
4. Preview updates live as statuses change.

## Success Criteria

The PoC is successful if:

- A user can import a messy pasted chat and create a useful context bundle in under 10 minutes.
- The exported markdown is understandable without the app.
- Excluded/stale context is visible with reasons.
- Image annotations survive export as structured context.
- A Codex run using the bundle is easier to steer than pasting the raw transcript.

## Open Questions

- Imported chat and document blocks default to included; should future import presets offer a stricter review-first mode?
- Should excluded content appear in the bundle as warnings, or be omitted entirely by default?
- How much canvas freedom is useful before it becomes messy?
- Is relationship labeling worth the interaction cost in PoC?
- Should archive apply to whole canvas state, bundle only, or both?
- Should model-assisted slicing be local/manual only in PoC, or optional behind a button?

## Recommended Build Order

1. Local data model and file persistence.
2. Import pasted text and slice into blocks.
3. Basic canvas with draggable nodes.
4. Detail inspector for block status, tags, and reasons.
5. Bundle preview and markdown export.
6. Image node upload and bounding boxes.
7. Archive/version metadata.
8. Optional JSON export and sample Codex workflow.
