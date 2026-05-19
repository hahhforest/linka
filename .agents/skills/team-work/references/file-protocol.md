---
title: "File Protocol"
type: "reference"
status: "final"
owner: "team-work"
---

# File Protocol

## 协作空间

推荐目录：

```text
.agents/team-work/<topic>/
├── plan.yaml
├── board.md
├── final.md
├── evidence/
└── tasks/
    └── <task-id>/
        ├── prompt.md
        ├── verify-prompt.md
        ├── deliverable.md
        ├── verdict.md
        └── decision.md
```

## 文件职责

- `plan.yaml`: Owner 写的任务合同，说明目标、任务、依赖、角色、产出和验证标准。
- `board.md`: 当前状态索引，记录任务进度、阻塞、关键决策和证据位置。
- `tasks/<id>/prompt.md`: 给 Producer 的自包含任务说明。
- `tasks/<id>/verify-prompt.md`: 给 Verifier 的自包含验证说明。
- `tasks/<id>/deliverable.md`: Producer 的交付消息和证据摘要。
- `tasks/<id>/verdict.md`: Verifier 的独立检查结论。
- `tasks/<id>/decision.md`: Owner 对该任务的接受、重试、覆盖接受或后续任务决定。
- `evidence/`: 长日志、截图、导出数据、命令输出摘要等证据材料。
- `final.md`: 最终综合结果，可作为用户汇报或报告草稿的来源。

## 写入所有权

- Owner 维护 `plan.yaml`、`board.md`、`decision.md` 和 `final.md`。
- Producer 只写自己任务目录下的 `deliverable.md`，必要时补充 `evidence/`。
- Verifier 只写自己任务目录下的 `verdict.md`，不修改 Producer 产物。
- 多会话并行时，不要多个会话同时编辑同一个文件；通过新文件或追加段落交接。
- 文件是事实来源，聊天消息只是通知；恢复上下文时先读 `plan.yaml` 和 `board.md`。

## 无后台调度器时的触发规则

Owner 承担轻量调度职责。Verifier 不需要轮询文件，也不应该猜测 Producer 是否完成。

1. Producer 完成后写 `tasks/<id>/deliverable.md`，把该文件 frontmatter 的 `status` 改为 `ready_for_verify`，并同步更新 `board.md` 和 `plan.yaml` 中的任务状态。
2. Producer 如果是外部会话或真人，向 Owner 发短通知：`DONE <task-id>, deliverable is ready`。通知只是提醒，事实仍以文件为准。
3. Owner 看到 `ready_for_verify` 后，检查 `deliverable.md` 是否完整，再把 `deliverable.md`、`board.md` 和 `plan.yaml` 中的任务状态改为 `verifying`，并把 `verify-prompt.md` 交给 Verifier。
4. Verifier 完成后写 `verdict.md`，把该文件 frontmatter 的 `status` 改为 `ready_for_decision`。
5. Owner 读取 `verdict.md`，写 `decision.md`，决定 `accepted`、`changes_requested`、`superseded` 或 `cancelled`。

## plan.yaml Schema

`plan.yaml` 是通用协作计划，不是某个特定工具的运行文件。

```yaml
version: 1
name: "<任务名>"
objective: "<最终目标和交付物>"
workspace: ".agents/team-work/<topic>"
mode: "single-tui | multi-session | delegated"
status: "in_progress"
owner: "<主会话/负责人>"
constraints:
  - "<不要触碰的文件、兼容性、安全、风格或时间约束>"
gates:
  - id: "final-verification"
    command: "<可选：最终测试/校验命令>"
    required: true
tasks:
  - id: "T1"
    title: "<短标题>"
    role: "producer"
    status: "ready"
    depends_on: []
    owner: "<主会话/子代理/真人>"
    scope:
      include:
        - "<允许处理的路径、系统或主题>"
      exclude:
        - "<明确不处理的范围>"
    prompt_file: "tasks/T1/prompt.md"
    deliverable_file: "tasks/T1/deliverable.md"
    verify:
      verifier: "<Verifier 角色或会话>"
      prompt_file: "tasks/T1/verify-prompt.md"
      verdict_file: "tasks/T1/verdict.md"
      required_checks:
        - "<独立检查项>"
    timeout_hint: "<可选：建议时间盒>"
```
