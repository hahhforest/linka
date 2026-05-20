---
title: "Session Handoff Protocol"
type: "reference"
status: "final"
owner: "session-handoff"
---

# Session Handoff Protocol

## 交接目标

Handoff 的目标是让一个新 TUI code agent 能在没有旧聊天上下文的情况下继续工作。它不是聊天记录摘要，也不是详细日志；它是继续执行所需的最小充分上下文。

## 运行时目录

默认目录：

```text
.agents/session-handoff/<topic>/
├── handoff.md
├── ack.md
└── evidence/
```

`.agents/session-handoff/` 应被 `.gitignore` 忽略，因为它包含运行时状态、临时证据和交接草稿。

## handoff.md frontmatter

`handoff.md` 必须以 YAML frontmatter 开头：

```yaml
---
type: "session_handoff"
status: "draft | ready | superseded | cancelled"
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
repo: "/abs/path/to/repo"
branch: "<current-branch>"
base_sha: "<start-or-last-known-good-sha>"
head_sha: "<current-head-sha>"
worktree_status: "clean | dirty"
owner: "<old-session>"
next: "<new-session | human | unknown>"
---
```

字段含义：

- `status`: `ready` 才能交给新会话；`draft` 只能继续补全。
- `repo`: 绝对路径，接收方必须确认当前目录一致。
- `base_sha`: 本轮任务或当前分支的起点，用于判断上下文是否过旧。
- `head_sha`: 旧会话写 handoff 时的 HEAD。
- `worktree_status`: `dirty` 表示还有未提交改动，必须列在正文的 Changed Files。

## 写入规则

旧会话必须写清：

- 用户真正目标和约束。
- 当前进度：完成、进行中、未开始分别是什么。
- 修改过哪些文件，每个文件为什么改。
- 做过哪些关键决策和取舍。
- 运行过哪些命令，结果如何。
- 还有哪些阻塞、风险、未确认问题。
- 下一步按什么顺序做，完成标准是什么。
- 哪些文件、目录、用户改动或敏感路径不能碰。
- 大证据材料的路径和摘要。

不要写：

- 长聊天记录。
- 未验证的猜测当作事实。
- 大段 diff、日志、测试输出。
- “继续做就行”这种不可执行的下一步。

## 大内容规则

大日志、大 diff、截图、导出数据和复杂分析放到 `evidence/`，`handoff.md` 只写路径和摘要。例如：

```markdown
## Evidence Pointers
- `evidence/test-failure.log`: `npm test` 失败输出，关键错误是 X。
- `evidence/api-response.json`: 调试接口返回样例，包含字段 A/B/C。
```

## 结束前最低检查

旧会话把 handoff 标记为 `ready` 前，至少运行：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git diff --name-status
```

如果仓库不是 Git 仓库，也要在 handoff 中明确说明，并用可替代方式列出改动文件。
