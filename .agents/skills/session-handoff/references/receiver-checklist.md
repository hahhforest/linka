---
title: "Session Handoff Receiver Checklist"
type: "reference"
status: "final"
owner: "session-handoff"
---

# Session Handoff Receiver Checklist

## 接收原则

新会话不要盲信 handoff。先核对当前工作区，再决定接受、阻塞或拒绝。

## 必查命令

```bash
pwd
git status --short
git branch --show-current
git rev-parse HEAD
git diff --name-status
```

如果 handoff 里有 `base_sha`，还建议检查：

```bash
git merge-base --is-ancestor <base_sha> HEAD && echo ok || echo stale
git diff --name-status <base_sha>..HEAD
```

## 接收条件

可以接受，当：

- `repo` 与当前 `pwd` 一致。
- `head_sha` 与当前 `HEAD` 一致，或 handoff 明确说明为什么不一致。
- `Changed Files` 与 `git status` / `git diff` 基本对得上。
- `Next Steps` 可执行。
- `Do Not Touch` 清楚。

应阻塞，当：

- 当前 HEAD 与 `handoff.md` 不一致且原因不明。
- handoff 说工作区 clean，但 `git status` 有改动。
- handoff 未列出改动文件，但工作区存在相关 diff。
- `Do Not Touch` 与当前任务冲突。
- 新用户消息改变了任务方向。

应拒绝，当：

- handoff 缺少目标、进度、下一步或 Git 状态。
- 文件路径明显不是当前项目。
- handoff 要求覆盖或回退未知用户改动。

## 接收后动作

1. 写 `ack.md`，状态为 `accepted`、`blocked` 或 `rejected`。
2. 若 accepted，从 `Next Steps` 第一项开始。
3. 若 blocked，先向用户说明缺口，不要擅自猜。
4. 若 rejected，要求旧会话或用户补充新的 handoff。
