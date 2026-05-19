---
title: "Status Model"
type: "reference"
status: "final"
owner: "team-work"
---

# Status Model

## Markdown Frontmatter

文件化协作空间里的每个 `.md` 文件都必须以 YAML frontmatter 开头。frontmatter 用于机器和人快速判断文件类型、当前状态、负责人和下一步；正文用于解释细节。

通用字段：

```yaml
---
type: "prompt | deliverable | verdict | decision | board | final | evidence"
task_id: "T1"          # board/final 可省略
status: "draft"
owner: "<当前负责角色或会话>"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
next: "<下一角色；没有则写 none>"
---
```

建议字段：

- `source`: 原始来源或输入路径。
- `depends_on`: 依赖任务 id 列表。
- `supersedes`: 被当前文件替代的旧文件路径。
- `related`: 相关证据、日志或产物路径。

## Status 集合

只使用下面集合，不新增近义状态。

| status | 含义 | 下一步 |
|---|---|---|
| `draft` | 文件正在准备，不能作为事实来源 | 当前 owner 继续完善 |
| `ready` | 文件已准备好，可被目标角色消费 | `next` 指定的角色开始工作 |
| `in_progress` | 当前 owner 正在处理 | 等当前 owner 写入结果 |
| `blocked` | 卡住，缺信息、权限、决定或外部动作 | Owner 处理阻塞 |
| `ready_for_verify` | Producer 交付完成，可以独立验证 | Owner 派发 Verifier |
| `verifying` | Verifier 正在独立检查 | 等 `verdict.md` |
| `ready_for_decision` | Verifier 已给结论，等待 Owner 决策 | Owner 写 `decision.md` |
| `changes_requested` | 需要返工或补证据 | Producer 按 `decision.md` 重试 |
| `accepted` | Owner 接受该任务或文件 | 进入依赖它的下一步 |
| `superseded` | 已被新文件或新决策替代 | 不再作为当前事实来源 |
| `cancelled` | 明确停止，不再处理 | 不再调度 |
| `final` | 最终产物已形成 | 可用于最终汇报 |

不要使用百分比。协作中真正重要的不是“完成了 70%”，而是“谁现在可以安全地做下一步”。

## 常见状态流

- `prompt.md`: `draft -> ready -> in_progress`
- `deliverable.md`: `draft -> ready_for_verify -> accepted | changes_requested | superseded`
- `verdict.md`: `draft -> verifying -> ready_for_decision`
- `decision.md`: `draft -> accepted | changes_requested | cancelled | superseded`
- `board.md`: `draft -> in_progress -> blocked | final`
- `final.md`: `draft -> final`

## 查询示例

查看等待验证的任务：

```bash
rg -n '^status: "?ready_for_verify"?' .agents/team-work/<topic>
```

查看等待 Owner 决策的任务：

```bash
rg -n '^status: "?ready_for_decision"?' .agents/team-work/<topic>
```

查看阻塞：

```bash
rg -n '^status: "?blocked"?' .agents/team-work/<topic>
```
