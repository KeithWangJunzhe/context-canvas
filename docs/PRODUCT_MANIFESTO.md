# Context Canvas Product Manifesto

Date: 2026-08-01

This is an internal product philosophy note. It is not a PRD. It captures why Context Canvas should exist, what kind of product judgment it needs, and how we should decide which features matter.

## Thesis

AI agents are getting better at execution, but humans still lack a good interface for expressing intent before execution starts.

Most current tools optimize what happens after the prompt:

- better models
- better agent loops
- better tool use
- better memory
- better retrieval
- better task execution

Context Canvas focuses on the missing layer before the prompt: how a human gathers, filters, relates, and explains the context that makes an AI task understandable.

The product is not only context management. It is intent management.

## Core Metaphor

GoodNotes is a notebook optimized for humans to read organized thoughts.

Context Canvas is a notebook optimized for visually capable LLMs and agents to read organized intent.

The user sees a canvas, documents, screenshots, annotations, boxes, arrows, and comments.

The model receives structured data: selected context, skipped context, pinned constraints, relationships, reasons, and evidence.

## What We Are Really Building

Context Canvas should help a user move from messy personal context to agent-ready working context.

It should support the natural human workflow:

1. Collect raw material.
2. Read and inspect it.
3. Mark what matters.
4. Cross out what is stale, misleading, or irrelevant.
5. Explain why certain context matters.
6. Connect related pieces.
7. Export a bundle that an agent can use without needing the whole messy history.

The product should make the invisible work of briefing an AI visible, editable, and reusable.

## Product Beliefs

Context is not just text.

Context includes files, screenshots, visual regions, notes, conversations, decisions, assumptions, constraints, relations, and the reasons behind selection.

Message history is not the same as model context.

A chat timeline is append-only, but intent is not append-only. Users often need to replace, exclude, pin, branch, and reinterpret past context.

Manual control matters.

Automation can help with slicing, labeling, search, and cleanup, but early product value should come from giving the user direct control over what the model should treat as important.

Excluded context still has meaning.

Ignoring something is not deletion. It is a context decision. The reason should be preservable because stale assumptions, contradicted evidence, and known non-goals often help the agent avoid wrong paths.

Output should be just enough.

The bundle should not dump the entire workspace. It should provide the minimum useful context for the next agent run, with clear read policy and inspectable structure.

## Why Canvas

A canvas is useful because intent is often relational.

The user may need to show:

- this screenshot supports that requirement
- this chat contains old assumptions
- this note overrides that document
- this file is background only
- this decision should be pinned
- this evidence should be included only for one task

Linear chat makes these relationships hard to express. A canvas lets the user organize meaning spatially and structurally, then export that structure as agent-readable data.

## Near-Term Product Shape

Phase 1 should be strong enough for real personal use.

It should include both utility and interaction quality:

- local markdown, text, docx, image, and pasted chat intake
- rule-based slicing that produces useful blocks
- document/chat reader with bidirectional block review
- image bounding box and text annotation
- canvas nodes, edges, text boxes, rectangles, and simple flow shapes
- pin/include/ignore/needs_review states
- reason fields and tags
- editable output preview
- markdown and agent-readable JSON export
- localStorage and workspace export/import
- comfortable deletion, selection, shortcut, and save feedback behavior

The first bar is not "complete platform." The first bar is: the creator can use it for real Codex work and prefer it over pasting raw context.

## Later Product Shape

Integration work can begin early as experiments, but full compatibility is a larger phase.

Future directions:

- import hooks for Codex, Claude Code, OpenClaw, and other local agent tools
- structured agent-canvas adapters
- model-assisted slicing and labeling
- local document search
- project-level context libraries
- bundle diff and replay
- intent-specific blocks such as goal, constraint, acceptance criteria, non-goal, preference, and open question
- canvas overview screenshot plus coordinate-linked structured data

The likely best fate of Context Canvas is not necessarily to remain a standalone app forever. It may become a paradigm or interface layer absorbed by agent systems.

That is acceptable. The goal is to prove a better way for humans to express intent to AI.

## Product Risks

The UI can become too complex.

If every block can be pinned, ignored, connected, tagged, annotated, rewritten, summarized, and exported, the interface can become noisy. The design must preserve a calm default workflow.

The output can become too verbose.

If the bundle includes everything, it recreates the original problem. Export should always favor just enough context.

Automation can erase user agency.

If the tool becomes another black box that decides context automatically, it loses the key differentiator. Automation should propose, not silently decide.

Integrations can consume the product.

Every agent and chat tool has different data shapes. The product should define a clean internal model first, then build adapters around it.

## North Star

Context Canvas helps people express intent to AI with the same care they use when organizing thoughts for themselves.

It turns scattered material into a structured, visual, inspectable brief that an agent can actually use.
