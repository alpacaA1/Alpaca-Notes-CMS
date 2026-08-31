# 标准布局模板

项目中的视图分为两大类布局范式。新建模块时，从中选取最接近的一种作为起点。

---

## 范式 A：三栏工作台（Rail + List + Detail）

适用于**有「收藏集/列表」概念**的模块，如人物簿、观影日记。

```
┌──────────┬──────────────┬─────────────────────────┐
│   Rail   │    List /    │       Detail Canvas     │
│  (固定)   │   Gallery    │      （居中表单/画布）    │
│  214~236px│  (弹性)      │    （弹性，min 400px）   │
└──────────┴──────────────┴─────────────────────────┘
```

### Grid 骨架

```css
.my-module {
  display: grid;
  grid-template-columns: 214px minmax(250px, 0.7fr) minmax(400px, 1.25fr);
  height: calc(100vh - 73px);  /* 73px = TopBar 高度 */
  overflow: hidden;
}
```

### Rail（左侧导轨）

- 品牌标识区：大写英文 Eyebrow（如 `PRIVATE INDEX`）+ 中文模块名 + 一句温暖副标题
- 新建按钮：`+ 新建XX`
- 计数统计：`{items.length} 条记录`
- 可选筛选列表（如观影日记的"全部/想看/已看"）

### List / Gallery（中间列表）

- 纵向滚动的卡片列表或海报网格
- 卡片使用 `button` 元素（可键盘聚焦）
- 选中态 `.is-selected`：极淡暖色底 + 左侧暖棕竖条

### Detail Canvas（右侧详情）

- 居中内容容器：`max-width: 660~690px; margin: 0 auto; padding: 38px clamp(...) 72px;`
- 表单结构从上到下：Eyebrow 标签、大标题输入、meta-grid（2列属性网格）、长文编辑区、保存按钮
- meta-grid 典型结构：

```css
.my-module__meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;  /* 用 border-bottom 分隔 */
}

.my-module__meta-grid label {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 15px 0 11px;
  border-bottom: 1px solid var(--module-line);
}

.my-module__meta-grid label > span {
  /* 属性标签：图标 + 文字 */
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 72px;
  color: var(--module-warm);
  font-size: 11px;
  font-weight: 700;
}
```

### 沉浸写作模式

- CSS modifier：`.my-module--writing`
- 缩减为 2 列：`grid-template-columns: 214px minmax(0, 1fr)`
- 隐藏中间列表，右侧展开为全宽写作画布
- 写作画布内置横线稿纸背景、字数统计、返回按钮

### 响应式

```css
@media (max-width: 1050px) {
  .my-module { grid-template-columns: 190px minmax(220px, 0.7fr) minmax(400px, 1.25fr); }
}
@media (max-width: 800px) {
  .my-module { display: block; }
  .my-module__rail { display: none; }
}
```

### 实际案例

- **人物簿** (`people-book`)：Rail + 人物卡片列表 + 人物详情表单
- **观影日记** (`movie-journal`)：Rail + 海报网格 + 影片详情表单

---

## 范式 B：阅读沉浸视图（TOC + Canvas + Sidebar）

适用于**以阅读/浏览为主**的模块，如电子书阅读、待读文章、RSS 阅读器。

```
┌──────────┬─────────────────────────┬──────────┐
│   TOC    │     Reading Canvas      │ Sidebar  │
│  (固定)   │     （弹性画布）          │  (固定)   │
│  232px   │                         │  320px   │
└──────────┴─────────────────────────┴──────────┘
```

### Flex 骨架

```css
.my-reader {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.my-reader__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.my-reader__toc {
  width: 232px;
  flex-shrink: 0;
  border-right: 1px solid var(--admin-line);
  overflow-y: auto;
}

.my-reader__canvas {
  flex: 1;
  min-width: 0;
  background: var(--module-paper, #f6efe2);
}

.my-reader__sidebar {
  width: 320px;
  flex-shrink: 0;
  padding-left: 14px;
  overflow-y: auto;
}
```

### 顶部工具栏

- 左：返回按钮（`← 返回XX`）
- 中：当前标题 + 章节/来源
- 右：布局切换、目录开关、导出、「聚焦」沉浸按钮

### 左侧目录（TOC）

- 「回到顶部」快捷操作
- 嵌套章节树，当前章节高亮 `.is-active`
- 点击跳转到对应位置

### 右侧侧栏（Sidebar）

- Tab 切换：`信息` / `评论`（或 `笔记`）
- 信息 Tab：元数据定义列表（标题、作者、进度、标注数等）
- 评论/笔记 Tab：结构化编辑字段或划线笔记卡片列表

### 沉浸模式

- CSS modifier：`.my-reader--immersive`
- 隐藏顶栏、TOC、Sidebar，只保留全屏画布
- 底部浮动小巧翻页器/进度条
- **只有一个入口按钮**（「聚焦」），不叠加多个 expand 控件

### 实际案例

- **电子书阅读** (`book-reader`)：TOC + Foliate.js/PDF.js 画布 + 信息/笔记侧栏
- **待读文章** (`editor-layout--reader`)：阅读目录 + PreviewPane 画布 + 信息/评论侧栏
- **RSS 阅读器** (`feed-dashboard`)：订阅源树 + 文章列表 + 阅读画布

---

## CSS 命名约定

所有模块统一使用 **BEM（Block-Element-Modifier）** 命名：

```
.module-name                    → Block
.module-name__element           → Element
.module-name__element--modifier → Modifier
.module-name--state-variant     → Block-level modifier

.is-active                      → 通用状态类
.is-selected                    → 通用选中态
.is-collapsed                   → 通用折叠态
```

### 自定义属性命名

模块级变量使用模块前缀：

```css
.my-module {
  --module-ink: #2e261f;       /* 主文字 */
  --module-muted: #847465;     /* 次要文字 */
  --module-line: rgba(93, 71, 50, 0.16);  /* 分割线 */
  --module-warm: #a77743;      /* 暖色强调 */
}
```

色值范围必须在项目统一色系内——参见 [设计变量字典](../references/design-tokens.md)。
