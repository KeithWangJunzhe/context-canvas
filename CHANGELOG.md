# Changelog

Context Canvas follows a lightweight milestone versioning model. Product milestones use major versions; fixes and additive changes within a milestone use patch or minor versions.

Context Canvas 使用轻量的里程碑版本策略：产品阶段使用 major version，同一阶段内的修复和增量功能使用 patch 或 minor version。

## [1.0.3] - 2026-08-05

- Align the packaged README with the `1.0.3` release and correct the release documentation before npm publish.
- 修正 npm 包内 README 与 `1.0.3` 发布版本的对应关系，并更新发布文档。

## [1.0.2] - 2026-08-05

- Fix the local CLI banner to read the installed package version instead of displaying a stale hardcoded version.
- 修复本地 CLI 启动提示硬编码旧版本号的问题，改为读取当前安装包版本。

## [1.0.1] - 2026-08-05

### Context curation / Context 编排

- Chat imports now default to `included`, so the fast path is to import everything and use `Ignore` to remove noise.
- Imported image sources retain an available local file name/path in Markdown and JSON output.
- The bundle output settings now include a connection toggle, persisted locally for repeat use.

### Connection output / Connection 输出

- Markdown now separates human-readable `Context Map` structure from `Context Details` content.
- Directed connections are shown as a branching map with parallel and unfinished paths.
- `related` connections are shown separately as non-hierarchical `Secondary Relations`.
- Nodes include type and stable id hints for agent/Codex lookup, while JSON exposes `flow|related` relation kinds.

### UI and annotation / UI 与标注

- Improved Canvas layout density and responsive resizing for Start, End, imported nodes, and text boxes.
- Text box titles remain in structured data but no longer clutter the Canvas node surface.
- Added image annotation cursor mode with movable and resizable bounding boxes/text boxes.
- Image annotation positions and sizes sync back to bundle output; empty placeholder labels are no longer displayed.

### Context curation / Context 编排

- Chat 导入默认变为 `included`，用户先导入完整上下文，再用 `Ignore` 快速做减法。
- 图片来源会在 Markdown 和 JSON 输出中保留可用的本地文件名/路径。
- 设置中新增 connection 输出开关，并保存在本地，方便重复使用。

### Connection output / Connection 输出

- Markdown 将人类可读的 `Context Map` 结构与 `Context Details` 内容分开。
- 有向连接以分叉树表达并行路径和未结束路径。
- `related` 连接单独放在非层级的 `Secondary Relations` 中。
- 节点带 type 和稳定 id 提示，JSON 关系明确区分 `flow|related`，方便 agent/Codex 定位。

### UI and annotation / UI 与标注

- 优化 Canvas 信息密度，以及 Start、End、导入节点和 text box 的响应式 resize。
- Text box 标题仍保留在结构化数据中，但不再占据 Canvas 节点表面。
- 图片标注新增光标模式，支持移动和 resize bbox/text box。
- 图片标注位置和尺寸会同步到 bundle 输出，空的占位标题不再显示。

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
