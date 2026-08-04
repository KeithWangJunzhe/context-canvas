# Context Canvas 中文产品 Brief

Date: 2026-08-01

## 一句话

Context Canvas 是一个给 AI agent 准备上下文的本地画布工具：用户把文档、聊天记录、截图和笔记拖进来，标注哪些要置顶、哪些要包含、哪些要忽略，再导出成 Codex/其他 agent 能读懂的 context bundle。

## 为什么做

现在大家都在关注 agent 怎么执行任务，但很少有人关注任务开始之前，用户到底怎么把自己的意图讲清楚。

真实情况是：用户的上下文通常很乱。

- 长聊天里有新旧结论混在一起。
- 文档里有重要段落，也有过时内容。
- 截图里有关键 UI 状态，但很难用文字描述。
- 用户知道哪些东西重要、哪些东西误导模型，但传统聊天框很难表达这些取舍。

Context Canvas 想解决的是这个前置问题：不是让 AI 自动猜上下文，而是让用户更容易组织自己的 intent。

## 核心比喻

GoodNotes 是给人看的整理好的笔记。

Context Canvas 是给有视觉和结构化理解能力的 LLM/agent 看的笔记本。

用户看到的是画布、文档、截图、高亮、框选、箭头、备注。

模型看到的是结构化数据：哪些 context 应该读，哪些应该跳过，哪些是 pinned 约束，哪些节点之间有关联，为什么这么标注。

## 目标用户

第一批用户是高频使用 AI agent 的人，尤其是：

- 经常用 Codex/Claude Code/Cursor/OpenClaw 做项目的人
- 需要给 agent 喂大量背景材料的人
- 经常从聊天记录、笔记、截图、需求文档里整理上下文的人
- 愿意手动整理关键上下文，以换取更稳定 agent 输出的人

## 当前 PoC 要证明什么

PoC 不需要先做成完整平台。

它只需要证明一件事：用户手动整理过的 context bundle，比直接复制一大段混乱聊天/文档给 agent 更清楚、更可靠、更省心。

## 一期范围

一期目标是作者自己能真实使用，并且交互手感足够支撑连续整理工作。

计划包含：

- 本地 Web UI
- markdown/txt/docx 导入
- png/jpeg/jpg 图片导入
- 复制粘贴聊天记录
- rule-based chat slicing
- 文档/聊天 reader 预览和 block 联动
- block 级 pin/include/ignore/needs_review
- 文内高亮和忽略标注
- 图片 bounding box 和 text box 标注
- 画布节点、连线、备注
- 基础画布形状：矩形、text box、简单流程箭头
- 输出 preview 可编辑
- 导出 md/json bundle
- 本地保存和 workspace 导入导出
- 删除、选中、快捷键、toast 等基础交互优化

## 后续方向

三期以后可以探索 agent integration，但可以提前做实验。

方向包括：

- Codex/Claude Code/OpenClaw 的聊天记录或任务记录导入 hook
- 模型辅助切分聊天记录
- 自动打标签：requirement、decision、question、assumption、evidence、noise
- 本地文档搜索
- 项目级 context library
- bundle diff
- canvas overview screenshot + 坐标对应的结构化数据
- intent blocks：goal、constraint、acceptance criteria、non-goal、preference、open question

## Pitch 版本

我在做一个叫 Context Canvas 的本地工具，想解决 AI agent 使用里的一个前置问题：不是 agent 不会执行，而是人很难把自己的需求和上下文讲清楚。

现在我们通常只能在聊天框里复制一大段材料，但真实上下文其实很复杂：有文档、有截图、有聊天记录、有过时结论、有必须保留的约束，也有用户自己知道但模型不知道的取舍。

Context Canvas 的想法是做一个给 agent 看的笔记本。用户可以把材料拖到画布上，像整理 GoodNotes 或白板一样标注重点、划掉噪音、框选截图、连接不同材料，然后导出成一个结构化的 context bundle 给 Codex 或其他 agent 使用。

它不是单纯的 prompt editor，也不是 memory/RAG。更准确地说，它是 intent management：帮助人把混乱的想法、证据、限制和目标整理成 AI 能理解、能执行的上下文。

短期目标是做一个我自己能真实使用的本地 PoC。长期看，它可能会变成 agent IDE 或 chat UI 里的一层前置表达界面。
