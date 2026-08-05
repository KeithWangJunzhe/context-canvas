# Release And Public Repository Guide

This document describes the current `1.0.3` release posture for Context Canvas. It is a patch release within the `1.0.0` personal-use milestone: the project is local-first, and future agent integrations remain experimental.

这份文档说明 Context Canvas 当前 `1.0.3` 的发布状态。这是 `1.0.0` 个人可用里程碑内的 patch 版本：项目是 local-first，未来的 agent integration 仍然是实验方向。

## Version policy / 版本策略

- `1.0.0 Personal Use`: local canvas, source review, annotation, bundle output, and Codex / Complex Chat import.
- `2.0.0 Interaction Stability`: UI refinement and repeated-use ergonomics.
- `3.0.0 Agent Integration`: hooks, direct context exchange, and HITL feedback loops.

Within a milestone, use patch releases for fixes and minor releases for additive features. The roadmap labels are product milestones; they do not mean every change between them is a breaking API change.

在一个大版本内，bug 修复使用 patch 版本，增量功能使用 minor 版本。Roadmap 的大版本是产品里程碑，不代表期间每次改动都构成 breaking API change。

## Local package / 本地包

The package is named `context-canvas` and exposes:

```bash
npx context-canvas
npx context-canvas --port 0
npx context-canvas --host 0.0.0.0
```

The CLI serves the built `dist` directory with Node built-ins. It does not provide a backend, account system, cloud sync, or automatic access to arbitrary local files.

本地包名为 `context-canvas`，CLI 使用 Node 内置模块提供 `dist` 静态服务。它不包含 backend、账户系统、云同步，也不能绕过浏览器权限自动读取任意本地文件。

## Release commands / 发布命令

From a clean checkout:

```bash
pnpm install
pnpm run build
pnpm run test:codex-import
pnpm pack
npm publish
```

The package has `prepublishOnly` build protection. Confirm the npm package name and npm account access before publishing. Do not publish a workspace export, rollout JSONL, screenshot with private material, or token.

在干净 checkout 中执行 build、importer test 和 `pnpm pack`。确认 npm 包名和账号权限后再执行 `npm publish`。不要把 workspace 导出文件、rollout JSONL、包含私人材料的截图或 token 发布出去。

## Public repository checklist / 公开仓库检查

- [ ] README describes the current `1.0.3` scope and local-only data behavior.
- [ ] `CONTRIBUTING.md` explains branches, validation, and privacy boundaries.
- [ ] Product manifesto and roadmap are clearly framed as hypotheses and direction, not promises.
- [ ] No personal workspace JSON, rollout JSONL, screenshots with private context, credentials, or local absolute paths are committed.
- [ ] `pnpm run build` passes.
- [ ] `pnpm run test:codex-import` passes.
- [ ] `pnpm pack` contains only the intended CLI, build output, README, and package metadata.
- [ ] A fresh local install can run `npx context-canvas` after npm publication.
- [ ] PRs explain what changed, how it was tested, and what remains limited.

## Automation direction / 自动化方向

Do not publish on every push. The recommended release workflow is tag-driven:

1. Merge and validate on `main`.
2. Update `CHANGELOG.md` and create a version tag such as `v1.0.1`.
3. A GitHub Action runs build, importer tests, package checks, and `npm publish` using an npm trusted publisher or an `NPM_TOKEN` repository secret.
4. The same Action creates a GitHub Release from the tag and links to the changelog entry.

This keeps experimental branches and ordinary commits out of npm. Changelog editing should remain human-reviewed; an Action can generate a release draft, but it should not silently rewrite product notes.

不要每次 push 都发布。更合适的是 tag-driven workflow：先合并并验证 `main`，人工更新 `CHANGELOG.md`，创建 `v1.0.1` 这样的 tag，再由 GitHub Action 运行 build、测试、package check 和 `npm publish`，最后创建 GitHub Release。这样实验分支和普通 commit 不会误发布到 npm。Release note 可以让 Action 自动生成草稿，但产品说明仍应人工审阅。

## OCR decision / OCR 决策

Browser OCR is feasible with a library such as Tesseract.js, but it is not a small toggle: language data adds download size, recognition is CPU-heavy, screenshots need preprocessing, and OCR output needs a review state because errors can become misleading context. For the current milestone, keep image paths and manual annotations as the source of truth. Consider OCR later as an explicit `Extract text` action that creates a reviewable text block rather than silently mutating the image node.

浏览器 OCR 技术上可行，例如使用 Tesseract.js，但它不是一个很轻的开关：语言模型会增加下载体积，识别占用 CPU，截图通常需要预处理，而且 OCR 结果必须经过审核，否则错误文字会变成误导 agent 的 context。当前阶段保留图片路径和手动标注作为事实来源。后续如果做 OCR，建议做成明确的 `Extract text` 操作，生成可审核的文本 block，不要静默修改图片节点。

公开前最后要确认：没有个人 workspace、rollout JSONL、私人截图、凭证或本地绝对路径进入仓库；build、importer test、package contents 和 fresh npx 启动都通过。
