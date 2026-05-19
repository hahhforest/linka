---
title: "Templates"
type: "reference"
status: "final"
owner: "team-work"
---

# Templates

## board.md

```markdown
---
type: "board"
status: "in_progress"
owner: "Owner"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
next: "<下一角色或 none>"
---

# <任务名>

## Objective
<最终目标和交付物>

## Scope
<包含什么；不包含什么>

## Tasks
| id | owner | status | deliverable | verdict | decision |
|---|---|---|---|---|---|
| T1 | <owner> | ready | tasks/T1/deliverable.md | tasks/T1/verdict.md | tasks/T1/decision.md |

## Decisions
- <日期/时间> <决定> <原因>

## Evidence
- <命令、来源、文件路径、数据点>

## Blockers
- <阻塞项、需要谁处理、下一步>
```

## prompt.md

```markdown
---
type: "prompt"
task_id: "<id>"
status: "ready"
owner: "Owner"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
next: "Producer"
---

# Task <id>: <title>

目标：<要完成什么>
背景：<必要上下文，不依赖口头记忆>
范围：<允许修改/调查的文件、系统、主题；明确不做什么>
输入：<文件、链接、数据源、命令、用户要求>
产出：<具体文件、报告、补丁、表格、消息草稿等>
约束：<风格、兼容性、权限、安全、时间、不要触碰的区域>
验收：<可执行检查、事实标准、测试命令、人工判断标准>
汇报：写入 tasks/<id>/deliverable.md，必须列出改动、证据、风险、未完成项。
```

## verify-prompt.md

```markdown
---
type: "prompt"
task_id: "<id>"
status: "ready"
owner: "Owner"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
next: "Verifier"
---

# Verify <id>: <title>

验证目标：<要判断哪个交付物是否合格>
原始来源：<代码、测试、文档、网页、数据表、系统记录>
必须检查：<行为、边界、事实、数字、引用、兼容性、安全等>
建议命令：<build/test/lint/query/export 等>
失败条件：<哪些问题必须判 FAIL>
输出：写入 tasks/<id>/verdict.md，格式为 PASS / FAIL / PASS_WITH_RISK + 证据 + 需要 Owner 决策的问题。
```

## deliverable.md

```markdown
---
type: "deliverable"
task_id: "<task-id>"
status: "ready_for_verify"
owner: "Producer"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
next: "Owner"
---

# DONE <task-id>: <一句话结论>

## Changed / Produced
- <文件或产物路径>

## Evidence
- <测试命令、来源、数据点、截图、日志摘要>

## Notes
- <关键实现/研究判断>

## Risks / Open Questions
- <残余风险或需要 Owner 决策的问题>
```

## verdict.md

```markdown
---
type: "verdict"
task_id: "<task-id>"
status: "ready_for_decision"
owner: "Verifier"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
next: "Owner"
---

# VERDICT <task-id>: PASS | FAIL | PASS_WITH_RISK

## Checked
- <独立检查了什么>

## Evidence
- <命令、来源、复现步骤、文件路径>

## Issues
- <问题；若无写 None>

## Owner Decision Needed
- <需要 Owner 判断的取舍；若无写 None>
```

## decision.md

```markdown
---
type: "decision"
task_id: "<task-id>"
status: "accepted | changes_requested | cancelled | superseded"
owner: "Owner"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
next: "Producer | Integrator | none"
---

# DECISION <task-id>: accept | retry | override_accept | new_task

Reason: <为什么>
Next: <下一步具体动作>
```

## final.md

```markdown
---
type: "final"
status: "draft"
owner: "Owner"
updated_at: "YYYY-MM-DDTHH:MM:SSZ"
next: "none"
---

# <最终交付标题>

## Result
<完成了什么>

## Artifacts
- <产物路径>

## Verification
- <验证命令或证据>

## Risks
- <残余风险；若无写 None>
```
