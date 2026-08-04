# Release And Public Repository Guide

This document describes the current `1.0.0` release posture for Context Canvas. It is intentionally small: the project is local-first, and the first public release should make the working idea inspectable without pretending that future agent integrations are complete.

这份文档说明 Context Canvas 当前 `1.0.0` 的发布状态。它保持克制：项目是 local-first，第一次公开应让别人能检查和运行当前想法，不把未来的 agent integration 伪装成已经完成。

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

- [ ] README describes the current `1.0.0` scope and local-only data behavior.
- [ ] `CONTRIBUTING.md` explains branches, validation, and privacy boundaries.
- [ ] Product manifesto and roadmap are clearly framed as hypotheses and direction, not promises.
- [ ] No personal workspace JSON, rollout JSONL, screenshots with private context, credentials, or local absolute paths are committed.
- [ ] `pnpm run build` passes.
- [ ] `pnpm run test:codex-import` passes.
- [ ] `pnpm pack` contains only the intended CLI, build output, README, and package metadata.
- [ ] A fresh local install can run `npx context-canvas` after npm publication.
- [ ] PRs explain what changed, how it was tested, and what remains limited.

公开前最后要确认：没有个人 workspace、rollout JSONL、私人截图、凭证或本地绝对路径进入仓库；build、importer test、package contents 和 fresh npx 启动都通过。
