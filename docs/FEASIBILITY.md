# Context Forge Feasibility Study

Date: 2026-07-17

## One-line Thesis

Interactive Context Editing is feasible as a Codex-adjacent workflow today, but not yet as a true "edit the hidden inference context of the current Codex task" plugin. The practical PoC should treat context as an explicit, user-curated artifact that Codex can read, transform, diff, and use for the next turn.

## Problem

Current AI coding/chat surfaces mostly treat context as append-only:

- conversation messages accumulate
- tool results accumulate
- summaries and compaction happen automatically
- memory and retrieval add context from outside the visible chat

The user has little direct control over which pieces become model input. The desired product is closer to an IDE for context:

- include or exclude messages, files, tool results, notes, and claims
- pin important blocks
- compress or replace noisy blocks
- branch from a curated context state
- replay a step with a changed context set
- diff two runs by context, not only by output

## Current Landscape

Observed categories:

- Context compression: systems such as Selective Context prune low-value tokens automatically. Useful, but the control loop belongs to the algorithm rather than the user.
- Memory/RAG layers: save and retrieve long-term context, often automatically. Useful, but they do not make the current inference bundle inspectable or editable.
- Conversation trees: research and prototypes recognize append-only chat as a problem and explore branching.
- Coding-agent context stacks: some tools expose files, notes, todos, and search results as cards, but usually at file/tool-result granularity rather than sentence/message granularity.
- GitHub Copilot CLI: documents `/context`, compaction, checkpoints, and token usage visibility. This supports the thesis that context is becoming a visible product surface, but it still does not appear to offer message-level include/exclude editing.

## Codex Surface Reality

From the current Codex manual:

- Plugins can bundle skills, connectors, MCP servers, hooks, browser extensions, and scheduled task templates.
- Plugins are available in Codex inside the ChatGPT desktop app and in the Codex CLI plugin browser.
- Skills are reusable workflows with instructions and resources.
- MCP servers expose tools and structured data to the model.
- Connectors/apps can optionally include custom ChatGPT UI.
- Plugin permissions and data access remain bounded by the host sandbox, approvals, and connector authentication.

Important boundary:

There is no documented public plugin API that lets a plugin mutate or selectively delete the hidden message/tool/system context of the current Codex task before the next model call.

So the PoC should not assume we can intercept Codex's internal prompt assembly. Instead, we can build a sidecar context workspace and ask Codex to use its exported context bundle.

## Feasibility Verdict

### Feasible Now

- Build a local context workspace that stores blocks as structured JSON.
- Import pasted conversations, markdown notes, files, command outputs, and manually added claims.
- Provide include/exclude/pin/compress/replace metadata.
- Export a "context bundle" markdown or JSON file for Codex to use.
- Add a Codex skill that teaches Codex how to read the bundle and honor disabled blocks.
- Add an MCP server later so Codex can query selected blocks, list active context, and write new blocks.
- Provide a local web UI for highlight/select/deselect and context diffing.

### Partly Feasible

- Replay: possible if replay means "generate a new prompt/context bundle from a selected state." Not possible as true rewind of this Codex task unless Codex exposes task-history editing APIs.
- Diff: feasible for context bundles and outputs; harder for hidden internal context.
- Branch: feasible inside the sidecar workspace; not necessarily as native Codex task branches.
- Message-level import: feasible from pasted/exported transcripts; not necessarily from live Codex task internals.

### Not Feasible Yet, Publicly

- Directly editing current Codex inference context.
- Hiding a prior message from Codex's internal chat history while staying in the same task.
- Intercepting prompt cache or internal compaction decisions.
- Guaranteeing that disabled content is absent from all hidden summaries, memories, or tool traces unless the whole next run is constructed from an explicit exported bundle.

## Product Shape

Working name: Context Canvas.

The product should feel less like a prompt editor and more like a freeform workspace for arranging model evidence. Users can drop in documents, chat transcripts, screenshots, notes, and files, then link, mark, highlight, ignore, or annotate them before building a context bundle.

Core object:

```json
{
  "id": "block_001",
  "source": "conversation|file|tool_result|note|memory|summary",
  "role": "user|assistant|system|tool|external",
  "text": "...",
  "status": "included|excluded|pinned|compressed|replaced",
  "reason": "why this block is included or excluded",
  "tags": ["requirement", "constraint", "noise"],
  "parents": [],
  "created_at": "2026-07-17T00:00:00Z"
}
```

Minimum useful UX:

- left: source transcript or notes
- center: block list with toggles, pin, tags, and search
- right: exported prompt/context bundle preview
- bottom: token estimate, included/excluded counts, diff between two bundle states

Potential canvas objects:

- `DocumentNode`: pasted transcript, markdown, source file, PDF, webpage excerpt, tool output
- `ImageNode`: screenshot, mockup, UI state, terminal screenshot
- `NoteNode`: user-authored requirement, question, decision, concern, assumption
- `BundleNode`: a named context package prepared for a model run

Potential relationships:

- supports
- contradicts
- depends on
- replaces
- stale because
- evidence for
- ignore when

The canvas should let users create multiple bundle nodes, such as "full exploration", "minimal coding context", "UI bug only", or "exclude stale assumptions". Branching and diffing can emerge from comparing bundle nodes rather than requiring native chat branches.

## Canvas Lifecycle

The core workflow should have four visible states:

```text
Import -> Editing -> Archived -> Output / Use
```

- Import: bring in a limited set of source types and create initial nodes/blocks.
- Editing: annotate, highlight, exclude, pin, link, split, merge, and record reasons.
- Archived: save a stable context asset with version, timestamp, and notes. Archived assets can still be reopened, but they represent a known state.
- Output / Use: export a context bundle as markdown or JSON, copy it into a model prompt, or later send it through a Codex skill/plugin/MCP workflow.

This lifecycle helps keep the product from becoming a generic whiteboard. The canvas is a workspace for preparing model context, and bundle output is the moment where the user's editing work becomes agent-usable structure.

## Import and Slicing

Chat history is a high-friction but high-value import path. Many chat apps do not provide clean export, so the product should assume users will start from:

- copied chat text, recommended when available
- screenshots, useful when copy is blocked or visual layout matters
- mixed snippets from multiple apps
- raw markdown, logs, or copied terminal output

The import flow should be forgiving:

1. Paste or drop source material.
2. Detect likely source type: ChatGPT, Claude, Codex, terminal, markdown, plain text, image.
3. Slice into blocks.
4. Let the user review and merge/split blocks.
5. Optionally run a model-assisted cleanup pass that labels blocks as requirements, decisions, stale assumptions, questions, evidence, or noise.

For chat transcripts, the first parser can use heuristics:

- speaker markers such as `User:`, `Assistant:`, role labels, or copied UI separators
- paragraph boundaries
- timestamp or message boundary patterns
- code fences and tool-output blocks
- repeated assistant/user alternation

When heuristics fail, the app can ask a model to perform structure-only cleanup:

- split into messages or semantic blocks
- infer speaker where possible
- preserve original text verbatim
- assign provisional tags
- never rewrite content unless explicitly asked

This should be treated as an ingestion assistant, not as summarization. The trust contract is important: users need to know whether a block is original text, model-sliced original text, or model-generated summary.

## Image and Screenshot Annotation

Screenshots are first-class context, especially for coding agents working on UI, browser bugs, terminal errors, and design implementation.

Minimum image object features:

- upload or paste screenshot
- draw bounding boxes
- attach note to each region
- mark region as focus, bug, ignore, reference, or requirement
- export region metadata into the context bundle

Example image-region block:

```json
{
  "type": "image_region",
  "image_id": "img_001",
  "box": [120, 80, 360, 210],
  "label": "wrong spacing",
  "status": "included",
  "note": "The button is too close to the title.",
  "instruction": "fix"
}
```

For the bundle, image annotations should export as both human-readable markdown and structured JSON references. The image itself can be copied into an assets folder or referenced by path.

## PoC Recommendation

Build the PoC as a local web app plus a Codex skill, not as a full plugin first.

Reason:

- A skill is enough to standardize the workflow: "read `context-bundle.md`, obey included/excluded blocks, produce changes, write back notes."
- A local web app proves the interaction model faster than a plugin package.
- If the PoC is useful, package it as a Codex plugin with:
  - bundled skill
  - optional MCP server
  - optional app/custom UI if the ChatGPT app UI route is needed

## PoC Milestones

1. Manual bundle MVP
   - Create `context.json`
   - Parse a pasted transcript into blocks
   - Toggle include/exclude/pin in a simple UI
   - Export `context-bundle.md`

2. Codex workflow MVP
   - Add a skill or local instruction file telling Codex to treat `context-bundle.md` as the canonical context
   - Test a task twice with different excluded blocks
   - Compare outputs and document behavior

3. MCP/tool MVP
   - `list_blocks`
   - `get_active_context`
   - `set_block_status`
   - `export_bundle`
   - `record_decision`

4. Plugin MVP
   - Package the skill and MCP server
   - Add marketplace metadata
   - Validate installation in Codex desktop/CLI

## Biggest Risks

- False sense of deletion: excluding a visible block does not remove content already present in hidden summaries or memory.
- UX overload: message-level control can become too granular. Need block grouping, tags, search, and quick presets.
- Trust contract: Codex must reliably honor excluded blocks. This needs explicit bundle format and tests.
- Import friction: unless there is a supported transcript export, users may start by pasting chat logs manually.
- Native limitations: plugin APIs may not expose enough UI/control hooks for a first-class inline context editor.

## Best First Experiment

Take one real messy Codex/GPT transcript and run:

1. baseline: ask Codex with the whole transcript
2. curated: import transcript, exclude stale assumptions/noise, pin requirements, export bundle
3. compare: quality, token size, time-to-answer, hallucinated stale assumptions

Success criterion:

The curated run should produce a measurably better or more controllable answer than the baseline, and the user should feel the editing UI is faster than rewriting the prompt by hand.

## Go / No-go

Go to PoC if:

- manual transcript import feels useful within 30 minutes
- excluded stale assumptions stop affecting model output in at least one realistic task
- the exported bundle format is understandable by both user and Codex

No-go or pivot if:

- the UI is slower than simply writing a clean prompt
- Codex repeatedly uses excluded material because it is still in live chat context
- the value only appears when native hidden-context APIs exist

## Near-term Build Decision

Recommended next step:

Create a tiny local app in `context-forge/`:

- TypeScript/Vite or single-file HTML depending on desired speed
- local JSON file format
- limited first-wave inputs: pasted chat transcript, markdown/plain text document, uploaded or pasted image
- markdown/plain-text transcript parser
- block-level toggles
- freeform canvas with document, image, note, and bundle nodes
- text highlighter for include/exclude/pin annotations
- image bounding boxes with notes
- export preview
- sample bundle from the pasted project idea

Do not create a Codex plugin until the interaction loop has survived one real transcript.

Later automation ideas:

- automatic canvas arrangement
- automatic block tagging
- contradiction detection
- stale-assumption detection
- auto-generated context bundle variants
- model-assisted cleanup and compression

These should remain out of the first PoC except for very small ingestion helpers. The early product philosophy is semi-automatic: the system helps slice and organize, but the user makes the context decisions.
