---
name: alpaca-design-system
description: >-
  项目 UI 设计系统指南。在新增 UI 视图、构建新模块、做较大样式改动或选择/创建组件时激活此技能。
  提供设计哲学、变量字典、组件选型指南与标准布局模板，确保新增内容与现有风格统一。
---

# Alpaca Design System

本项目的视觉风格是**「纸墨 · 温润 · 克制」**——模拟高品质纸质手账与私人书房的质感，而非通用 SaaS 管理后台。

## 设计哲学（三条铁律）

1. **纸墨隐喻（Paper & Ink）**：背景永远是温润米白纸色，强调色永远是金棕/琥珀，禁止引入高饱和度蓝/紫/荧光色（危险删除除外）。
2. **无边框优先（Borderless by Default）**：阅读、笔记、评论等思考型区域彻底无边框化，文字直接呈现在画布上；索引/列表区域使用极淡微边框。
3. **克制与复用（Restrained & Reusable）**：优先复用已有组件，不重复造轮子；交互动效保持微妙克制（150~180ms ease），不做弹跳、抖动等花哨动画。

## 新模块落地检查清单

新建一个完整视图（如 `places`、`podcasts`）时，逐项检查：

- [ ] **布局框架**：是否采用项目标准的多栏 Grid 布局（Rail + List/Gallery + Detail Canvas）？→ 参考 [布局模板](./examples/layouts.md)
- [ ] **组件复用**：下拉选择用 `FilterSelect`？多选标签用 `TaxonomyMultiSelect`？日期用 `MovieDatePicker`？长文编辑用 `MarkdownEditor`？→ 参考 [组件选型](./references/component-catalog.md)
- [ ] **色彩与变量**：是否使用 `--admin-*` 系列变量而非硬编码色值？模块若有自己的暖色变体，是否在同一色系内（`#8D714D ~ #A77743` 范围）？→ 参考 [设计变量](./references/design-tokens.md)
- [ ] **深色模式**：是否自然适配（低对比度暖炭色，无刺眼白底残留）？
- [ ] **沉浸模式**：是否提供唯一一个「聚焦」入口，隐藏顶栏与侧栏，让画布最大化？
- [ ] **文案语调**：占位符和空状态使用安静、有温度的中文短句（如"从一段近况开始"、"把相处的片段留在这里"），避免工程化术语。
- [ ] **CSS 命名**：是否遵循 BEM 规范（`module-name__element--modifier`），状态类使用 `.is-active`、`.is-selected`？
- [ ] **圆角层级**：控件内部 `6~8px`、浮层面板 `10~12px`、分段容器 `14~18px`？

## 参考文档

需要具体数值或详细用法时，按需阅读以下文件：

- [设计变量字典](./references/design-tokens.md) — 色彩、字体、阴影、圆角、间距的标准值
- [组件选型指南](./references/component-catalog.md) — 已有组件的 Props、用法与选型决策
- [标准布局模板](./examples/layouts.md) — 多栏布局、沉浸模式的骨架参考
