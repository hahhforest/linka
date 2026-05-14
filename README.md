<div align="center">

<!-- logo placeholder -->
<!-- <img src="assets/logo.svg" alt="Linka" width="200"> -->

# linka

### The missing link between AI agents.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/hahhforest/linka?style=social)](https://github.com/hahhforest/linka)

[Vision](#vision) · [Why Linka](#why-linka) · [Architecture](#architecture) · [Roadmap](#roadmap) · [Contributing](#contributing)

</div>

---

## Vision

Today we have agents. What we don't have is **the space between them**.

Every AI agent — Claude Code, OpenCode, Cursor, Cline — is a powerful, isolated brain. But brains without nerves are just tissue. No agent can discover another. No agent can hand off context to a colleague. No human can talk to their agents the way they talk to their teammates — in a chat window, naturally, asynchronously.

**Linka is the communication infrastructure for the agent era.** A protocol-native layer that sits above individual agents and below human interfaces, making every agent addressable, conversational, and collaborative.

We believe:

- **Agents are communication entities, not tools.** You don't "invoke" a colleague — you talk to them. Agents deserve the same treatment.
- **Humans and agents share one communication plane.** Agents should join your Slack, your Feishu, your group chat — not hide behind a terminal.
- **Connection creates emergence.** When agents can freely discover, delegate, and converse, the system becomes greater than the sum of its parts.

We don't build agents. We build the connections between them.

## Why Linka

| Today | With Linka |
|-------|-----------|
| Agents are isolated processes on your machine | Every agent has an identity and an address |
| Talking to an agent means opening its specific terminal | Talk to any agent from any IM — Feishu, Slack, Telegram, or Linka's own UI |
| Agent A cannot ask Agent B for help | Agents discover, message, and delegate to each other through a shared protocol |
| Switching context between agents is manual and lossy | Sessions are managed, context is preserved, handoffs are seamless |
| Running agents requires CLI expertise | One-click desktop app for everyone — power users get the CLI |

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Human Interface                        │
│   Desktop App  │  Web UI  │  CLI  │  Feishu / Slack / …  │
└───────┬────────┴────┬─────┴───┬───┴──────────┬───────────┘
        └─────────────┴────┬────┴──────────────┘
                           │
                    Linka Protocol
                    (addressing · messaging · sessions)
                           │
              ┌────────────┴────────────┐
              │       Linka Daemon       │
              │  ┌────────────────────┐  │
              │  │  Agent Registry    │  │
              │  │  Session Manager   │  │
              │  │  Message Router    │  │
              │  │  IM Bridge         │  │
              │  └────────────────────┘  │
              └────────────┬────────────┘
                           │
                    Adapter Layer
                           │
           ┌───────┬───────┼───────┬────────┐
           │       │       │       │        │
        Claude   Open    Cursor  Cline    Any
        Code     Code                    Agent
```

## Roadmap

> Linka is in early design phase. Everything below is directional.

- [ ] **Core Protocol** — Agent identity, addressing, message format
- [ ] **Daemon** — Session lifecycle, message routing, agent registry
- [ ] **Adapter SDK** — Plug any agent framework into Linka
- [ ] **CLI** — `linka start`, `linka chat`, `linka agent list`
- [ ] **Web UI** — Browser-based management and chat interface
- [ ] **Desktop App** — One-click install for macOS and Windows
- [ ] **IM Bridges** — Feishu, Slack, Telegram, Discord
- [ ] **Agent Discovery** — Agents find and negotiate with each other

## Contributing

Linka is just getting started. If the vision resonates, come build with us.

- Star this repo to follow along
- Open an issue to share ideas
- PRs welcome

## License

[MIT](LICENSE)

---

<div align="center">
<sub>We don't build agents. We build the connections between them.</sub>
</div>
