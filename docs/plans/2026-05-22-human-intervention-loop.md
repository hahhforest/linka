# Human Intervention Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the minimum user intervention loop: pending interactions are Harness-owned, visible in the Room UI, and resolved by a human Room message.

**Architecture:** `PendingInteraction` remains a Harness-layer object. The daemon exposes room-scoped read/create APIs and an interaction response API that appends a human-readable Room message, then updates the pending interaction. UI Activity shows pending interactions as waiting-user items and lets the human answer without writing task/workflow state into Room data.

**Tech Stack:** Hono daemon routes, SQLite pending interaction store, React/Zustand UI store and services, daemon-backed smoke.

---

## Scope

- Add daemon APIs for `PendingInteraction` list/create/respond.
- Add UI service/store loading and response action.
- Add Activity panel pending-interaction cards and response form.
- Extend tests and smoke without direct SQLite seed.

## Non-goals

- No workflow/task model.
- No Room/RoomMember task status fields.
- No automatic model-driven decision policy yet.
