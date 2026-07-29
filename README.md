# Context Canvas

Local PoC for interactive context engineering.

Context Canvas explores a workflow where users can import source material, preview it, mark context as pinned or ignored, add reasons, and export an editable context bundle for Codex or other coding agents.

## Current PoC

- Local web UI built with React, TypeScript, Vite, and React Flow.
- Drag-and-drop and button import for Markdown, plain text, docx, png, jpg, and jpeg files.
- Read-only source preview with block-level triage.
- In-text selection annotations for finer-grained pin/include/ignore decisions.
- Image annotation with transparent bounding boxes and text boxes.
- Canvas assembly with manually editable source connections.
- Editable bundle preview before export, grouped by source component with file metadata and connection labels.
- New canvas flow with an option to download the current bundle before clearing the workspace.
- Local-first behavior: imported source files are read in the browser and are not modified. Workspace state is stored in localStorage for the PoC.
- Imported images are embedded as Data URLs so previews survive refresh/restart and workspace JSON export/import. This can make saved workspaces large.

## Status

This repository is currently a local PoC. The local dev and production build commands below have been tested. A hosted deployment path has not been finalized yet.

## Local Development

Prerequisites:

- Node.js 20 or newer available on `PATH`.
- pnpm.

```bash
pnpm install
pnpm run dev
```

The dev server runs at `http://127.0.0.1:5173/`.

## Validation

```bash
pnpm run build
```

You can also preview the production build locally:

```bash
pnpm run preview
```

Vite may warn that the built JavaScript chunk is larger than 500 kB. That is expected in the current PoC because docx parsing uses Mammoth in the browser.

When running inside Codex Desktop without a system Node install, use the bundled runtime path before the commands:

```bash
PATH=/Users/keith/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PWD/node_modules/.bin:$PATH pnpm run build
```

## Notes

Project planning, feasibility, and development notes live in `docs/`.
