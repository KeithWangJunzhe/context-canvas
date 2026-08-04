# Context Canvas

> A local-first canvas for turning scattered material into agent-ready intent.
>
> 一个 local-first 的上下文画布，把分散的材料整理成 agent 能使用的 intent。

[English](#english) | [中文](#中文)

## English

Context Canvas is a frontend-heavy local PoC for interactive context engineering. It helps a person assemble the material around a task before handing it to Codex or another AI agent.

Current release: **1.0.0 Personal Use**. This milestone means the local-first workflow is usable end to end; it does not imply that the future agent integration surface is stable.

Current release: **1.0.0 Personal Use**. This milestone means the local-first workflow is usable end to end; it does not imply that the future agent integration surface is stable.

The central idea is simple: agents are getting better at execution, while people still need a better interface for expressing intent. Instead of pasting one long, messy prompt, users can bring documents, chat transcripts, screenshots, and notes into a canvas; review them at block or in-text level; connect related sources; and export a compact context bundle.

This is not a finished plugin, memory system, or RAG product. It is a practical experiment in intent management.

### What works today

- Local React + TypeScript + Vite app with a React Flow canvas.
- Drag-and-drop and button import for Markdown, plain text, docx, png, jpg, and jpeg.
- Document, chat, and note reader with block-level and in-text review.
- Pin, include, ignore, needs-review, tags, and annotation reasons.
- Image bounding boxes and text boxes with preset colors and fonts.
- Canvas nodes, editable connections, source deletion, Start/End system nodes, and New canvas flow.
- Editable bundle preview with Markdown and agent-readable JSON export.
- Local-first persistence through `localStorage`; imported source files are read-only.
- Imported image data is embedded as Data URLs so local previews survive refresh and workspace export/import.

### Product direction

The near-term goal is personal usefulness: use real project material, curate it quickly, and check whether the resulting bundle helps Codex more than raw copy/paste.

The larger hypothesis is that Context Canvas may eventually become a layer inside a chat UI or agent IDE. Future experiments may include agent chat import hooks, assisted slicing and labeling, local context libraries, bundle diff/replay, and intent-specific blocks such as goals, constraints, acceptance criteria, and open questions. These are directions, not promises of the current PoC.

### Quick start

Requirements: Node.js 20+ and pnpm.

Run the packaged local app with npm:

```bash
npx context-canvas
```

The CLI prints a local URL and serves the built app on `127.0.0.1`. Use `--port 0` for an available port or `--host 0.0.0.0` when you explicitly need LAN access.

```bash
pnpm install
pnpm run dev
```

Open `http://127.0.0.1:5173/` in a browser. Stop the server with `Ctrl-C`.

Build a production bundle:

```bash
pnpm run build
```

The current build may emit a Vite chunk-size warning because Mammoth is bundled for browser-side docx extraction. It does not prevent the local PoC from running.

### Version roadmap

- `1.0.0`: Personal-use local workflow: canvas assembly, annotation, bundle export, and Codex session context import.
- `2.0.0`: A calmer and more stable interaction system, with UI refinement driven by real usage.
- `3.0.0`: Agent integration and feedback loops, including hooks and more direct context exchange.

These are product milestones, not a promise that every minor change between milestones will be breaking under strict Semantic Versioning.

When using Codex Desktop without a system Node installation:

```bash
PATH=/path/to/node/bin:$PWD/node_modules/.bin:$PATH pnpm run build
```

### Repository map

```text
src/                 App, domain model, bundle generation, and styles
docs/                Product thinking, roadmap, feasibility, and handoff notes
README.md            Project entry point
CONTRIBUTING.md      Branch, PR, and local validation guidance
package.json         Scripts and runtime dependencies
```

Start with [`docs/README.md`](docs/README.md) for the document map. The most useful first reads are [`docs/PRODUCT_MANIFESTO.md`](docs/PRODUCT_MANIFESTO.md), [`docs/PRODUCT_BRIEF_ZH.md`](docs/PRODUCT_BRIEF_ZH.md), [`docs/ROADMAP.md`](docs/ROADMAP.md), and [`docs/DEV_LOG.md`](docs/DEV_LOG.md).

### Branches and collaboration

- `main`: current `1.0.0` personal-use release baseline.
- `experiment/codex-complex-chat`: completed Codex / Complex Chat integration branch, now consolidated into `main`.
- `codex/codex-import-support`: original contributor branch retained as the history of PR #1.
- New work: use a focused feature branch and open a PR.

For new work, create a focused feature branch and open a PR. Experimental integrations should be reviewable in their own branch before they are considered for `main`. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

### Scope and status

This repository is intentionally local-first and personal-use stage. There is no hosted deployment, account system, cloud sync, or native plugin package. An npm CLI now distributes the local web app, but there is no guarantee that an already-running agent conversation will change when a source is ignored. The exported bundle is the explicit source of truth for a future agent run.

The roadmap is organized around three layers:

1. Make the canvas personally useful and calm to operate.
2. Make the project easier for other people to understand and contribute to.
3. Explore agent integrations and assisted intent operations after real use reveals which automation matters.

### Privacy and data model

Imported files are read in the browser and are not edited, deleted, or written back. Browser imports cannot reveal a full local filesystem path; the app keeps the browser-provided relative path or filename when available. Workspace state stays in local storage unless the user explicitly exports it.

Images are currently stored as Data URLs in the local workspace. This keeps the PoC self-contained, but large image collections can exceed browser storage limits. A future desktop/app version can move image bytes to IndexedDB or a workspace asset folder.

## 中文

Context Canvas 是一个 frontend-heavy 的本地 PoC，用来在把材料交给 Codex 或其他 AI agent 之前，先把任务上下文和 intent 组织清楚。

当前版本：**1.0.0 Personal Use**。这个版本表示 local-first 工作流已经可以端到端使用，不代表未来 agent integration 的接口已经稳定。

核心想法很简单：agent 越来越擅长执行，但人仍然缺少一种清晰表达意图的界面。用户可以把文档、聊天记录、截图和笔记放进画布，按 block 或文内内容审阅，连接有关联的材料，然后导出一份紧凑的 context bundle，而不是直接把一大段混乱内容复制进聊天框。

它现在还不是一个完整插件、memory 系统或 RAG 产品，而是一个关于 intent management 的可用实验。

### 当前已经可以做什么

- 本地 React + TypeScript + Vite 应用，以及 React Flow 画布。
- 支持拖拽和按钮导入 Markdown、纯文本、docx、png、jpg、jpeg。
- 文档、聊天和笔记 reader，支持 block 级和文内审阅。
- Pin、Include、Ignore、Needs review、标签和标注原因。
- 图片 bounding box 和 text box，支持预设颜色与字体。
- 画布节点、可编辑连线、素材删除、Start/End 节点和 New canvas 流程。
- 可编辑的 bundle preview，以及 Markdown、agent-readable JSON 导出。
- 通过 `localStorage` 做 local-first 保存；导入的原始文件只读，不会被修改。
- 图片以 Data URL 保存，因此刷新和 workspace 导入导出后仍能在本地预览。

### 产品方向

近期目标是先让作者自己真实使用：把项目材料整理好，快速生成 bundle，并检验它是否比原始复制粘贴更能帮助 Codex 工作。

更大的假设是，Context Canvas 未来可能成为 chat UI 或 agent IDE 里的一层界面。后续可以探索 agent 聊天记录导入 hook、辅助切分和打标签、本地 context library、bundle diff/replay，以及 goal、constraint、acceptance criteria、open question 等 intent block。这些是方向，不代表当前 PoC 已经承诺实现。

### 快速开始

需要 Node.js 20+ 和 pnpm。

也可以直接运行已打包的本地应用：

```bash
npx context-canvas
```

CLI 会输出本地访问地址，并默认监听 `127.0.0.1`。需要使用可用端口时可以运行 `npx context-canvas --port 0`；只有明确需要局域网访问时才使用 `--host 0.0.0.0`。

```bash
pnpm install
pnpm run dev
```

然后打开 `http://127.0.0.1:5173/`。停止服务使用 `Ctrl-C`。

验证生产构建：

```bash
pnpm run build
```

当前构建可能因为浏览器端 docx 解析使用 Mammoth 而出现 Vite chunk-size warning。这不会影响本地 PoC 的运行。

### 版本路线

- `1.0.0`：个人可用的本地工作流：Canvas 编排、标注、Bundle 导出和 Codex session context 导入。
- `2.0.0`：围绕真实使用继续打磨 UI，让交互更稳定、更平静。
- `3.0.0`：打通 agent integration 和反馈循环，包括 hook 与更直接的 context 交换。

这些是产品阶段版本，不代表两个阶段之间的每个小改动都会严格遵循 SemVer 的 breaking change 定义。

如果在 Codex Desktop 中没有系统 Node，可以使用：

```bash
PATH=/path/to/node/bin:$PWD/node_modules/.bin:$PATH pnpm run build
```

### 仓库结构

```text
src/                 应用、领域模型、bundle 生成和样式
docs/                产品思考、路线图、可行性和交接记录
README.md            项目入口
CONTRIBUTING.md      分支、PR 和本地验证说明
package.json         脚本和运行时依赖
```

完整文档地图见 [`docs/README.md`](docs/README.md)。建议先读 [`docs/PRODUCT_MANIFESTO.md`](docs/PRODUCT_MANIFESTO.md)、[`docs/PRODUCT_BRIEF_ZH.md`](docs/PRODUCT_BRIEF_ZH.md)、[`docs/ROADMAP.md`](docs/ROADMAP.md) 和 [`docs/DEV_LOG.md`](docs/DEV_LOG.md)。

### 分支和协作

- `main`：当前 `1.0.0` 个人可用版本基线。
- `experiment/codex-complex-chat`：已完成的 Codex / Complex Chat 集成实验分支，成果已收束回 `main`。
- `codex/codex-import-support`：保留为 PR #1 初始贡献记录的原始分支。
- 新功能：使用独立 feature branch 并提交 PR。

新的工作建议使用独立 feature branch 并提交 PR。实验性 integration 应先在独立分支中验证，再考虑进入 `main`。详见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

### 范围和状态

这个仓库目前刻意保持 local-first 和个人可用阶段：没有 hosted deployment、账户系统、云同步或原生插件包。当前提供 npm CLI 作为本地 web app 的分发方式，但不保证已经运行中的 agent 对话会因为标记 Ignore 而改变。下一次 agent 运行应把导出的 bundle 作为明确的 source of truth。

路线图分成三层：

1. 让画布个人可用，并且操作足够平静、顺手。
2. 让项目更容易被其他人理解和贡献。
3. 在真实使用暴露出明确需求后，再探索 agent integration 和辅助式 intent 操作。

### 隐私和数据模型

导入文件只在浏览器中读取，不会被编辑、删除或写回。出于浏览器隐私限制，应用无法获得完整本地文件系统路径；如果浏览器提供了相对路径，应用会保留它，否则使用文件名。除非用户主动导出，否则 workspace 状态保存在本地存储中。

当前图片会以 Data URL 保存到本地 workspace。它让 PoC 自包含，但大量大图可能超过浏览器存储上限。未来桌面版或正式 app 可以把图片字节迁移到 IndexedDB 或 workspace 资源目录。

## License

The project is not being published under an open-source license yet. Licensing can be added when the repository is ready for public distribution.
