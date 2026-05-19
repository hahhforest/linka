---
title: "Internal HTML Report Style"
type: "reference"
status: "final"
owner: "linka-html-doc"
---

# Internal HTML Report Style

## 核心审美

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

- `.shell` 使用两栏：左侧目录 `aside`，右侧正文 `main`。
- `aside` 在桌面端 sticky，高度 100vh，可滚动。
- 移动端变成单栏，目录放在顶部。
- `main` 最大宽度约 `1120px`。
- 正文使用 `article`。

## CSS 方向

基础变量建议：

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

- `--paper` 纸张底色。
- 非侵入式网格线或轻微纹理。
- 不要大面积强渐变。
- 不要高饱和霓虹背景。

字体：

- 标题可用 serif：`Iowan Old Style`, `Songti SC`, `STSong`, `Georgia`。
- 正文用 sans：`Avenir Next`, `PingFang SC`, `Microsoft YaHei`。
- 代码用 mono。

## 信息组织

每份 HTML 应该像一份报告，而不是设计稿。

推荐结构：

1. Hero：标题、简短说明、元信息卡片。
2. 一句话结论。
3. 背景和范围。
4. 核心概念或关键发现。
5. 对比表。
6. 决策、共识或建议。
7. 开放问题。
8. 来源或备注。

避免：

- 开头大段铺陈。
- 把所有内容做成卡片。
- 每个小点都新建一级标题。
- 没有目录。
- 没有表格和引用块辅助扫读。

## 组件约定

优先使用这些阅读型组件：

- `.hero`：报告标题区。
- `.meta`：元信息网格。
- `blockquote`：关键判断。
- `.table-wrap > table`：对比表。
- `pre > code`：结构示意。
- `.note`：补充说明。
- `.warn`：风险提示。
- `.rule`：段落分隔。

允许的 JS：

- 左侧目录滚动高亮。
- 简单锚点激活。

不要使用复杂 JS 组件。

## 目录规则

左侧目录必须可扫读。目录项应该对应主要章节，不要把所有三级标题都放进去。

示例：

```html
<nav aria-label="页面目录">
  <a href="#summary">一句话结论</a>
  <a href="#scope">范围和背景</a>
  <a href="#findings">关键发现</a>
  <a href="#decisions">决策建议</a>
  <a href="#open-questions">开放问题</a>
</nav>
```
