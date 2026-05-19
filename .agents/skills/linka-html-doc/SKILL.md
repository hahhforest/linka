---
name: linka-html-doc
description: Use when creating or rewriting LinkA internal HTML documents under inner_docs/. Enforces readable report-style HTML with a reusable neutral template, not flashy landing-page design.
---

# LinkA HTML Doc

用于在 LinkA 项目中编写或重写 `inner_docs/` 下的内部 HTML 文档。

这个 skill 的目标不是做展示页，而是做**可长期阅读、可沉淀思考、打开就懂的内部研究报告**。

## 触发场景

当用户要求：

- 写 `inner_docs/*.html`
- 重写内部 HTML 文档
- 把架构、PRD、TECH、调研、概念梳理沉淀为 HTML
- 要求内部报告风格、纸张质感、左侧目录、正文优先、长文可读

必须使用本 skill。

## 使用流程

1. 明确文档目标、读者、核心结论和需要引用的事实来源。
2. 读取 `references/report-style.md`，按阅读型内部报告风格设计页面。
3. 如果文档涉及 LinkA 概念、术语或产品叙述，读取 `references/linka-writing-rules.md`。
4. 需要起稿时，复用 `assets/internal-report-template.html` 的结构和样式，替换成当前主题内容。
5. 输出到项目根目录的 `inner_docs/` 下。
6. 完成前检查 HTML 可读、目录可跳转、移动端可阅读、没有误改公开文档。

## 核心要求

- 使用单文件 HTML：HTML、CSS、少量 JS 放在一个 `.html` 文件中。
- 页面以正文阅读为核心：左侧目录、右侧正文，移动端变单栏。
- 内容先结论后解释，表格、引用块、代码块要清楚。
- 少装饰、少动画、少渐变，不做花哨 landing page。
- 不引用或复用 `inner_docs/` 下的历史文档作为公开风格来源；以本 skill 的模板和参考规范为准。

## 文件位置

内部 HTML 文档放在项目根目录的 `inner_docs/` 下。该目录被 `.gitignore` 忽略，不进入公开仓库提交。

## 完成前检查

完成后必须检查：

- HTML 能被浏览器直接打开并阅读。
- `inner_docs/` 仍被 Git 忽略。
- 没有误改公开文档。
- 最终回复给出以 `/` 开头的绝对路径。

可以运行：

```bash
git status --short --ignored
```

如果只改了 `inner_docs/`，工作区中应该看到 `!! inner_docs/`，而不是 `?? inner_docs/...`。
