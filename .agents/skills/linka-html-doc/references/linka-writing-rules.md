---
title: "LinkA Writing Rules"
type: "reference"
status: "final"
owner: "linka-html-doc"
---

# LinkA Writing Rules

## 内容写作规则

- 默认中文。
- 句子要短。
- 每节先给结论，再给解释。
- 对象定义要稳定，不要混入实现字段。
- 如果是概念梳理，优先使用“是什么 / 不是什么 / 和谁的关系”。
- 如果是调研，优先写“结论 / 证据 / 对 LinkA 的启发 / 不应照搬”。

## LinkA 项目特殊约束

写关于 LinkA 的概念文档时，遵守这些当前共识：

- 项目名写作 `LinkA`。
- `Room` 是 IM 群聊聚合根，类似 QQ 群，不是任务容器。
- `Doc` 是独立协作文档组件，类似飞书云文档 / Overleaf，不是 Room 的内置 Board。
- `Room` 和 `Doc` 可以互相引用、置顶、通知，但不是父子绑定。
- 不要使用 `RoomBoard` 作为核心术语，除非是在讨论历史概念或被废弃命名。
- 不要提前预设 Doc 的 section；协作结构应自然生长。
- Agent 可以直接编辑 Doc，但必须有版本、署名、评论、批注和通知基础设施。
- 人类可读性可以由 Web UI 提供，底层内容不必被固定为 Markdown。
