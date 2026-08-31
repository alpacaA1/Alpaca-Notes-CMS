---
name: alpaca-design-audit
description: 项目 UI/UX 深度设计与体验审计技能。在需要检查全站或模块设计合规性、发现信息架构割裂、排查渐进披露缺陷、统一弹窗/侧栏规范或发版前质检时激活此技能。
---

# Alpaca Design Audit（设计与体验审计规范）

## 技能定位与核心心智
- 本技能是 **质检员（Inspector / Reviewer）**，专门从**微观代码规则**与**宏观体验架构**两个层次审计项目的前端设计合规性。
- 与建设性技能 `alpaca-design-system` 配合：一个负责「怎么写」，一个负责「怎么查」。

---

## 4 维启发式评估模型（Heuristic Audit Model）

进行设计审计时，必须严格执行以下 4 个维度的检查，严禁仅依靠简单字符串扫描：

### 维度 1：渐进披露与视觉降噪（Progressive Disclosure）
- **大体积低频控件**：
  - 严禁备用/低频的超长文本域（如手工粘贴正文）、辅助配置表单直接平铺在首屏；必须收纳进折叠卡片（`<MetadataSection>`）或按需弹出。
- **工具栏与操作收敛**：
  - 顶栏/工具栏横向按钮超过 4 个时，必须将低频操作（如备份、同步、导出）收敛至「更多…」下拉菜单。
- **常驻输入框排查**：
  - 侧栏或列表顶部不应常驻大号表单输入框，应采用展开式气泡或模态框。

### 维度 2：跨模块对称性（Cross-Module Parity）
- **侧栏与元信息结构**：
  - 文章（Posts）、待读（Read Later）、日记（Diary）、选题（Pitches）等元信息侧栏必须统一采用 `MetadataSection`（基础信息 / 业务状态 / 高级设置）三段式卡片。
- **三栏工作台对称（Rail + List + Detail）**：
  - 人物簿（People）与 观影日记（Movies）等同构工作台，必须在标签选择（`TaxonomyMultiSelect`）、沉浸编辑（`MarkdownEditor`）、列表项布局和空状态占位上保持 100% 对称。
- **阅读沉浸视图对称（TOC + Canvas + Sidebar）**：
  - 电子书（EPUB）、文档（PDF）与待读（Read-Later）在全屏聚焦入口、目录开关（TOC）、侧栏数字徽章上必须保持交互一致。
- **全局返回导航**：
  - 统一为 `<BackIcon />` 图标 + 语义文字（如 `← 返回文章`、`← 返回书架`），禁止纯文字或纯图标混用。

### 维度 3：弹窗与浮层规范（Dialogs & Overlays）
- **统一几何属性**：
  - 容器圆角统一为 `border-radius: 14px`。
  - 遮罩统一使用 `rgba(15, 12, 8, 0.52)`（深色模式对应 `rgba(0, 0, 0, 0.65)`）配合温和背景模糊 `backdrop-filter: blur(4px)`。
- **关闭按钮**：
  - 右上角关闭按钮统一为 32px 尺寸、6px 圆角的微按钮或与弹窗容器视觉统一。
- **操作按钮**：
  - 主副操作按钮形态必须统一（标准确认弹窗使用统一的胶囊按钮或温润实心按钮，严禁混用直角与完全不同风格的组件）。
- **禁止私造弹窗**：
  - 任何询问、警告、删除确认必须复用全局 `<ConfirmDialog />` / `requestAppConfirm`，严禁在业务视图内部手写 prompt dialog。

### 维度 4：纸墨隐喻与色彩合规（Metaphor & Color Integrity）
- **消除色彩孤岛**：
  - 浅色模式下严禁出现纯黑（`#000000` / `#11141a`）或纯白（`#ffffff`）生硬色块，必须使用 `--admin-surface`（羊皮纸暖白）、`--admin-bg`（暖米色）、`--admin-text`（深棕墨色）。
  - 深色模式下统一使用 `--admin-surface-strong` 和 `--admin-line`。
- **严禁高饱和冷色调**：
  - 状态徽章、未读点、选中项严禁使用电光蓝（`#1884f0`）或艳紫色，必须使用暖棕色系（`--admin-warm` / `--admin-save`）。
- **去技术化文案**：
  - 提示与报错禁止露出 HTTP 状态码、英文变量名、代码异常堆栈，必须使用安静有温度的中文短句。

---

## 审计执行工作流（Audit Workflow）

1. **第一步：宏观架构走查（Macro Inspection）**
   - 横向对比同类视图的 TSX 结构，检查是否有未遵循 `MetadataSection`、未复用 `MarkdownEditor`、未复用 `ConfirmDialog` 的模块。
2. **第二步：微观代码规则扫描（Micro Scanning）**
   - 检查原生 `<select>`、原生 `<input type="date">`、`alert()` / `confirm()`、手写 tag 文本框。
   - 检查 CSS 中脱离设计变量的 hardcoded 颜色、异常圆角（3px/5px/7px/9px/20px/24px）与过长过渡动画。
3. **第三步：输出分级整改报告**
   - 按 P0（规范底线与交互阻断）、P1（跨模块对称与布局断层）、P2（视觉降噪与细节统一）输出整改清单。
