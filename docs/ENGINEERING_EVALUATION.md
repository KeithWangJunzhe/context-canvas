# Context Canvas PoC Engineering Evaluation

Date: 2026-07-17

## Recommendation

Build the PoC as a local React + Vite + TypeScript web app using React Flow for the canvas, Tiptap for text editing/highlights, and Annotorious for image bounding-box annotations.

Do not start with tldraw, full plugin packaging, MCP, cloud sync, or native Codex integration. Those are later productization layers.

## Current Local Environment

Available bundled runtime in this Codex desktop thread:

- Node.js: `v24.14.0`
- pnpm: `11.9.0`
- Writable workspace: `/Users/keith/Desktop/AI/context-forge`

Dependency installation will require network access when we actually scaffold the app.

## Difficulty Estimate

Overall PoC difficulty: medium.

Main difficulty is product interaction, not backend complexity.

### Easier Parts

- local project setup
- file-based JSON persistence
- markdown/plain-text import
- simple chat transcript slicing
- draggable nodes and edges
- bundle markdown/json export
- block status editing

### Medium Parts

- making the canvas feel useful rather than decorative
- text selection and annotation UX
- keeping source text, blocks, annotations, and bundle preview in sync
- image bbox annotation with notes
- clean local persistence and versioning

### Harder / Risky Parts

- robust transcript parsing across ChatGPT, Claude, Codex, Cursor, screenshots, and arbitrary copy formats
- preserving user trust around model-assisted slicing
- avoiding a bloated UI with too many statuses, tags, edges, and panels
- later packaging into a plugin with MCP/App surface

## Proposed Stack

### App Shell

- Vite
- React
- TypeScript
- Zustand or plain React state for PoC
- localStorage or IndexedDB first; JSON file export/import second

Why:

- fastest path to a local UI
- good ecosystem for canvas/editor/image annotation libraries
- easy to run locally and later package

### Canvas: React Flow

Use React Flow for the freeform node canvas.

Why:

- designed for interactive node/edge graphs
- supports custom nodes and edges
- node data can hold our source/block counts and metadata
- MIT licensed through xyflow
- less magical than a whiteboard SDK, which is good for a structured PoC

Official docs describe React Flow as an interactive graph of nodes and edges, with customizable nodes, handles, and edge types.

Source: https://reactflow.dev/learn/concepts/terms-and-definitions

### Avoid for PoC: tldraw

tldraw is tempting because it already has whiteboard interactions, shapes, arrows, images, highlights, bindings, and persistence.

But for this project, it has two issues:

- it is more of a general whiteboard than a structured context graph
- current license terms require a production license key for production use, with trial/commercial/hobby license paths

It could be useful later for a richer canvas, but I would not make it the PoC foundation.

Sources:

- https://tldraw.dev/sdk-features/shapes
- https://tldraw.dev/docs/persistence
- https://tldraw.dev/community/license

### Text Editor / Annotation: Tiptap

Use Tiptap for document/chat detail views.

Why:

- React integration is documented
- headless editor means we can design our own floating annotation menu
- built-in Highlight extension can handle visual highlights
- custom marks/extensions can later store annotation IDs, statuses, tags, and reasons
- MIT licensed OSS core

Sources:

- https://tiptap.dev/docs/editor/getting-started/install/react
- https://tiptap.dev/docs/editor/extensions/marks/highlight
- https://tiptap.dev/open-source-to-platform

PoC simplification:

- We can start without a full ProseMirror custom schema.
- First version can store block-level annotations in app state and render simple highlights.
- Add custom Tiptap marks only after the basic UX feels right.

### Image Annotation: Annotorious

Use Annotorious for image upload/paste plus bounding-box annotations.

Why:

- purpose-built image annotation library
- React components exist
- supports annotation layer around an image
- JavaScript API supports adding, removing, updating, and listening to annotations

Sources:

- https://new.annotorious.com/getting-started/
- https://new.annotorious.com/react/image-annotation/
- https://new.annotorious.com/api-reference/image-annotator/

Alternative:

- React Konva would provide lower-level canvas primitives and more control, but we would need to build annotation behavior ourselves.

### Styling

Use Tailwind CSS only if we want speed and are comfortable adding it. Otherwise plain CSS modules are enough.

For a PoC, visual style should be restrained:

- dense, work-focused UI
- compact nodes
- clear status colors
- minimal decorative styling

### Persistence

PoC options:

1. localStorage
   - easiest
   - good for first spike
   - weak for images and larger transcripts

2. IndexedDB
   - better for images and larger data
   - more work
   - can use Dexie later

3. JSON workspace file
   - transparent
   - easiest to inspect/debug
   - images need asset folder or base64

Recommended PoC:

- App state in browser memory.
- Save/load workspace as JSON file.
- Store images as object URLs during session, export copied images into an `assets/` folder later.

## Open-source Components Considered

### React Flow

Best fit for structured context graph.

Use for:

- document nodes
- chat nodes
- image nodes
- note nodes
- bundle nodes
- relationship edges

### tldraw

Best fit for expressive whiteboard UX.

Defer because:

- license is more complicated for production
- structured graph/state may require more custom integration

### Excalidraw

Good for sketching and embeddable drawing, but not ideal as the core context graph.

It is better if the product becomes a visual sketching workspace. For our PoC, React Flow gives cleaner node data and edge semantics.

Source: https://excalidraw-excalidraw.mintlify.app/guides/embedding

### Tiptap

Best fit for text detail view and highlights.

Use for:

- markdown/plain text viewing
- chat transcript block editing
- inline highlight/exclude/pin annotations

### Annotorious

Best fit for image bbox annotation.

Use for:

- screenshots
- UI mocks
- terminal screenshots
- exported image-region blocks

### Avoided

- Archived `react-image-annotation`: GitHub shows it was archived in 2023, so it is not a good foundation.
- Full whiteboard SDKs as first step: too much surface area before we validate the context workflow.

Source: https://github.com/Secretmapper/react-image-annotation

## Architecture Sketch

```text
src/
  app/
    App.tsx
    store.ts
  canvas/
    ContextCanvas.tsx
    nodes/
      DocumentNode.tsx
      ChatNode.tsx
      ImageNode.tsx
      NoteNode.tsx
      BundleNode.tsx
  import/
    ChatPasteModal.tsx
    textSlicer.ts
    sourceDetect.ts
  editor/
    TextDetailEditor.tsx
    BlockList.tsx
    AnnotationMenu.tsx
  image/
    ImageAnnotator.tsx
  bundle/
    BundlePreview.tsx
    exportMarkdown.ts
    exportJson.ts
  persistence/
    workspaceSchema.ts
    saveLoad.ts
```

## Core Data Types

Keep our own app data model separate from library internals.

React Flow nodes should point to our domain node IDs. Tiptap and Annotorious should produce annotations that map back to our `Block` and `ImageRegion` objects.

```ts
type NodeType = 'document' | 'chat' | 'image' | 'note' | 'bundle'
type BlockStatus = 'included' | 'excluded' | 'pinned' | 'needs_review'
type BlockTag =
  | 'requirement'
  | 'decision'
  | 'question'
  | 'assumption'
  | 'evidence'
  | 'noise'
  | 'bug'
  | 'ui'

interface ContextNode {
  id: string
  type: NodeType
  title: string
  sourceType?: 'chat_paste' | 'markdown' | 'plain_text' | 'image' | 'note'
  blocks: ContextBlock[]
  position: { x: number; y: number }
}

interface ContextBlock {
  id: string
  nodeId: string
  type: 'text' | 'message' | 'image_region' | 'note'
  role?: 'user' | 'assistant' | 'system' | 'tool' | 'unknown'
  text?: string
  status: BlockStatus
  tags: BlockTag[]
  reason?: string
  isGenerated?: boolean
}
```

## Suggested Build Phases

### Phase 0: Spike

Time: 0.5-1 day

- scaffold Vite React TS
- install React Flow
- render sample nodes and edges
- persist sample workspace in memory

Exit criteria:

- canvas works
- custom node cards render
- selected node appears in inspector

### Phase 1: Text/Chat Import

Time: 1-2 days

- paste modal
- source type select
- heuristic chat slicing
- block list with statuses
- bundle preview
- markdown export

Exit criteria:

- messy pasted chat can become a readable context bundle

### Phase 2: Text Annotation UX

Time: 1-2 days

- detail view for text/chat
- block split/merge
- status/tag/reason editing
- basic text selection to create annotation

Exit criteria:

- user can curate context without editing raw JSON

### Phase 3: Image Annotation

Time: 1-2 days

- image upload/paste
- bbox annotation
- labels/status/reasons
- image annotations appear in bundle

Exit criteria:

- screenshot evidence can be exported as structured context

### Phase 4: Archive/Export Polish

Time: 1 day

- named bundle node
- version note
- JSON export
- sample workspace
- smoke test with Codex using exported bundle

Exit criteria:

- one full Import -> Editing -> Archived -> Output flow works locally

## Rough Timeline

Solo PoC estimate:

- very rough clickable prototype: 2-3 days
- useful local PoC: 5-8 days
- polished enough to show others: 2-3 weeks

The unknown is not whether it can be built. The unknown is how simple the interaction can stay while still feeling powerful.

## Main Technical Risks

### Text Anchoring

If users highlight arbitrary text, annotations need to survive edits. This can get tricky.

PoC mitigation:

- start block-level, not character-perfect
- store selected text plus start/end offsets only inside a block
- avoid heavy editing after annotation

### Image Storage

Images are bigger than text and awkward in JSON.

PoC mitigation:

- keep images in browser session first
- for export, include image filename/path reference
- later add asset folder support

### Canvas Overload

Too many edge labels and node types can make the canvas confusing.

PoC mitigation:

- ship with a few node types
- make edges optional
- put the real workflow in the inspector and bundle preview

### Model-assisted Slicing

Calling a model for slicing would require API setup, cost, and privacy decisions.

PoC mitigation:

- heuristic slicing first
- model-assisted slicing later as optional
- never rewrite imported source by default

## Decision

Recommended first implementation:

- React + Vite + TypeScript
- React Flow for canvas
- simple custom text block editor first
- add Tiptap when inline selection/highlighting needs to feel polished
- Annotorious for image bbox
- local JSON workspace and markdown export

This keeps the first build small enough to finish while leaving a path to a richer plugin/MCP/app later.
