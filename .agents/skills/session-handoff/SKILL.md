---
name: session-handoff
description: "用于 TUI code agent 在长任务、上下文压力、会话切换或新建对话接续工作时生成和接收结构化 handoff。要求用文件记录目标、进度、改动、决策、验证、风险和下一步，不依赖后台会话组件。"
---

# Session Handoff

用于长任务换会话时，把旧 TUI code agent 的工作状态交给新 TUI 会话。这个 skill 不依赖后台会话组件；交接依靠文件、Git 状态和明确的接收检查。

## 何时使用

使用本 skill，当出现任一场景：

- 当前上下文太长，准备新建 TUI 对话继续工作。
- 任务已经进行了多轮，有未提交改动、关键决策、验证状态或风险。
- 需要把工作交给另一个 agent、人类或新终端会话。
- 用户要求“总结当前状态，方便下个会话继续”。
- 开始接手别人留下的长任务上下文。

低风险短任务、单轮问答、无本地状态的解释类请求不需要使用。

## 核心原则

- Handoff 文件是事实来源，不依赖聊天历史。
- 只写新会话继续工作所需的最小充分上下文，不写流水账。
- 旧会话必须记录 Git 和工作区状态；新会话必须先核对再继续。
- 大日志、大 diff、截图和导出数据不内联，放到 `evidence/`，handoff 里只写路径和摘要。
- 不要覆盖用户或其他 agent 的未确认改动；`Do Not Touch` 是硬边界。

## 快速流程

1. 旧会话创建 `.agents/session-handoff/<topic>/handoff.md`。可运行 `scripts/init_handoff.py` 生成初稿。
2. 旧会话补全 Goal / Current State / Changed Files / Key Decisions / Verification / Open Problems / Next Steps / Do Not Touch。
3. 新会话先读 `handoff.md`，再运行接收检查：`git status --short`、`git branch --show-current`、`git rev-parse HEAD`、`git diff --name-status`。
4. 新会话写 `ack.md`，说明是否接受交接、发现哪些不一致、从哪一步继续。
5. 新会话继续工作前，优先处理 handoff 中的阻塞、风险和禁止触碰范围。

## 文件结构

运行时目录建议放在项目根目录：

```text
.agents/session-handoff/<topic>/
├── handoff.md
├── ack.md
└── evidence/
```

`.agents/session-handoff/` 是运行时交接空间，应被 `.gitignore` 忽略。需要长期沉淀的交接记录应另存到正式文档位置。

## 需要读取的参考

- 交接协议、frontmatter 字段、写入规则：读 `references/handoff-protocol.md`。
- handoff 和 ack 模板：读 `references/templates.md`。
- 接收方检查清单和失败处理：读 `references/receiver-checklist.md`。

## 脚本

初始化 handoff 草稿：

```bash
python3 .agents/skills/session-handoff/scripts/init_handoff.py \
  --topic <topic-slug> \
  --goal "<用户目标>"
```

检查 handoff 与当前工作区是否一致：

```bash
python3 .agents/skills/session-handoff/scripts/check_handoff.py \
  .agents/session-handoff/<topic>/handoff.md
```

脚本只生成和检查交接文件，不会修改业务代码。
