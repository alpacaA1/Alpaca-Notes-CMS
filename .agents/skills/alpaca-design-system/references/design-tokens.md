# 设计变量字典（Design Tokens）

## 色彩系统

### 核心语义变量

| 变量 | 浅色 | 深色 | 用途 |
|:---|:---|:---|:---|
| `--admin-bg` | `#f4efe7` | `#13110e` | 页面主背景（温润羊皮纸 / 黑曜石） |
| `--admin-bg-deep` | `#ece3d7` | `#0d0b09` | 凹陷/深层背景 |
| `--admin-surface` | `rgba(255,252,247,0.9)` | `rgba(28,25,21,0.92)` | 半透明面板/侧边栏 |
| `--admin-surface-strong` | `#fffdfa` | `#1e1a16` | 实心高架面（卡片、浮层） |
| `--admin-line` | `#e5dacc` | `rgba(255,255,255,0.08)` | 微分割线 |
| `--admin-line-strong` | `#d6c8b8` | `rgba(255,255,255,0.12)` | 组件边框/强描边 |
| `--admin-text` | `#2f2a24` | `#ede6dc` | 主文字 |
| `--admin-muted` | `#6b6156` | `#a09585` | 次要文字 |
| `--admin-soft` | `#918577` | `#7a6e60` | 辅助/提示文字 |
| `--admin-warm` | `#8d714d` | `#d4a56a` | 核心暖棕强调色 |
| `--admin-warm-soft` | `rgba(141,113,77,0.12)` | `rgba(212,165,106,0.12)` | 暖色浅底色 |

### 按钮与交互变量

| 变量 | 浅色 | 深色 | 用途 |
|:---|:---|:---|:---|
| `--admin-save` | `#6f5537` | `#e4a358` | 主 CTA 背景（保存、新建） |
| `--admin-save-hover` | `#5b432b` | `#d89040` | 主 CTA 悬停 |
| `--admin-save-text` | `#fffaf2` | `#13110e` | 主 CTA 文字 |
| `--admin-button-radius` | `8px` | — | 标准按钮圆角 |
| `--admin-button-focus` | `0 0 0 3px rgba(141,113,77,0.22)` | — | 焦点环 |
| `--admin-button-danger` | `#8a4f46` | — | 危险操作文字 |
| `--admin-button-danger-bg` | `rgba(193,108,95,0.1)` | — | 危险操作背景 |

### 模块暖色变体

各模块有自己的暖色变量，但**色值始终在同一色系范围内**（金棕 `#8D714D` ~ 琥珀 `#A77743`）：

| 模块 | 文字色 | 强调色 | 背景纸色 |
|:---|:---|:---|:---|
| 人物簿 | `--people-ink: #2e261f` | `--people-warm: #a77743` | 继承 `--admin-bg` |
| 观影日记 | `--film-ink: #302821` | `--film-amber: #aa7640` | `--film-paper: #fbf7ef` |
| 电子书 | `--book-paper-text: #2b241c` | 继承 `--admin-warm` | `--book-paper: #f6efe2` |

> **规则**：新增模块时，如需自有变量（如 `--podcast-warm`），色相必须在 HSL `30°~42°` 范围内，饱和度 `45%~65%`，与已有模块协调。

---

## 字体系统

| 用途 | 字体栈 | 使用场景 |
|:---|:---|:---|
| **UI 无衬线（默认）** | `'Hiragino Sans GB', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif` | 管理后台控件、侧栏、表单 |
| **中文衬线（文学化）** | `'Noto Serif SC', 'Songti SC', 'Source Han Serif SC', serif` | 人物簿、观影感想、电子书阅读 |
| **西文衬线（标题）** | `'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Georgia, serif` | 英文标题、品牌字 |
| **等宽** | `'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace` | 代码块、技术信息 |

> **规则**：标题与阅读性正文使用衬线体，UI 操控区使用无衬线体。不要反过来。

---

## 阴影层级

| 层级 | box-shadow | 用途 |
|:---|:---|:---|
| **浮层/下拉面板** | `0 18px 36px rgba(36,24,10,0.14), 0 4px 12px rgba(36,24,10,0.06)` | FilterSelect、TaxonomyMultiSelect、DatePicker |
| **大型浮窗** | `0 24px 50px rgba(54,42,28,0.16)` | 阅读字体设置、用户菜单 |
| **对话框/模态** | `0 24px 48px rgba(0,0,0,0.24)` | 确认弹窗、设置面板 |
| **深色模式浮层** | `0 18px 36px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.16)` | 同浅色浮层的深色对应 |

---

## 圆角层级

| 尺寸 | 用途 |
|:---|:---|
| `4~6px` | 下拉选项行、日历按钮、小标签 |
| `8px` | 标准按钮、下拉触发器、输入框 |
| `10~12px` | 浮层面板、卡片、日期选择器 |
| `14~18px` | 分段容器、文档笔记卡、阅读字体弹窗 |
| `999px / 50%` | 胶囊状态标签、圆形头像 |

---

## 间距节奏

| 密度 | 间距 | 用途 |
|:---|:---|:---|
| 紧凑 | `2~4px` | 选项列表内 gap、图标与文字间距 |
| 常规 | `6~10px` | 表单行间距、卡片内边距 |
| 舒适 | `12~20px` | 区块之间、侧栏分组 |
| 宽松 | `24~40px` | 页面级分区、画布内边距 |

---

## 动效规范

- **标准过渡**: `150~180ms ease`（背景色、边框色、opacity）
- **面板进入**: `160~180ms ease` 配合 `@keyframes taxonomy-panel-enter`（translateY + opacity）
- **禁止使用**: 弹跳（bounce）、抖动（shake）、长时延（>300ms）的花哨动画
