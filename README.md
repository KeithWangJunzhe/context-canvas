# Context Canvas

Local PoC for interactive context engineering.

Context Canvas explores a workflow where users can import source material, preview it, mark context as pinned or ignored, add reasons, and export an editable context bundle for Codex or other coding agents.

## Current PoC

- Local web UI built with React, TypeScript, Vite, and React Flow.
- Drag-and-drop import for Markdown, plain text, and image files.
- Read-only source preview with block-level triage.
- In-text selection annotations for finer-grained pin/include/ignore decisions.
- Editable bundle preview before export.
- Local-first behavior: imported source files are read in the browser and are not modified.

## Local Development

```bash
pnpm install
pnpm run dev
```

The dev server runs at `http://127.0.0.1:5173/`.

## Validation

```bash
pnpm run build
```

## Notes

Project planning, feasibility, and development notes live in `docs/`.

