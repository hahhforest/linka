---
name: linka-html-doc
description: Use when creating or rewriting LinkA internal HTML documents under inner_docs/. Enforces readable report-style HTML based on the Mavis internal report, not flashy landing-page design.
---

# LinkA HTML Doc

用于在 LinkA 项目中编写 `inner_docs/` 下的内部 HTML 文档。

这个 skill 的目标不是做炫酷网页，而是做**可长期阅读、可沉淀思考、可打开就懂的内部研究报告**。

## 触发场景

当用户要求：

- 写 `inner_docs/*.html`
- 重写内部 HTML 文档
- 沉淀架构、PRD、TECH、调研、概念梳理为 HTML
- 参考 `mavis-development-history-from-git-commits.html` 风格

必须使用本 skill。

## 核心审美

参考文件：

`/Users/minimax/Documents/workspace/linka_ws/linka/inner_docs/mavis-development-history-from-git-commits.html`

目标风格：

- 内部研究报告
- 纸张质感
- 左侧目录
- 正文优先
- 可读性优先
- 表格、引用块、代码块清楚
- 少装饰、少动画、少渐变
- 适合长时间阅读

不要做成：

- 花哨 landing page
- 深色霓虹展示页
- 卡片墙堆视觉效果
- 过度品牌化页面
- 难以阅读的实验性排版
- 为了“好看”牺牲信息密度和扫读效率

## 推荐页面结构

使用单文件 HTML：

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>...</title>
  <style>...</style>
</head>
<body>
  <div class="shell">
    <aside>...</aside>
    <main>
      <header class="hero">...</header>
      <article>...</article>
    </main>
  </div>
  <script>...</script>
</body>
</html>
```

布局要求：

- `.shell` 使用两栏：左侧目录 `aside`，右侧正文 `main`
- `aside` 在桌面端 sticky，高度 100vh，可滚动
- 移动端变成单栏，目录放在顶部
- `main` 最大宽度约 `1120px`
- 正文使用 `article`

## CSS 方向

基础风格可沿用 Mavis 报告：

```css
:root {
  --paper: #f6f1e7;
  --ink: #1f2421;
  --muted: #697066;
  --line: #d8cdb9;
  --card: rgba(255, 252, 245, 0.82);
  --dark: #17231f;
  --green: #0b6b57;
  --blue: #275f7e;
  --amber: #a56100;
  --red: #a34032;
  --shadow: 0 22px 70px rgba(58, 45, 26, 0.14);
  --mono: "SFMono-Regular", "Cascadia Code", Menlo, Consolas, monospace;
  --serif: "Iowan Old Style", "Songti SC", STSong, Georgia, serif;
  --sans: "Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
```

推荐背景：

- `--paper` 纸张底色
- 非侵入式网格线
- 不要大面积强渐变
- 不要高饱和霓虹背景

字体：

- 标题用 serif：`Iowan Old Style`, `Songti SC`, `STSong`, `Georgia`
- 正文用 sans：`Avenir Next`, `PingFang SC`, `Microsoft YaHei`
- 代码用 mono

## 信息组织

每份 HTML 应该像一份报告，而不是设计稿。

推荐结构：

1. Hero：标题、简短说明、元信息卡片
2. 一句话结论
3. 核心概念
4. 对象边界
5. 对比表
6. 决策/共识
7. 开放问题
8. 来源或备注

避免：

- 开头大段铺陈
- 把所有内容做成卡片
- 每个小点都新建一级标题
- 没有目录
- 没有表格和引用块辅助扫读

## 组件约定

优先使用这些阅读型组件：

- `.hero`：报告标题区
- `.meta`：4 格元信息
- `blockquote`：关键判断
- `.table-wrap > table`：对比表
- `pre > code`：结构示意
- `.note`：补充说明
- `.warn`：风险提示
- `.rule`：段落分隔

不要使用复杂 JS 组件。

允许的 JS：

- 左侧目录滚动高亮
- 简单锚点激活

## 目录规则

左侧目录必须可扫读。

目录项应该对应主要章节，不要把所有三级标题都放进去。

示例：

```html
<nav aria-label="页面目录">
  <a href="#一句话结论">一句话结论</a>
  <a href="#1-room-是群聊不是任务">1. Room 是群聊，不是任务</a>
  <a href="#2-doc-是独立协作文档">2. Doc 是独立协作文档</a>
</nav>
```

## 内容写作规则

- 默认中文。
- 句子要短。
- 每节先给结论，再给解释。
- 对象定义要稳定，不要混入实现字段。
- 如果是概念梳理，优先使用“是什么 / 不是什么 / 和谁的关系”。
- 如果是调研，优先写“结论 / 证据 / 对 LinkA 的启发 / 不应照搬”。

## LinkA 项目特殊约束

写关于 LinkA 的概念文档时，遵守这些当前共识：

- 项目名写作 `LinkA`。
- `Room` 是 IM 群聊聚合根，类似 QQ 群，不是任务容器。
- `Doc` 是独立协作文档组件，类似飞书云文档 / Overleaf，不是 Room 的内置 Board。
- `Room` 和 `Doc` 可以互相引用、置顶、通知，但不是父子绑定。
- 不要使用 `RoomBoard` 作为核心术语，除非是在讨论历史概念或被废弃命名。
- 不要提前预设 Doc 的 section；协作结构应自然生长。
- Agent 可以直接编辑 Doc，但必须有版本、署名、评论、批注和通知基础设施。
- 人类可读性可以由 Web UI 提供，底层内容不必被固定为 Markdown。

## 文件位置

内部 HTML 文档放在：

`/Users/minimax/Documents/workspace/linka_ws/linka/inner_docs/`

该目录被 `.gitignore` 忽略，不进入公开仓库提交。

## 完成前检查

完成后必须检查：

- HTML 能被读取。
- `inner_docs/` 仍被 Git 忽略。
- 没有误改公开文档。
- 最终回复给出绝对路径。

可以运行：

```bash
git status --short --ignored
```

如果只改了 `inner_docs/`，工作区中应该看到 `!! inner_docs/`，而不是 `?? inner_docs/...`。
