# LinkA Agent Discipline

- Start by reading `inner_docs/nightly-agent-team-operating-model.html` before changing code.
- Work in assigned `.worktree/<lane>` directories; do not edit another lane or the main checkout.
- Mainline only merges green branches after required verification passes.
- Treat `shared` and `config` contracts as frozen unless the assigned task explicitly changes them.
- Stay inside the task boundary. Do not revert, overwrite, or clean up unrelated worker changes.
- Do not store build, worker, or task status in Room data.
- For Phase 00 scaffold changes, run `pnpm install`, `pnpm typecheck`, `pnpm build`, and `pnpm test`.
