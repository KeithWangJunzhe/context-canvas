# Context Canvas Roadmap

Last updated: 2026-08-01

This roadmap captures the current product phasing. It is intentionally practical: prove the workflow with the user's own work first, make the interaction strong enough for repeated use, then explore larger agent integrations and assisted intent operations.

## Product Thesis

Context Canvas may become part of a future chat or agent interface rather than a separate destination forever.

The near-term framing is not just "context management." The deeper problem is intent expression: users need a better way to brief an LLM than writing a long fragile prompt in one linear textbox.

The product should help users separate and assemble:

- background material
- current goal
- requirements and constraints
- pinned facts or decisions
- stale or misleading context
- evidence
- open questions
- final bundle text for an agent run

In short: agents are getting better at executing; humans still need a better way to express what they want executed.

## Phase 1: Personal Usable And Interaction-Ready Context Canvas

Goal: the user can use the tool for real Codex work, and the interaction is calm enough for continuous context editing.

Primary workflow:

1. Find local markdown/doc/text/image files.
2. Drop them onto the canvas.
3. Preview and annotate source material.
4. Arrange or connect context sources.
5. Generate an editable bundle.
6. Copy or export that bundle for Codex or another agent.

Current capabilities:

- md/txt/docx import
- png/jpg/jpeg import
- local source files stay read-only
- document preview
- block-level pin/include/ignore
- in-text pin/include/ignore annotations
- image bbox/text annotations
- canvas nodes and editable connections
- editable bundle output
- md/txt/json bundle export
- localStorage persistence
- Data URL image persistence for refresh/restart and workspace JSON export/import
- bidirectional reader/block review for text nodes

Phase 1 validation:

- Use real project material, not only sample files.
- Check whether the generated bundle actually helps Codex perform better than raw pasted context.
- Record bug reports with steps, expected behavior, actual behavior, and screenshot/file when useful.
- Tune the output structure based on Codex readability.

Phase 1 tail:

- Make pasted messy project chat usable enough for real testing.
- Improve rule-based slicing for chat, documents, and notes.
- Add canvas-native text boxes, rectangles, and simple flow annotations.
- Keep semantic text box nodes small and legible: rectangle, rounded rectangle, diamond, and cylinder with optional shape meaning.
- Add overview screenshot export with matching structured context data.
- Improve delete behavior for nodes, edges, blocks, and annotations.
- Add practical keyboard shortcuts for frequent editing actions.
- Clean up noisy block inspector states for high block counts.
- Improve output preview as a final editable handoff surface.
- Add copy-to-clipboard for the bundle draft if it becomes a frequent manual step.
- Keep fixing reliability bugs that block personal use.

## Phase 1.5: Messy Chat Intake

Messy chat is important but has two different product directions.

Direction A: import adapters.

- Handle exports from specific products or IM tools.
- Risk: many apps have no export, poor export, or incompatible formats.
- Better suited after real examples accumulate.

Direction B: paste-first cleanup.

- User copies a messy transcript into the app.
- The app uses rules first, then possibly an LLM later, to split and label messages.
- This better fits the PoC because copy/paste works across almost every app.

Recommended path:

1. Improve rule-based slicing for copied chat.
2. Support common speaker markers, timestamps, quote blocks, and repeated-message cleanup.
3. Keep blocks editable so the parser can be imperfect.
4. Later explore LLM-assisted structure-only cleanup.

## Phase 2: Productization Polish

Goal: make the tool easier for other people to adopt, test, and contribute to after the creator's personal workflow is proven.

Focus areas:

- onboarding examples and demo workspaces
- clearer README and contribution guide
- public-facing product screenshots
- stable bundle schema examples
- better empty, error, and quota states
- UX review notes from real use sessions
- accessibility and responsive layout pass
- internal design system cleanup

Principle: Phase 2 should make the project easier to understand from the outside without overfitting the tool to a generic audience too early.

## Phase 3: Agent Integration And Assisted Intent Ops

Goal: explore where lightweight agent help and external tool hooks genuinely reduce briefing effort.

Integration experiments can start before Phase 3 if they are narrow and isolated, such as a contributor branch for one Codex or Claude Code import hook. Full compatibility across agent systems should remain a larger phase.

Possible features:

- Codex, Claude Code, OpenClaw, and other local agent import hooks
- structured agent-canvas adapters
- LLM-assisted chat slicing
- auto-label requirements, decisions, assumptions, questions, evidence, and noise
- local document search
- project-level document management
- automatic summary blocks
- suggestions for pin/ignore
- bundle draft generation based on a stated goal
- context diff between bundle versions
- intent blocks such as goal, constraint, acceptance criteria, preference, non-goal, and open question
- canvas overview screenshot plus coordinate-linked structured data

Research questions:

- Which parts should be rule-based versus LLM-assisted?
- What can run locally and what needs an API?
- How should the user review or override automated suggestions?
- Does the product remain a canvas, become a chat input layer, or get embedded into an agent IDE?

## Current Scope Rule

When deciding whether a new idea belongs now:

- Phase 1 work should help the user use the tool on real local context today.
- Phase 2 work should make frequent interactions faster and less annoying.
- Phase 3 work should wait until real use reveals which automation would save meaningful effort.
