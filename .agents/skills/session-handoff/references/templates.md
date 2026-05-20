---
title: "Session Handoff Templates"
type: "reference"
status: "final"
owner: "session-handoff"
---

# Session Handoff Templates

## handoff.md

```markdown
---
type: "session_handoff"
status: "ready"
created_at: "YYYY-MM-DDTHH:MM:SSZ"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
repo: "/abs/path/to/repo"
branch: "<current-branch>"
base_sha: "<base-sha-or-unknown>"
head_sha: "<head-sha-or-unknown>"
worktree_status: "clean | dirty"
owner: "<old-session>"
next: "<new-session | human | unknown>"
---

# Session Handoff: <topic>

## 1. User Goal
<用户真正要完成什么。包括语言、提交、禁止事项、偏好和最新指令。>

## 2. Current State
<已经完成什么；正在做什么；还没做什么。明确哪些是事实，哪些只是推断。>

## 3. Changed Files
- `<path>`: <改了什么，为什么，是否已验证>
- `<path>`: <改了什么，为什么，是否已验证>

## 4. Key Decisions
- <决定>: <原因>
- <取舍>: <为什么没有选另一个方案>

## 5. Commands And Verification
- `<command>`: <结果>
- `<command>`: <失败原因或未运行原因>

## 6. Open Problems
- <阻塞/风险/不确定事实>
- <需要用户确认的问题>

## 7. Next Steps
1. <新会话第一步应该做什么>
2. <第二步>
3. <完成标准>

## 8. Do Not Touch
- <不要改的文件/目录/用户改动/敏感路径>
- <不要回退的内容>

## 9. Evidence Pointers
- `<path>`: <里面是什么，为什么重要>
```

## ack.md

```markdown
---
type: "handoff_ack"
status: "accepted | blocked | rejected"
created_at: "YYYY-MM-DDTHH:MM:SSZ"
repo: "/abs/path/to/repo"
branch: "<current-branch>"
head_sha: "<current-head-sha-or-unknown>"
owner: "<new-session>"
---

# Handoff ACK

已读取 handoff。

## Local Check
- Current repo: <path>
- Current branch: <branch>
- Current HEAD: <sha>
- Worktree status: <clean/dirty>

## Consistency
- `repo` matches current path: yes/no
- `head_sha` matches current HEAD: yes/no
- Changed files match worktree: yes/no
- Open problems understood: yes/no
- Do Not Touch understood: yes/no

## I Will Continue From
<下一步动作>

## Inconsistencies
- None | <列出不一致和处理建议>
```

## 简短用户汇报模板

当旧会话需要请用户手动开新会话时，回复：

```markdown
已写好 handoff：`<abs-path>/handoff.md`。
新会话启动后，请先读取该文件，并运行接收检查。当前下一步是：<next step>。
```
