# Linka 项目协作规则

## 项目沟通

* 默认使用中文沟通、解释和汇报，除非用户明确要求使用英文或目标文件本身必须使用英文。

* 回复要直接说明结论、改动位置和验证结果，避免泛泛解释。

* 涉及本地文件路径时，给出以 `/` 开头的绝对路径。

## 文档写作

* 文档章节结构要清晰、直接。先设计稳定的顶层一级章节，非必要不新增一级章节。

* 新增内容优先放入已有一级章节下，用二级或三级小节承载细节。

* 避免每次小改都新增一个新的一级章节，防止文档结构变散。

* 标题应表达内容本身，不使用空泛标题。

## 文档同步

* 修改功能、定位、架构、使用方式、术语或产品叙述时，要主动检查是否需要同步更新对应文档。

* 修改 `README.md` 时，默认也要同步修改 `README_EN.md`。

* 如果某次修改只适合中文 README，必须在最终汇报里说明原因。

* 中文版和英文版 README 应尽量保持结构一致，避免一个版本长期落后。

* 新增重要文档时，要确认它和现有 `README.md`、`README_EN.md`、`docs/` 内容没有明显冲突。

## Code Agent 线索索引

### 公开文档

* `docs/vision.md`：项目愿景和对外叙事的源头。修改定位、口号、产品方向前先读。

* `docs/PRD.md`：产品定义、核心抽象、MVP 范围和成功标准。修改产品行为或用户体验边界前先读。

* `docs/TECH.md`：技术架构、Daemon、Room Runtime、Harness、runtime adapter、存储和实时协议的主线。修改架构或跨包边界前先读。

* `docs/room-oo-reference.md`：Room 的 IM 群聊对象边界。涉及 Room、Member、Message、Permission、runtime 边界时必须对照。

* `docs/plans/`：分阶段执行计划和已完成 lane 的约束。接手具体实现任务时，先找同阶段或相邻阶段的 plan。

### 内部资料

* `inner_docs/`：内部研究和构建报告目录，不进公开仓库；需要背景、历史讨论或阶段细节时再进入查看，不在 `AGENTS.md` 展开具体内容。

### Agent 本地能力

* `.agents/skills/` 保存项目本地 agent skill；创建或改写 `inner_docs/*.html` 时优先使用 `.agents/skills/linka-html-doc/SKILL.md` 的风格约束。

### 对外入口

* `README.md` 和 `README_EN.md` 是对外叙述入口；修改项目定位或产品表达时需要同步检查两者。

## 工作方式

* 开始修改前先检查当前 git 状态，识别已有用户改动，不能覆盖或回退用户未要求处理的内容。

* 修改应保持范围小，优先遵循项目已有风格。

* 修改代码前先阅读 `inner_docs/nightly-agent-team-operating-model.html`，理解当前并行协作和质量门槛。

* 在分配的 `.worktree/<lane>` 目录内工作，不编辑其他 lane，也不在 main checkout 里做并行开发任务。

* 主线只合入已通过要求验证的绿色分支。

* 一个阶段结束时必须形成可追溯提交，合入 `main`，并清理对应 worktree；已合并的临时分支也应删除，避免留下脏目录或无法管理的尾巴。

* 除非任务明确要求修改契约，否则将 `shared` 和 `config` 的公开契约视为冻结。

* 严格停留在任务边界内，不回退、覆盖或清理无关 worker / 用户改动。

* 不要把 build、worker、task status 写入 Room data。

* Phase 00 scaffold 类修改需要运行 `pnpm install`、`pnpm typecheck`、`pnpm build` 和 `pnpm test`。

* 完成后汇报改了哪些文件，以及是否运行了验证命令。
