#!/usr/bin/env python3
"""Check a session handoff file against the current workspace."""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path


REQUIRED_KEYS = {
    "type",
    "status",
    "created_at",
    "updated_at",
    "repo",
    "branch",
    "base_sha",
    "head_sha",
    "worktree_status",
    "owner",
    "next",
}


def run_git(args: list[str], cwd: Path) -> str:
    try:
        return subprocess.check_output(["git", *args], cwd=cwd, text=True, stderr=subprocess.DEVNULL).strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def parse_frontmatter(text: str) -> tuple[dict[str, str], list[str]]:
    errors: list[str] = []
    if not text.startswith("---\n"):
        return {}, ["missing opening YAML frontmatter delimiter"]
    end = text.find("\n---", 4)
    if end == -1:
        return {}, ["missing closing YAML frontmatter delimiter"]
    raw = text[4:end].strip().splitlines()
    data: dict[str, str] = {}
    for line in raw:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            errors.append(f"invalid frontmatter line: {line}")
            continue
        key, value = line.split(":", 1)
        value = value.strip().strip('"').strip("'")
        data[key.strip()] = value
    missing = sorted(REQUIRED_KEYS - set(data))
    for key in missing:
        errors.append(f"missing frontmatter key: {key}")
    return data, errors


def section_present(text: str, title: str) -> bool:
    return re.search(rf"^##\s+\d*\.?\s*{re.escape(title)}\b", text, flags=re.M) is not None


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a session handoff")
    parser.add_argument("handoff", help="Path to handoff.md")
    args = parser.parse_args()

    path = Path(args.handoff).resolve()
    text = path.read_text(encoding="utf-8")
    data, errors = parse_frontmatter(text)
    warnings: list[str] = []

    if data.get("type") != "session_handoff":
        errors.append('frontmatter type must be "session_handoff"')
    if data.get("status") != "ready":
        warnings.append('handoff status is not "ready"')

    for title in [
        "User Goal",
        "Current State",
        "Changed Files",
        "Key Decisions",
        "Commands And Verification",
        "Open Problems",
        "Next Steps",
        "Do Not Touch",
        "Evidence Pointers",
    ]:
        if not section_present(text, title):
            errors.append(f"missing section: {title}")

    repo_value = data.get("repo", "")
    repo = Path(repo_value).resolve() if repo_value else path.parent
    cwd = Path.cwd().resolve()
    if repo_value and repo != cwd:
        warnings.append(f"handoff repo differs from current cwd: {repo} != {cwd}")

    branch = run_git(["branch", "--show-current"], cwd)
    head = run_git(["rev-parse", "HEAD"], cwd)
    status = run_git(["status", "--short"], cwd)
    worktree_status = "dirty" if status else "clean"

    if data.get("branch") not in ("", "unknown", branch):
        warnings.append(f"branch mismatch: handoff={data.get('branch')} current={branch}")
    if data.get("head_sha") not in ("", "unknown", head):
        warnings.append(f"HEAD mismatch: handoff={data.get('head_sha')} current={head}")
    if data.get("worktree_status") not in ("", "unknown", worktree_status):
        warnings.append(f"worktree status mismatch: handoff={data.get('worktree_status')} current={worktree_status}")

    if errors:
        print("FAIL")
        for err in errors:
            print(f"ERROR: {err}")
    elif warnings:
        print("WARN")
    else:
        print("OK")

    for warn in warnings:
        print(f"WARN: {warn}")
    print(f"current_branch: {branch}")
    print(f"current_head: {head}")
    print(f"current_worktree_status: {worktree_status}")

    raise SystemExit(1 if errors else 0)


if __name__ == "__main__":
    main()
