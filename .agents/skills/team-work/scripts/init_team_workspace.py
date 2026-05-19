#!/usr/bin/env python3
"""Initialize a file-based team-work workspace."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_task(raw: str) -> tuple[str, str]:
    if ":" in raw:
        task_id, title = raw.split(":", 1)
    else:
        task_id, title = raw, raw
    task_id = task_id.strip()
    title = title.strip()
    if not task_id:
        raise ValueError(f"Invalid task spec: {raw!r}")
    return task_id, title or task_id


def frontmatter(file_type: str, status: str, owner: str, next_owner: str, task_id: str | None = None) -> str:
    lines = ["---", f'type: "{file_type}"']
    if task_id:
        lines.append(f'task_id: "{task_id}"')
    lines.extend([
        f'status: "{status}"',
        f'owner: "{owner}"',
        f'updated_at: "{now()}"',
        f'next: "{next_owner}"',
        "---",
        "",
    ])
    return "\n".join(lines)


def write(path: Path, content: str, overwrite: bool) -> None:
    if path.exists() and not overwrite:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a team-work coordination workspace")
    parser.add_argument("--root", default=".agents/team-work", help="Root directory for workspaces")
    parser.add_argument("--topic", required=True, help="Workspace slug, e.g. checkout-refactor")
    parser.add_argument("--name", required=True, help="Human-readable task name")
    parser.add_argument("--task", action="append", default=[], help="Task spec as ID:Title; repeatable")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing template files")
    args = parser.parse_args()

    tasks = [parse_task(t) for t in args.task] or [("T1", "Define task")]
    workspace = Path(args.root) / args.topic
    (workspace / "evidence").mkdir(parents=True, exist_ok=True)

    plan_tasks = []
    board_rows = []
    for task_id, title in tasks:
        task_dir = workspace / "tasks" / task_id
        prompt = frontmatter("prompt", "ready", "Owner", "Producer", task_id) + f"# Task {task_id}: {title}\n\n目标：<要完成什么>\n背景：<必要上下文>\n范围：<允许和禁止范围>\n输入：<文件、链接、数据源、命令>\n产出：<具体交付物>\n约束：<风格、兼容性、安全、时间>\n验收：<验证标准>\n汇报：写入 tasks/{task_id}/deliverable.md。\n"
        verify_prompt = frontmatter("prompt", "ready", "Owner", "Verifier", task_id) + f"# Verify {task_id}: {title}\n\n验证目标：<判断交付物是否合格>\n原始来源：<代码、资料、数据、命令>\n必须检查：<行为、事实、边界、兼容性、安全等>\n失败条件：<哪些问题必须判 FAIL>\n输出：写入 tasks/{task_id}/verdict.md。\n"
        deliverable = frontmatter("deliverable", "draft", "Producer", "Producer", task_id) + f"# DONE {task_id}: <一句话结论>\n\n## Changed / Produced\n- <文件或产物路径>\n\n## Evidence\n- <证据>\n\n## Risks / Open Questions\n- <风险；若无写 None>\n"
        verdict = frontmatter("verdict", "draft", "Verifier", "Verifier", task_id) + f"# VERDICT {task_id}: PASS | FAIL | PASS_WITH_RISK\n\n## Checked\n- <独立检查了什么>\n\n## Evidence\n- <证据>\n\n## Issues\n- <问题；若无写 None>\n"
        decision = frontmatter("decision", "draft", "Owner", "Owner", task_id) + f"# DECISION {task_id}: accept | retry | override_accept | new_task\n\nReason: <为什么>\nNext: <下一步具体动作>\n"
        write(task_dir / "prompt.md", prompt, args.overwrite)
        write(task_dir / "verify-prompt.md", verify_prompt, args.overwrite)
        write(task_dir / "deliverable.md", deliverable, args.overwrite)
        write(task_dir / "verdict.md", verdict, args.overwrite)
        write(task_dir / "decision.md", decision, args.overwrite)

        plan_tasks.append(f'''  - id: "{task_id}"
    title: "{title}"
    role: "producer"
    status: "ready"
    depends_on: []
    owner: "Producer"
    scope:
      include: []
      exclude: []
    prompt_file: "tasks/{task_id}/prompt.md"
    deliverable_file: "tasks/{task_id}/deliverable.md"
    verify:
      verifier: "Verifier"
      prompt_file: "tasks/{task_id}/verify-prompt.md"
      verdict_file: "tasks/{task_id}/verdict.md"
      required_checks: []''')
        board_rows.append(f"| {task_id} | Producer | ready | tasks/{task_id}/deliverable.md | tasks/{task_id}/verdict.md | tasks/{task_id}/decision.md |")

    plan = f'''version: 1
name: "{args.name}"
objective: "<最终目标和交付物>"
workspace: "{workspace.as_posix()}"
mode: "single-tui"
status: "in_progress"
owner: "Owner"
constraints: []
gates: []
tasks:
{chr(10).join(plan_tasks)}
'''
    board = frontmatter("board", "in_progress", "Owner", "Producer") + f'''# {args.name}

## Objective
<最终目标和交付物>

## Scope
<包含什么；不包含什么>

## Tasks
| id | owner | status | deliverable | verdict | decision |
|---|---|---|---|---|---|
{chr(10).join(board_rows)}

## Decisions
- <日期/时间> <决定> <原因>

## Evidence
- <命令、来源、文件路径、数据点>

## Blockers
- <阻塞项、需要谁处理、下一步>
'''
    final = frontmatter("final", "draft", "Owner", "Owner") + f'''# {args.name}

## Result
<完成了什么>

## Artifacts
- <产物路径>

## Verification
- <验证命令或证据>

## Risks
- <残余风险；若无写 None>
'''

    write(workspace / "plan.yaml", plan, args.overwrite)
    write(workspace / "board.md", board, args.overwrite)
    write(workspace / "final.md", final, args.overwrite)
    print(workspace)


if __name__ == "__main__":
    main()
