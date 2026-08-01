# Contributing to Context Canvas

> Context Canvas is currently a local PoC. Contributions should help validate the product thesis without turning the project into a general-purpose framework too early.
>
> Context Canvas 目前是 local PoC。贡献应帮助验证产品假设，避免过早把项目做成通用框架。

## Before coding / 开始之前

- Read the root [`README.md`](README.md) and [`docs/README.md`](docs/README.md).
- Check [`docs/DEV_LOG.md`](docs/DEV_LOG.md) for the current implementation shape.
- Check [`docs/ROADMAP.md`](docs/ROADMAP.md) before proposing a larger feature.
- Keep changes narrow enough to test locally.

开始开发前请先阅读根目录 README、文档地图和 `docs/DEV_LOG.md`。如果是较大的 feature，先对照 roadmap，确认它是在验证当前 PoC，还是属于未来 integration 方向。

## Branches / 分支

- Keep `main` usable for manual testing.
- Use a focused branch for feature work, for example `feature/image-annotation-export` or `agent/codex-import-experiment`.
- Use `integration/import-agent-chats` for the current contributor integration experiment when appropriate.
- Open a PR with a short description, screenshots for UI changes, and the validation command used.

保持 `main` 随时可以手动测试。新功能使用独立分支；如果是 agent import 这类实验，可以先放在 integration branch。UI 改动的 PR 请尽量附截图和验证命令。

## Local workflow / 本地流程

```bash
pnpm install
pnpm run dev
pnpm run build
```

The user normally starts and stops the dev server for manual testing. Do not leave a server running as part of a change unless the task explicitly asks for it.

用户通常会自行触发 dev server 做验收。除非任务明确要求，不要把常驻 dev server 作为开发结果的一部分。

## Product and code guidelines / 产品与代码约定

- Preserve the local-first, read-only import behavior.
- Prefer existing domain types and UI patterns before adding an abstraction.
- Keep both editing speeds: block-level bulk operations and precise in-text review.
- Automation should propose or assist; it should not silently remove user control.
- Keep exported context concise enough for an agent to read.
- Add a short dev-log note when a product behavior or data-model decision changes.

保留 local-first 和原始文件只读行为；优先复用已有领域类型和交互模式；同时保留 block 批量处理和文内精细标注两种速度；自动化应辅助而不是悄悄替用户决定；输出给 agent 的 context 要保持足够精炼。产品行为或数据模型发生变化时，补一条 dev log。

## Pull requests / PR

A useful PR explains:

- what changed
- why it belongs in the current phase
- how it was tested
- any known limitation or follow-up

一个有用的 PR 至少说明：改了什么、为什么属于当前阶段、怎么验证、还有哪些已知限制或后续工作。
