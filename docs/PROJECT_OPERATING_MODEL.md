# Context Canvas Project Operating Model

Last updated: 2026-07-28

This note captures how we want to run the project as it grows beyond the first local PoC.

## 1. Codex Autonomy And Subagent Use

Goal: let Codex run longer development arcs without losing the user's product intent.

Recommended mode:

- User drives product direction, interaction critique, and priority.
- Codex drives implementation, refactoring, validation, and local documentation.
- Subagents are used when a feature is big enough to split into parallel research or review work.

Good moments to use subagents:

- A feature has a clear goal and acceptance criteria.
- There are separable workstreams, such as UX audit, architecture review, test planning, and implementation review.
- We need a second pass on code quality or interaction risk.
- We need to compare technical options without blocking implementation.

Avoid subagents when:

- The product direction is still fuzzy.
- The user is actively riffing on UX.
- The work is a small UI tweak or a one-file fix.

Possible subagent roles:

- UX reviewer: inspect the flow from a non-technical user perspective.
- Architecture reviewer: check whether code structure is becoming brittle.
- Test planner: define realistic manual and automated checks.
- Docs keeper: update dev log, PRD, and decision notes after changes.
- Research scout: compare libraries or integration paths.

Suggested workflow for bigger features:

1. User describes the desired behavior and product why.
2. Codex writes a short implementation plan and acceptance criteria.
3. If useful, Codex spawns subagents for UX review and technical risk review.
4. Codex implements the feature.
5. Codex runs validation.
6. Codex updates `docs/DEV_LOG.md` and any relevant docs.
7. User tests manually and gives interaction feedback.

The important guardrail: autonomy should increase after the feature shape is clear, not before.

## 2. GitHub Repository

Goal: make the project easier to version, share, and eventually showcase.

Why GitHub helps:

- durable history of product decisions and code changes
- easier rollback and branching
- public/private project visibility options
- issue tracking for UX feedback and implementation tasks
- a future README/demo page for showcasing the concept

Recommended initial repo state:

- Keep it private at first.
- Add a clear README describing the concept and local PoC.
- Add screenshots or a short demo GIF once the UI is more coherent.
- Keep docs in `docs/`.
- Do not over-brand before the workflow is proven.

Suggested first GitHub checklist:

- initialize git inside `/Users/keith/Desktop/AI/context-forge` if not already initialized
- add `.gitignore` for `node_modules`, `dist`, local build/cache files
- commit current PoC and docs
- create GitHub repo
- push main branch
- optionally add issues for next features

When ready, installing/connecting the GitHub plugin could let Codex create issues, inspect PRs, or push via authorized GitHub workflows. Until then, local git plus manual GitHub setup is enough.

## 3. Figma / Design Workspace

Goal: create a place to discuss UI mechanics without forcing every design conversation through code.

Why Figma helps:

- quick exploration of layout alternatives
- annotate interaction ideas visually
- compare reader/sidebar/bundle panel arrangements
- preserve product design history
- create demo-ready screenshots or frames later

Recommended first Figma file structure:

- Page: `Product Principles`
  - document default include
  - block mode vs in-text mode
  - bundle as editable final draft
- Page: `Current PoC Screens`
  - screenshots of the running app
  - notes on pain points
- Page: `Reader Interaction`
  - selection floating menu
  - block controls
  - annotation reason flow
- Page: `Bundle Output`
  - generated vs edited output
  - export affordances
- Page: `Future Canvas`
  - document/image/note/bundle nodes
  - relationship lines

Design workflow:

1. User screenshots current app or rough idea.
2. Put screenshot in Figma.
3. Mark friction points directly.
4. Codex translates those notes into implementation tasks.
5. After implementation, update screenshots.

When ready, installing/connecting the Figma plugin could let Codex inspect Figma frames or use them as implementation references. For now, screenshots pasted into the chat are enough.

## 4. Suggested Project Rhythm

Lightweight loop:

1. User tests the local PoC.
2. User gives annotated screenshot or bullet feedback.
3. Codex groups feedback into:
   - quick fixes
   - product decisions
   - larger features
   - parking lot
4. Codex implements quick fixes directly.
5. For larger features, Codex writes a plan first and uses subagents if the work is separable.
6. Codex updates dev docs after each meaningful change.

Do not over-process the project too early. The product is still interaction-led.

## 5. Near-term Non-code Setup

Good next setup tasks:

- Create GitHub repo.
- Add README and `.gitignore`.
- Decide private vs public.
- Create a Figma file for screenshots and flow notes.
- Capture current app screenshots into Figma.
- Add a small issue backlog:
  - delete annotations
  - reason input in floating menu
  - load workspace JSON
  - copy bundle draft
  - improve markdown parsing
  - durable text anchoring

## 6. Principle

The user should keep owning taste, friction, and product truth.

Codex should own implementation pressure, technical memory, and careful follow-through.
