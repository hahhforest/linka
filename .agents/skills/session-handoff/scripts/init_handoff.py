#!/usr/bin/env python3
"""Create a session handoff workspace for TUI code agents."""

from __future__ import annotations

import argparse
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def run_git(args: list[str], cwd: Path) -> str:
    try:
        return subprocess.check_output(["git", *args], cwd=cwd, text=True, stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def git_status(cwd: Path) -> str:
    out = run_git(["status", "--short"], cwd)
    return out if out != "unknown" else ""


def worktree_status(cwd: Path) -> str:
    status = git_status(cwd)
    if status == "unknown":
        return "unknown"
    return "dirty" if status else "clean"


def frontmatter(repo: Path, branch: str, base_sha: str, head_sha: str, status: str, owner: str, next_owner: str) -> str:
    ts = now()
    return f'''---
type: "session_handoff"
status: "{status}"
created_at: "{ts}"
updated_at: "{ts}"
repo: "{repo}"
branch: "{branch}"
base_sha: "{base_sha}"
head_sha: "{head_sha}"
worktree_status: "{worktree_status(repo)}"
owner: "{owner}"
next: "{next_owner}"
---
'''


def main() -> None:
    parser = argparse.ArgumentParser(description="Create a session handoff draft")
    parser.add_argument("--topic", required=True, help="Handoff topic slug")
    parser.add_argument("--goal", required=True, help="User goal summary")
    parser.add_argument("--root", default=".agents/session-handoff", help="Runtime handoff root")
    parser.add_argument("--repo", default=".", help="Repository path")
    parser.add_argument("--owner", default="old-session", help="Current session label")
    parser.add_argument("--next", default="new-session", help="Next owner label")
    parser.add_argument("--base-sha", default="", help="Start or last-known-good SHA")
    parser.add_argument("--ready", action="store_true", help="Mark handoff as ready instead of draft")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing files")
    args = parser.parse_args()

    repo = Path(args.repo).resolve()
    workspace = Path(args.root) / args.topic
    handoff_path = workspace / "handoff.md"
    ack_path = workspace / "ack.md"
    evidence_dir = workspace / "evidence"

    if handoff_path.exists() and not args.overwrite:
        raise SystemExit(f"Refusing to overwrite existing {handoff_path}. Use --overwrite.")

    branch = run_git(["branch", "--show-current"], repo)
    head_sha = run_git(["rev-parse", "HEAD"], repo)
    base_sha = args.base_sha or run_git(["merge-base", "HEAD", "main"], repo)
    status = git_status(repo)
    diff_names = run_git(["diff", "--name-status"], repo)
    staged_names = run_git(["diff", "--cached", "--name-status"], repo)

    workspace.mkdir(parents=True, exist_ok=True)
    evidence_dir.mkdir(parents=True, exist_ok=True)

    changed_section = status if status else "<clean worktree; list intentional changed files if any>"
    diff_section = ""
    if staged_names and staged_names != "unknown":
        diff_section += f"\nStaged changes:\n```text\n{staged_names}\n```\n"
    if diff_names and diff_names != "unknown":
        diff_section += f"\nUnstaged changes:\n```text\n{diff_names}\n```\n"

    handoff = frontmatter(
        repo=repo,
        branch=branch,
        base_sha=base_sha,
        head_sha=head_sha,
        status="ready" if args.ready else "draft",
        owner=args.owner,
        next_owner=args.next,
    ) + f'''
# Session Handoff: {args.topic}

## 1. User Goal
{args.goal}

## 2. Current State
<已经完成什么；正在做什么；还没做什么。明确哪些是事实，哪些只是推断。>

## 3. Changed Files
```text
{changed_section}
```
{diff_section}
For each changed file, explain what changed and why:
- `<path>`: <change summary, reason, verification status>

## 4. Key Decisions
- <决定>: <原因>

## 5. Commands And Verification
- `git status --short`: <recorded above>
- `<command>`: <结果；未运行则说明原因>

## 6. Open Problems
- <阻塞/风险/不确定事实>

## 7. Next Steps
1. <新会话第一步应该做什么>
2. <第二步>
3. <完成标准>

## 8. Do Not Touch
- <不要改的文件/目录/用户改动/敏感路径>

## 9. Evidence Pointers
- `evidence/`: <大日志、截图、导出数据或 diff 摘要放这里>
'''

    ack = f'''---
type: "handoff_ack"
status: "draft"
created_at: "{now()}"
repo: "{repo}"
branch: "<current-branch>"
head_sha: "<current-head-sha-or-unknown>"
owner: "new-session"
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
'''

    handoff_path.write_text(handoff, encoding="utf-8")
    if not ack_path.exists() or args.overwrite:
        ack_path.write_text(ack, encoding="utf-8")
    print(handoff_path)


if __name__ == "__main__":
    main()
