# Changelog

Context Canvas follows a lightweight milestone versioning model. Product milestones use major versions; fixes and additive changes within a milestone use patch or minor versions.

Context Canvas 使用轻量的里程碑版本策略：产品阶段使用 major version，同一阶段内的修复和增量功能使用 patch 或 minor version。

## [Unreleased]

- Chat imports default to included context; users can remove noise with `Ignore`.
- Image sources include their local file name/path in Markdown and JSON output, even without annotations.
- Bundle output settings can include or omit connection relationships.
- Markdown connections are represented as a compact branching context flow, including parallel and unfinished branches.
- OCR remains a later optional capability; the current image workflow stays local and manual.

## [1.0.0] - 2026-08-04

- Local-first Context Canvas with Markdown, text, DOCX, image, note, and chat sources.
- Block-level and in-text annotation with included, excluded, pinned, and review states.
- Canvas nodes, editable connections, text box shapes, image bounding boxes, and local persistence.
- Markdown and agent-readable JSON bundle export.
- Codex Complex Chat import, turn review, used-context discovery, context node creation, and legacy JSONL support.
- Bilingual interface with English and Simplified Chinese localization files.
- `npx context-canvas` local CLI package.
