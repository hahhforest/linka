---
name: team-work
description: "单个 TUI 或多 TUI 会话中的轻量团队协作规范。用于 Codex、Claude Code 等没有专用团队编排引擎、但任务需要角色分工、计划 YAML、Markdown frontmatter 状态、文件化消息中转、独立验证和多阶段交付的场景。"
---

# Team Work

## 核心定位

这个 skill 提供一种文件驱动的轻量协作范式：主会话始终是 Owner，负责目标理解、任务拆分、调度、验收和最终汇报；Producer、Verifier、Integrator 等角色可以由同一个 TUI 顺序扮演，也可以由多个 TUI、子代理或真人分别承担。

核心思想：计划是文件化任务合同，消息通过文件中转。没有后台调度器时，Owner 用文件状态触发下一步，而不是让协作者轮询或靠聊天上下文猜测。

## 何时使用

使用本规范，当任务至少满足一项：

* 跨多个模块、资料源、系统或阶段，直接单步执行风险较高。

* 涉及权限、安全、迁移、数据、外部接口、客户沟通或公开材料。

* 需要 Producer 和 Verifier 分离，或需要可恢复、可审计的协作记录。

* 需要多个 TUI 会话、子代理或真人通过文件交接上下文。

* 需要把研究、实现、验证、集成、汇报串成闭环。

跳过本规范，当任务低风险且可以直接完成：简单问答、单文件小改、格式调整、一次性命令输出、明确的小 bug 修复。

## 快速流程

1. Owner 做轻量预检：目标、交付物、风险、任务边界、验证方式。

2. 建立协作空间：`.agents/team-work/<topic>/`。可运行 `scripts/init_team_workspace.py` 初始化。

3. 写 `plan.yaml` 和 `board.md`，并为每个任务写 `tasks/<id>/prompt.md` 和 `verify-prompt.md`。

4. Producer 根据 `prompt.md` 工作，完成后写 `deliverable.md`，把 frontmatter `status` 改为 `ready_for_verify`。

5. Owner 看到 `ready_for_verify` 后检查交付物，改为 `verifying`，再派发 Verifier。

6. Verifier 独立检查原始来源，写 `verdict.md`，把 `status` 改为 `ready_for_decision`。

7. Owner 写 `decision.md`，决定 `accepted`、`changes_requested`、`superseded` 或 `cancelled`，并更新 `board.md` / `plan.yaml`。

8. Integrator 汇总多任务结果，Owner 写 `final.md` 和最终用户汇报。

## 角色

| 角色                   | 责任                         | 主要文件                                            |
| -------------------- | -------------------------- | ----------------------------------------------- |
| Owner / Orchestrator | 明确目标、拆分任务、调度下一步、验收、汇报      | `plan.yaml`、`board.md`、`decision.md`、`final.md` |
| Producer             | 完成实现、研究、文档、数据整理等具体交付       | `prompt.md`、`deliverable.md`、`evidence/`        |
| Verifier             | 回到原始来源独立验证，不复述 Producer 总结 | `verify-prompt.md`、`verdict.md`                 |
| Integrator           | 合并多个产物，处理冲突，跑整体检查          | `final.md`、集成验证记录                               |
| Recorder             | 维护状态、证据、关键决策索引             | `board.md`、`evidence/`                          |

## 文件结构

推荐结构：

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

所有协作空间里的 `.md` 文件都必须带 YAML frontmatter，至少包含：`type`、`status`、`owner`、`updated_at`、`next`；任务文件还要包含 `task_id`。`status` 是轻量调度信号，不使用百分比。

## 需要读取的参考

* 状态集合、frontmatter 字段、状态流转：读 `references/status-model.md`。

* 文件职责、无引擎调度、写入所有权、`plan.yaml` schema：读 `references/file-protocol.md`。

* 需要创建实际协作文件时：读 `references/templates.md`，或运行 `scripts/init_team_workspace.py`。

* 需要拆分工程/研究任务、写验证策略或避免反模式时：读 `references/patterns.md`。

## 使用脚本

初始化一个协作空间：

```bash
python3 .agents/skills/team-work/scripts/init_team_workspace.py \
  --root .agents/team-work \
  --topic <topic-slug> \
  --name "<任务名>" \
  --task T1:"<任务标题>" \
  --task T2:"<任务标题>"
```

脚本只生成目录和模板文件，不会执行业务逻辑。生成后 Owner 仍需补全 `plan.yaml`、`prompt.md`、`verify-prompt.md` 的具体内容。

## 验证原则

触发以下任一条件时必须安排独立验证：代码改变行为、权限、数据流、安全边界、迁移或外部接口；交付物包含外部事实、数字、日期、引用、计算或业务建议；材料将外发；多来源可能冲突；工具操作产生外部副作用。

Verifier 必须回到原始代码、资料、数据或命令重新检查。不要只读 Producer 的 `deliverable.md` 就通过。

## 最终汇报

向用户汇报时只讲：完成了什么、产物在哪里、改了哪些文件、运行了哪些验证、还有哪些风险或未完成项。若跳过验证，说明原因。

⠀