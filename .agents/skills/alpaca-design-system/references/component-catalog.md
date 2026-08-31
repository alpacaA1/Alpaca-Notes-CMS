# 组件选型指南（Component Catalog）

在新增模块或选择交互方式时，**必须优先使用以下已有组件**，不要重新实现类似功能。

---

## 选型决策树

```
需要用户从若干选项中选一个？
├─ 是 → FilterSelect
│     ├─ 选项 ≤ 8 项 → searchable={false}
│     ├─ 选项 > 8 项 → searchable={true}
│     └─ 允许自定义值 → allowCustomValue={true}
│
需要多选标签/分类？
├─ 是 → TaxonomyMultiSelect
│
需要选择日期？
├─ 是 → MovieDatePicker（不只用于电影，适用所有日期场景）
│
需要长文本编辑？
├─ 是 → MarkdownEditor（支持工具栏、图片上传、双向链接）
│     └─ 纯文本简短输入 → 普通 <textarea> 即可
│
需要给用户非阻断反馈？
├─ 是 → 使用 App.tsx 中的 toast 机制（setSuccessMessage / setError）
```

---

## FilterSelect — 单选下拉

**文件**: `src/app/layout/filter-select.tsx`

**Props**:

| Prop | 类型 | 必须 | 说明 |
|:---|:---|:---|:---|
| `label` | `string` | ✅ | 语义标签（如 "分类"、"关系"、"状态"） |
| `value` | `string` | ✅ | 当前选中值 |
| `options` | `FilterSelectOption[]` | ✅ | `{ value, label, keywords? }` |
| `onChange` | `(value: string) => void` | ✅ | 选中回调 |
| `searchable` | `boolean` | — | 是否显示搜索框（选项 > 8 时开启） |
| `allowCustomValue` | `boolean` | — | 是否允许输入自定义值 |
| `placeholder` | `string` | — | 未选时占位文字 |
| `triggerAriaLabel` | `string` | — | 无障碍标签 |
| `onRenameOption` | `(old, new) => void` | — | 启用行内重命名 |
| `onDeleteOption` | `(value) => void` | — | 启用行内删除（含二次确认） |

**视觉规范**: 微毛玻璃浮层、`10px` 圆角、暖棕勾选标记 `✓`。

**典型用法**:
```tsx
<FilterSelect
  label="状态"
  value={draft.status}
  options={statusOptions}
  onChange={(v) => update('status', v)}
  placeholder="选择状态"
/>
```

---

## TaxonomyMultiSelect — 多选标签

**文件**: `src/app/layout/taxonomy-multi-select.tsx`

**Props**:

| Prop | 类型 | 必须 | 说明 |
|:---|:---|:---|:---|
| `label` | `'分类' \| '标签'` | ✅ | 固定语义（影响占位文字） |
| `value` | `string[]` | ✅ | 当前选中值数组 |
| `availableOptions` | `string[]` | ✅ | 可选项列表 |
| `onChange` | `(value: string[]) => void` | ✅ | 变更回调 |
| `onCreateOption` | `(name: string) => void` | — | 启用行内新建 |
| `onRenameOption` | `(old, new) => void` | — | 启用行内重命名 |
| `onDeleteOption` | `(name) => void` | — | 启用行内删除 |

**行为特点**: 选择不关闭面板（连续多选）；搜索无匹配时显示 `＋ 新建「query」` 按钮。

---

## MovieDatePicker — 日期选择器

**文件**: `src/app/movies/movie-date-picker.tsx`

> 虽然在 `movies/` 目录下，但它是通用日期选择器，适用于生日、纪念日、发布日期等所有场景。

**Props**:

| Prop | 类型 | 必须 | 说明 |
|:---|:---|:---|:---|
| `value` | `string` | ✅ | ISO 格式 `YYYY-MM-DD` |
| `onChange` | `(value: string) => void` | ✅ | 选择回调 |
| `ariaLabel` | `string` | ✅ | 无障碍标签 |
| `dialogLabel` | `string` | — | 日历面板标签 |

**视觉规范**: 6×7 日历矩阵，`12px` 圆角面板，高亮选中日和今天，提供「今天」快捷跳转。

---

## MarkdownEditor — 富文本编辑器

**文件**: `src/app/editor/markdown-editor.tsx`

已有功能：工具栏（加粗/斜体/链接/引用/代码块）、图片上传（粘贴/拖拽）、双向链接 `[[]]` 候选、实时预览切换。

**使用场景**: 人物簿的「关于他/她」沉浸编辑、日记正文、文章正文。简短输入场景（如 moments 输入、别名输入）不需要 MarkdownEditor，普通 `<textarea>` 即可。

---

## TopBar — 顶栏

**文件**: `src/app/layout/top-bar.tsx`

所有视图共享同一个 TopBar 实例。切换视图时通过 `adminView` prop 控制布局模式：

- **编辑器模式**: 左侧产品菜单 + 文章列表抽屉 + 新建按钮；右侧返回/设置/预览/保存
- **仪表盘模式**: 中央搜索框 + 内容类型切换；右侧功能入口（书架/影集/人物簿等）

> **规则**: 不要在子视图内自建顶栏，统一通过 TopBar props 控制。

---

## Toast 通知

**实现位置**: `src/app/App.tsx`（非独立组件文件）

通过 App 状态驱动：
- `setSuccessMessage('已保存')` → 绿色成功提示，3.2s 自动消失
- `setError('保存失败')` → 红色错误提示，5s 自动消失
- 可选 `toastAction` 附加操作按钮（如 "打开日记"）

> **规则**: 所有非阻断反馈统一走 Toast，不要 `alert()` 或自建弹窗。
