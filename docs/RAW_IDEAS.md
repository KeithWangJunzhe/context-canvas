# Context Canvas Raw Ideas

Date: 2026-07-17

This file keeps loose ideas before they become product requirements.

## Product Direction

Context Canvas is a freeform workspace for preparing context for AI agents. It is not primarily a memory database, a RAG tool, or a prompt editor. It lets users collect messy material, annotate it, relate it, cut it down, and export a structured context bundle.

The motivating pain: chat and agent sessions become chaotic, append-only, and hard to steer. Users often know which parts are stale, important, misleading, or useful, but current tools rarely let them express that directly.

## Core Metaphor

Think of it as a context cutting room:

- import raw footage: chats, docs, images, notes
- mark the parts that matter
- cross out stale or misleading parts
- add editorial notes explaining why
- assemble a bundle for the next model run

The model sees structured data. The user sees a canvas and annotations.

## Canvas Objects

- Document node: markdown, text, PDF later, code, copied docs, tool output
- Chat transcript node: pasted chat from ChatGPT, Claude, Codex, Cursor, etc.
- Image node: screenshots, UI mocks, terminal screenshots, browser states
- Note node: requirements, decisions, questions, assumptions, reminders
- Bundle node: a prepared context package for one model run

## Relationships

Possible edge labels:

- supports
- contradicts
- depends on
- replaces
- stale because
- evidence for
- ignore when
- related to

Relationships should be optional in PoC. If edge labeling becomes slow, simple unlabeled links plus notes may be enough.

## Source Detail View

Each node can open into a detail reader.

For text/chat/docs:

- highlighter for important context
- ignore marker for stale or misleading context
- pin marker for constraints and requirements
- inline note or reason
- merge/split blocks
- tag as requirement, fact, decision, question, assumption, noise

For images:

- draw bounding boxes
- add region notes
- mark region as bug, reference, focus, ignore, requirement
- export image path plus region metadata

## Lifecycle

Four visible states:

```text
Import -> Editing -> Archived -> Output / Use
```

Import:

- paste copied chat
- drop/upload markdown or text
- paste/upload image
- auto-create source node and initial blocks

Editing:

- annotate blocks
- link nodes
- record reasons
- build bundle nodes

Archived:

- store stable context assets
- version them with timestamp and notes
- let users reopen and fork

Output / Use:

- export `context-bundle.md`
- export `context-bundle.json`
- copy prompt-ready bundle
- later send to Codex through skill/plugin/MCP

## Input Constraints for First Version

Keep v1 narrow:

- pasted chat transcript
- markdown/plain text document
- image upload or paste

Defer:

- Drive/Notion/GitHub integrations
- live browser clipping
- full PDF parsing
- multi-user collaboration
- native Codex hidden-context editing

## Chat Import Thoughts

Most chat apps do not provide clean export. Copy is preferred, screenshots are fallback.

The import system should:

- accept messy pasted text
- detect speaker boundaries where possible
- preserve original text
- slice into blocks
- allow manual merge/split
- optionally ask a model to do structure-only slicing and tagging

The model-assisted slicer should not rewrite content by default. It can label, split, infer roles, and tag. Summaries should be clearly marked as generated.

## Automation Later

More "foolproof" automatic orchestration can come later:

- auto-arrange canvas
- auto-cluster related blocks
- auto-detect stale assumptions
- auto-detect contradictions
- auto-suggest pins
- auto-build bundle variants
- auto-compress noisy sections

But early philosophy should stay user-directed. The system assists context management; it does not fully take over context decisions.

