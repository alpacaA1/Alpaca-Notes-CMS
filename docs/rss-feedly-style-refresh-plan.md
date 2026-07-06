# RSS 轻量刷新与未读红点技术方案

## 1. 结论先行

当前 P0 不采用 Vercel Cron，也不新增独立 `feed-state.json`。更轻量的方案是：

1. 用户登录进入 admin 后，后台自动刷新所有 RSS 订阅。
2. admin 保持打开时，每 30 分钟后台刷新一次。
3. 页面切到后台时暂停定时刷新；回到前台且距离上次刷新超过 15 分钟时补刷一次。
4. 未读红点不再用 `articleCount - localStorage viewedCount` 推算，改用每个 feed 的 `latestItemKeys` / `unreadItemKeys`。
5. 状态直接内嵌在 `source/_data/feed-subscriptions.json` 的 feed 记录里，不新增数据库、不新增服务端 Cron、不新增 GitHub PAT。

一句话方案：

> admin 打开后即后台刷新 RSS；打开期间定时轻量轮询；未读状态保存在现有订阅文件中。

这个方案的取舍是：**admin 没打开时不会发现新内容**。但它能满足“进入 admin 就获取，不必打开 RSS 页面”，并且实现范围明显小于 Cron 方案。

## 2. 目标

### 2.1 必须达成

1. 登录进入 admin 后自动刷新 RSS，不要求进入 RSS 页面。
2. admin 打开期间自动轮询刷新。
3. 刷新不阻塞 dashboard、编辑器、预览等主流程。
4. feed 条数不变但条目替换时，也能识别新条目。
5. 顶部 RSS 红点能在任意 admin 页面更新。
6. 不引入数据库，不新增定时服务，不改变 Hexo + GitHub 内容源架构。

### 2.2 暂不处理

1. 不做 Vercel Cron。
2. 不保证 admin 关闭时也能发现新内容。
3. 不新增 `source/_data/feed-state.json`。
4. 不引入 GitHub 服务端 PAT。
5. 不做 WebSub / PubSubHubbub 实时推送。

## 3. 刷新策略

### 3.1 触发时机

| 场景 | 行为 |
| --- | --- |
| 登录进入 admin | 后台刷新所有 RSS |
| 打开任意 admin 页面 | 不需要进入 RSS 页面，也会刷新 |
| admin 保持打开 | 每 30 分钟刷新一次 |
| 页面隐藏 | 暂停定时刷新，避免浪费请求 |
| 页面恢复可见 | 如果距离上次刷新超过 15 分钟，立即补刷 |
| 手动进入 RSS 页面 | 优先刷新当前选中的 feed，其余 feed 后台继续 |

### 3.2 预期耗时

当前 RSS 抓取并发数是 `3`，单个 feed 抓取超时是 `12 秒`。

估算：

```text
总耗时 ~= ceil(feed 数量 / 3) * 单批平均耗时
```

正常情况下：

| feed 数量 | 典型耗时 |
| --- | --- |
| 10 个 | 5-15 秒 |
| 20 个 | 10-30 秒 |
| 30 个 | 20-60 秒 |

最坏情况由慢源超时决定，例如 20 个 feed 最坏约 `ceil(20 / 3) * 12 = 84 秒`。

实现上不要等全部 feed 完成后才更新 UI。每个 feed 成功后立即更新对应红点和缓存。

## 4. 数据模型

继续使用：

```text
source/_data/feed-subscriptions.json
```

在每个 feed 记录上增加轻量运行状态：

```json
{
  "id": "feed-example",
  "title": "Example Feed",
  "url": "https://example.com/feed.xml",
  "description": "",
  "category": "",
  "sourceType": "manual",
  "articleCount": 20,
  "readLaterCount": 0,
  "latestItemKeys": [
    "url:https://example.com/posts/new",
    "url:https://example.com/posts/old"
  ],
  "unreadItemKeys": [
    "url:https://example.com/posts/new"
  ],
  "lastFetchedAt": "2026-07-06T10:00:00.000Z",
  "lastSuccessfulFetchAt": "2026-07-06T10:00:00.000Z",
  "lastError": null,
  "createdAt": "2026-07-06T10:00:00.000Z",
  "updatedAt": "2026-07-06T10:00:00.000Z"
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `articleCount` | 保留兼容和展示，不再作为红点事实源 |
| `latestItemKeys` | 最近一次成功抓取到的条目 key 快照 |
| `unreadItemKeys` | 当前未读条目 key |
| `lastFetchedAt` | 最近一次尝试抓取时间 |
| `lastSuccessfulFetchAt` | 最近一次成功抓取时间 |
| `lastError` | 最近一次抓取错误 |

## 5. itemKey 规则

`itemKey` 用来判断 RSS 条目是否已见过。

优先级：

1. `guid` / Atom `id`
2. normalized URL
3. hash(`title + url + publishedAt`)

推荐格式：

```text
guid:<normalized-guid>
url:<normalized-url>
hash:<sha256>
```

URL 规范化规则：

1. 去掉 hash。
2. 去掉路径尾部多余 `/`。
3. host 小写。
4. 保留 query。

前端标记已读和刷新逻辑必须使用同一套 itemKey 规则，否则 unread key 会删不掉。

## 6. 刷新算法

单个 feed 刷新流程：

```text
输入：
  subscription
  importedFeed.items

流程：
  1. 抓取当前 feed items
  2. 为每个 item 生成 itemKey
  3. latestItemKeys = 当前 item keys
  4. previousKnownKeys = subscription.latestItemKeys
  5. newKeys = latestItemKeys - previousKnownKeys
  6. unreadItemKeys = previousUnreadItemKeys + newKeys
  7. 清理 unreadItemKeys 中已不在 latestItemKeys 的 key，避免无限增长
  8. 更新 articleCount / lastFetchedAt / lastSuccessfulFetchAt / lastError
  9. 保存 feed-subscriptions.json
```

首次刷新策略：

> 首次出现 `latestItemKeys` 为空时，只建立基线，不把历史条目全部标未读。

原因是用户订阅一个已有 feed 时，直接把最近 20 条全部打红点会制造噪音。

## 7. 前端接入

### 7.1 App 状态

继续使用现有 `rssSubscriptionsState`，不新增独立 RSS state 文件。

新增运行状态：

```ts
const [isRssBackgroundRefreshing, setIsRssBackgroundRefreshing] = useState(false)
const rssLastRefreshAtRef = useRef<number>(0)
const rssRefreshTimerRef = useRef<number | null>(null)
```

### 7.2 顶部红点

当前逻辑：

```ts
articleCount - viewedItemCount
```

改为：

```ts
subscription.unreadItemKeys?.length || 0
```

总红点：

```ts
rssSubscriptions.reduce((total, feed) => total + (feed.unreadItemKeys?.length || 0), 0)
```

### 7.3 Feed 列表数字

`FeedDashboard` 不再自己通过 localStorage 推算 unread，而是直接读取：

```ts
subscription.unreadItemKeys?.length || 0
```

### 7.4 标记已读

触发点：

1. 点击 feed item。
2. 打开原文。
3. 加入待读。
4. 点击“全部标为已读”。
5. 点击 feed 菜单里的 “Mark as read”。

行为：

```text
从当前 feed 的 unreadItemKeys 移除 itemKey
本地 React state 立即更新
debounce 2-3 秒保存 feed-subscriptions.json
```

不要每次点击都立刻保存 GitHub，避免频繁提交和冲突。

## 8. 保存与冲突处理

`feed-subscriptions.json` 仍然可能发生 GitHub sha 冲突，例如：

1. 一个浏览器正在后台刷新 RSS。
2. 另一个浏览器刚标记了已读。
3. 保存时远端 sha 已变化。

处理原则：

1. 刷新逻辑只新增 `newKeys`，不恢复用户已经移除的已读 key。
2. 标记已读逻辑只删除目标 key，不覆盖刷新产生的新 unread key。
3. 保存遇到 409 时重新读取最新订阅文件，应用本次局部变更后重试一次。
4. 如果重试仍失败，保留本地状态并提示用户稍后重试。

## 9. 错误处理

### 9.1 单个 feed 失败

不要中断整体刷新。

记录：

```json
{
  "lastFetchedAt": "2026-07-06T10:00:00.000Z",
  "lastError": "RSS 抓取失败（HTTP 500）。"
}
```

保留原来的：

- `latestItemKeys`
- `unreadItemKeys`
- `lastSuccessfulFetchAt`

### 9.2 后台刷新提示

后台刷新不应该打断用户。建议：

1. 顶部状态区域可以显示“RSS 更新中”。
2. 只在 RSS 页面展示具体失败 feed。
3. dashboard/editor 页面不弹出错误 toast，避免干扰写作。

## 10. 测试计划

### 10.1 单元测试

新增或修改：

```text
admin-app/src/app/rss/feed-subscriptions.test.ts
admin-app/src/app/layout/feed-dashboard.test.tsx
admin-app/src/app/App.*.test.tsx
```

覆盖：

1. 首次刷新只建立基线，不产生 unread。
2. 新增条目后写入 `unreadItemKeys`。
3. 条数不变但 key 替换时识别新 unread。
4. 顶部 RSS 红点读取 `unreadItemKeys.length`。
5. 点击 item 后 unread 减少。
6. “全部标为已读”清空当前 feed unread。
7. 保存冲突后重新读取并重试。

### 10.2 手动验证

1. 登录 admin，不进入 RSS 页面，确认后台开始刷新。
2. 刷新完成后，确认顶部 RSS 红点更新。
3. mock feed 新增一篇，等待后台刷新，确认红点 +1。
4. mock feed 保持 20 条但替换其中一条，确认红点 +1。
5. 点击条目，确认红点减少。
6. 刷新页面，确认红点状态保持。
7. admin 保持打开 30 分钟，确认自动触发下一轮刷新。
8. 切到后台标签页，确认暂停；回到前台超过 15 分钟后补刷。

## 11. 实施步骤

### 阶段 1：状态字段与 itemKey

1. 扩展 `FeedSubscription` 类型。
2. 实现 itemKey 生成函数。
3. 更新 parse / serialize 兼容旧文件。
4. 增加单元测试。

### 阶段 2：后台刷新

1. 把现有“进入 RSS 页面刷新一次”抽成可复用 `refreshRssSubscriptions`。
2. 登录并加载订阅后自动后台刷新。
3. 每个 feed 成功后渐进更新本地 state。
4. 保存 `feed-subscriptions.json`。

### 阶段 3：轮询

1. admin 打开期间每 30 分钟刷新一次。
2. 页面隐藏时暂停。
3. 页面恢复可见且距离上次刷新超过 15 分钟时补刷。

### 阶段 4：红点与已读

1. 顶部红点改读 `unreadItemKeys`。
2. Feed 列表数字改读 `unreadItemKeys`。
3. 点击条目、打开原文、全部标已读时更新 unread。
4. 已读保存使用 debounce。

## 12. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| admin 关闭时不会刷新 | 新内容不会主动出现 | 接受为轻量方案边界，后续再考虑 Cron |
| GitHub 保存频繁 | commit 噪音和冲突 | 已读操作 debounce，刷新批量保存 |
| 某些 feed 很慢 | 首轮耗时变长 | 并发 3、单 feed 12 秒超时、渐进更新 UI |
| 多浏览器同时操作 | unread 状态冲突 | 409 后读取最新文件并局部合并 |
| 状态字段膨胀 | 文件变大 | 每个 feed 只保留最近 50 个 latest keys、最多 200 个 unread keys |

## 13. 后续升级选项

如果以后确实需要“admin 没打开也能最多 2 小时发现新内容”，再升级到：

1. Vercel Cron 每 2 小时刷新。
2. 独立 `source/_data/feed-state.json`。
3. 服务端 GitHub Contents PAT。
4. Cron 与前端双写冲突合并。

这部分作为 P1/P2，不进入当前轻量版 P0。

## 附录：原 Cron 方案（暂不作为 P0）

### 1. 结论先行

当前 RSS 红点不及时的核心原因是：红点依赖前端临时抓取结果和 `articleCount` 推算，而不是一个稳定的“已发现新条目 / 未读条目”状态源。

如果按 Feedly 类产品的思路做 2 小时刷新，建议改造成：

1. 使用 Vercel Cron 每 2 小时触发服务端刷新。
2. 服务端抓取所有 RSS 订阅源，并把新条目写入持久化状态文件。
3. 前端红点直接读取持久化未读状态，不再用 `articleCount - viewedCount` 推算。
4. 用户阅读或标记已读时，前端同步更新未读状态。

一句话方案：

> 用 `source/_data/feed-state.json` 作为 RSS 未读事实源，Vercel Cron 每 2 小时更新它，admin-app 只负责展示和标记已读。

### 2. 背景与问题

当前 admin-app 的 RSS 红点逻辑大致是：

- 订阅列表存在 `source/_data/feed-subscriptions.json`。
- 每个订阅有 `articleCount`。
- 前端打开 admin 或进入 RSS 页面时，会尝试抓取 feed。
- 红点通过 `articleCount - viewedItemCount` 得出。
- 已读信息主要保存在浏览器 `localStorage`。

这个模型有几个问题：

1. 页面没打开时不会刷新，RSS 更新无法主动反映到红点。
2. `articleCount` 只表示最近一次抓到多少条，不表示哪些条目是新的。
3. 如果 RSS 源“新增一篇、旧的一篇掉出列表”，总条数不变，`articleCount` 不变，容易漏报。
4. 已读状态主要依赖本机浏览器，跨设备不稳定。
5. 前端抓取是用户交互路径的一部分，不适合作为红点的事实源。

### 3. 目标

### 3.1 必须达成

1. RSS 更新后最多 2 小时内出现在红点。
2. admin 页面未打开时也能刷新 RSS。
3. feed 条数不变但条目替换时，也能识别新条目。
4. 红点跨浏览器、跨设备保持一致。
5. 不引入数据库，不把项目改成重型 CMS。
6. 内容源仍然是 GitHub 内容仓库。

### 3.2 暂不处理

1. 不做 WebSub / PubSubHubbub 实时推送。
2. 不做智能分级刷新频率。
3. 不做全文搜索索引。
4. 不把 RSS 条目全部落成 Markdown。
5. 不迁移到 Supabase、SQLite、Redis 等外部存储。

### 4. 总体架构

```text
Vercel Cron
  每 2 小时触发
    |
    v
/api/refresh-feeds
  读取 source/_data/feed-subscriptions.json
  读取 source/_data/feed-state.json
  抓取每个 feed
  生成 itemKey
  对比 latestItemKeys
  新 itemKey 加入 unreadItemKeys
  写回 source/_data/feed-state.json
    |
    v
admin-app
  登录后读取 feed-state.json
  顶部 RSS 红点 = 所有 unreadItemKeys 总数
  用户点击条目 / 打开原文 / 全部标为已读
  更新 feed-state.json
```

### 5. 数据模型

### 5.1 现有订阅文件

继续使用：

```text
source/_data/feed-subscriptions.json
```

它仍然负责存订阅源本身：

```json
{
  "folders": [],
  "feeds": [
    {
      "id": "feed-example",
      "title": "Example Feed",
      "url": "https://example.com/feed.xml",
      "description": "",
      "category": "",
      "sourceType": "manual",
      "articleCount": 20,
      "readLaterCount": 0,
      "createdAt": "2026-07-06T10:00:00.000Z",
      "updatedAt": "2026-07-06T10:00:00.000Z"
    }
  ]
}
```

`articleCount` 可以保留用于展示或兼容旧逻辑，但不再作为红点事实源。

### 5.2 新增状态文件

新增：

```text
source/_data/feed-state.json
```

建议结构：

```json
{
  "version": 1,
  "lastRefreshAt": "2026-07-06T10:00:00.000Z",
  "feeds": {
    "https://example.com/feed.xml": {
      "lastFetchedAt": "2026-07-06T10:00:00.000Z",
      "lastSuccessfulFetchAt": "2026-07-06T10:00:00.000Z",
      "latestItemKeys": [
        "url:https://example.com/posts/new",
        "url:https://example.com/posts/old"
      ],
      "unreadItemKeys": [
        "url:https://example.com/posts/new"
      ],
      "etag": "\"abc\"",
      "lastModified": "Mon, 06 Jul 2026 10:00:00 GMT",
      "lastError": null
    }
  }
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `version` | 状态文件 schema 版本 |
| `lastRefreshAt` | 最近一次 Cron 整体刷新时间 |
| `feeds` | 以 feed URL 为 key 的状态表 |
| `lastFetchedAt` | 最近一次尝试抓取时间 |
| `lastSuccessfulFetchAt` | 最近一次成功抓取时间 |
| `latestItemKeys` | 最近抓取到的条目 key 快照 |
| `unreadItemKeys` | 当前未读条目 key |
| `etag` | 条件请求用的 ETag |
| `lastModified` | 条件请求用的 Last-Modified |
| `lastError` | 最近一次错误信息 |

### 5.3 itemKey 规则

`itemKey` 用来判断一篇 RSS 条目是否已经见过。

优先级：

1. `guid` / Atom `id`
2. normalized URL
3. hash(`title + url + publishedAt`)

推荐格式：

```text
guid:<normalized-guid>
url:<normalized-url>
hash:<sha256>
```

URL 规范化规则：

1. 去掉 hash。
2. 去掉路径尾部多余 `/`。
3. host 小写。
4. 保留 query，因为很多站点用 query 区分文章。

### 6. 服务端设计

### 6.1 新增 API

新增：

```text
api/refresh-feeds.js
```

职责：

1. 校验调用来源。
2. 读取订阅文件。
3. 读取状态文件，不存在则初始化。
4. 并发抓取 feed。
5. 计算新增 item keys。
6. 合并 unread 状态。
7. 写回状态文件。
8. 返回刷新摘要。

返回示例：

```json
{
  "refreshedAt": "2026-07-06T10:00:00.000Z",
  "feedCount": 12,
  "successCount": 11,
  "failureCount": 1,
  "newUnreadCount": 5
}
```

### 6.2 Cron 配置

修改 `vercel.json`：

```json
{
  "buildCommand": "mkdir -p .vercel-static && printf '%s\n' '<!doctype html><meta charset=\"utf-8\"><title>Alpaca Notes API</title><p>Alpaca Notes API</p>' > .vercel-static/index.html",
  "outputDirectory": ".vercel-static",
  "crons": [
    {
      "path": "/api/refresh-feeds",
      "schedule": "0 */2 * * *"
    }
  ]
}
```

`0 */2 * * *` 表示每 2 小时执行一次。

### 6.3 权限校验

Cron API 不应允许公开随意调用。

建议支持两种方式：

1. Vercel Cron 请求头校验。
2. `CRON_SECRET` query 或 header 校验。

推荐：

```text
Authorization: Bearer <CRON_SECRET>
```

没有正确 secret 时返回 `401`。

### 6.4 GitHub 内容读写

新增服务端 helper：

```text
api/_lib/github-content.js
```

职责：

1. 读取 GitHub Contents API 文件。
2. 保存 JSON 文件。
3. 处理文件不存在。
4. 处理 sha 冲突。
5. 统一 base64 编解码。

需要环境变量：

```text
GITHUB_CONTENT_TOKEN=...
GITHUB_CONTENT_OWNER=alpacaA1
GITHUB_CONTENT_REPO=Alpaca-Notes-Content
GITHUB_CONTENT_BRANCH=main
CRON_SECRET=...
```

说明：

- `GITHUB_CONTENT_TOKEN` 建议使用 fine-grained PAT。
- 权限范围限定到 `alpacaA1/Alpaca-Notes-Content`。
- 需要 Contents read/write 权限。

### 6.5 抓取并发

建议并发数：

```text
3
```

原因：

1. 与当前前端 `RSS_AUTO_REFRESH_CONCURRENCY = 3` 保持一致。
2. 避免对源站和 Vercel 函数造成压力。
3. 订阅数量不大时足够。

### 6.6 条件请求

第一版可以先复用现有 `importFeed`。

如果要更接近 Feedly，需要扩展 `api/_lib/feed-import.js`：

1. 支持传入 `etag`。
2. 支持传入 `lastModified`。
3. 请求时带：

```text
If-None-Match: <etag>
If-Modified-Since: <lastModified>
```

4. 响应 `304 Not Modified` 时不解析正文，直接保留旧状态。
5. 成功响应时保存新的 `ETag` 和 `Last-Modified`。

这一步可以作为 P1，不阻塞第一版上线。

### 7. 刷新算法

### 7.1 单个 feed 刷新流程

```text
输入：
  subscription
  previousFeedState

流程：
  1. 抓取 feed items
  2. 为每个 item 生成 itemKey
  3. latestItemKeys = 当前抓到的 item keys
  4. previousKnownKeys = previousFeedState.latestItemKeys
  5. newKeys = latestItemKeys - previousKnownKeys
  6. unreadItemKeys = previousUnreadItemKeys + newKeys
  7. 清理 unreadItemKeys 中已经不在 latestItemKeys 的 key，避免无限增长
  8. 写入 lastFetchedAt / lastSuccessfulFetchAt

输出：
  nextFeedState
  newUnreadCount
```

### 7.2 首次刷新策略

首次出现的 feed 有两个选择：

1. 把所有当前条目都标为未读。
2. 只建立基线，不标未读。

推荐第一版使用方案 2：

> 首次刷新只建立 `latestItemKeys` 基线，不把历史条目全部打红点。

原因：

- 用户订阅一个已有 feed 时，如果直接把最近 20 条全标未读，红点噪音大。
- 新增订阅时前端本来会展示最近条目，用户可以自行加入待读。

可选字段：

```json
{
  "initializedAt": "2026-07-06T10:00:00.000Z"
}
```

当 `initializedAt` 不存在时，说明这是首次刷新。

### 7.3 条目替换但总数不变

旧状态：

```json
{
  "latestItemKeys": ["A", "B"],
  "unreadItemKeys": []
}
```

新抓取：

```json
["B", "C"]
```

结果：

```json
{
  "latestItemKeys": ["B", "C"],
  "unreadItemKeys": ["C"]
}
```

这正是当前 `articleCount` 模型无法稳定识别的场景。

### 8. 前端设计

### 8.1 新增 feed-state 客户端模块

新增：

```text
admin-app/src/app/rss/feed-state.ts
```

提供：

```ts
export type FeedStateFile = {
  version: 1
  lastRefreshAt: string
  feeds: Record<string, FeedRuntimeState>
}

export type FeedRuntimeState = {
  lastFetchedAt: string
  lastSuccessfulFetchAt: string
  latestItemKeys: string[]
  unreadItemKeys: string[]
  etag?: string
  lastModified?: string
  lastError: string | null
}
```

函数：

```ts
readFeedState(session)
saveFeedState(session, state)
getFeedUnreadCount(state, feedUrl)
getTotalFeedUnreadCount(state, subscriptions)
markFeedItemRead(state, feedUrl, itemKey)
markFeedRead(state, feedUrl)
```

### 8.2 App 状态

在 `App.tsx` 中新增：

```ts
const [rssFeedState, setRssFeedState] = useState<FeedStateFile>(createEmptyFeedState)
const [hasLoadedRssFeedState, setHasLoadedRssFeedState] = useState(false)
```

登录后：

1. 读取 `feed-subscriptions.json`。
2. 读取 `feed-state.json`。
3. 如果 `feed-state.json` 不存在，使用空状态。

### 8.3 顶部红点

当前逻辑：

```ts
articleCount - viewedItemCount
```

改为：

```ts
getTotalFeedUnreadCount(rssFeedState, rssSubscriptions)
```

红点仍然只在非 RSS 页面显示，这个交互可以保留。

### 8.4 Feed 列表数字

`FeedDashboard` 当前每个 feed 的未读数也由 `articleCount - viewedItemCount` 推算。

改为传入：

```ts
feedUnreadCountsByUrl: Record<string, number>
```

每个订阅旁边显示：

```ts
feedUnreadCountsByUrl[subscription.url] || 0
```

### 8.5 标记已读

触发点：

1. 点击 feed item。
2. 打开原文。
3. 加入待读。
4. 点击 “全部标为已读”。
5. 点击 feed 菜单里的 “Mark as read”。

行为：

```text
从 feed-state.json 对应 feed 的 unreadItemKeys 中移除 itemKey
保存 feed-state.json
更新本地 React state
```

为了减少频繁写 GitHub，可以做两档：

1. P0：每次点击立即保存，逻辑简单。
2. P1：本地立即更新，后台 debounce 2-3 秒批量保存。

推荐第一版先做 P0。

### 9. 冲突处理

`feed-state.json` 会被两个入口写：

1. Vercel Cron 新增 unread。
2. 前端用户标记已读。

因此必须处理 GitHub Contents API 的 sha 冲突。

### 9.1 Cron 冲突

场景：

- Cron 读取旧 sha。
- 用户刚刚标记已读，写入了新 sha。
- Cron 保存失败。

处理：

1. 重新读取最新 `feed-state.json`。
2. 把本轮发现的 `newKeys` 合并到最新状态。
3. 不恢复用户已经移除的 unread key。
4. 重试保存一次。

### 9.2 前端冲突

场景：

- 用户读取旧 sha。
- Cron 新增了 unread。
- 用户标记已读保存失败。

处理：

1. 重新读取最新 `feed-state.json`。
2. 从最新状态中移除用户刚读过的 key。
3. 保留 Cron 新增的其他 unread key。
4. 重试保存一次。

### 9.3 合并原则

1. Cron 只新增 unread，不恢复已读。
2. 前端只删除用户已读 key，不覆盖新 unread。
3. `latestItemKeys` 以最新抓取结果为准。
4. `lastError` 只记录对应 feed 的最近错误。

### 10. 错误处理

### 10.1 单个 feed 失败

不要中断整体刷新。

记录：

```json
{
  "lastFetchedAt": "2026-07-06T10:00:00.000Z",
  "lastError": "RSS 抓取失败（HTTP 500）。"
}
```

保留原来的：

- `latestItemKeys`
- `unreadItemKeys`
- `lastSuccessfulFetchAt`

### 10.2 状态文件损坏

如果 `feed-state.json` JSON 格式错误：

1. Cron 不应覆盖文件。
2. 返回 500。
3. 前端显示“RSS 状态文件格式无效”。

避免自动重建，因为自动覆盖可能丢失未读状态。

### 10.3 订阅文件不存在

如果 `feed-subscriptions.json` 不存在：

1. Cron 返回成功，`feedCount = 0`。
2. 不创建状态文件，或创建空状态都可以。

推荐不创建，减少无意义提交。

### 11. 安全与权限

### 11.1 GitHub Token

使用 fine-grained PAT：

- Repository: `alpacaA1/Alpaca-Notes-Content`
- Permissions: Contents read/write
- Branch: `main`

不使用用户浏览器 OAuth token 执行 Cron，因为 Cron 没有用户会话。

### 11.2 API 访问控制

`/api/refresh-feeds` 必须校验：

```text
Authorization: Bearer <CRON_SECRET>
```

本地调试可以用：

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:3000/api/refresh-feeds"
```

### 11.3 日志

不要打印 GitHub token。

可以打印：

- feed URL host
- 成功数量
- 失败数量
- 新增 unread 数量
- 错误 code

### 12. 测试计划

### 12.1 服务端单元测试

新增：

```text
api/refresh-feeds.test.js
api/_lib/feed-state.test.js
api/_lib/github-content.test.js
```

覆盖：

1. 首次刷新只建立基线，不产生 unread。
2. 新增条目后写入 `unreadItemKeys`。
3. 条数不变但 key 替换时识别新 unread。
4. 单个 feed 抓取失败只记录 `lastError`。
5. 多 feed 并发刷新结果正确。
6. 状态文件不存在时初始化。
7. 状态文件 JSON 损坏时报错。
8. 保存遇到 409 后 merge retry。

### 12.2 前端单元测试

新增或修改：

```text
admin-app/src/app/rss/feed-state.test.ts
admin-app/src/app/App.read-later-import.test.tsx
admin-app/src/app/layout/feed-dashboard.test.tsx
```

覆盖：

1. 顶部 RSS 红点读取 `feed-state`。
2. feed 列表显示 `unreadItemKeys.length`。
3. 点击 item 后 unread 减少。
4. “全部标为已读”清空当前 feed unread。
5. feed-state 不存在时红点为 0。
6. 保存冲突后重新读取并重试。

### 12.3 手动验证

1. 本地准备两个 mock feed。
2. 首次刷新，确认无红点或按既定策略显示。
3. mock feed 新增一篇，执行 refresh，确认红点 +1。
4. mock feed 保持 20 条但替换其中一条，确认红点 +1。
5. 点击条目，确认红点减少。
6. 刷新页面，确认红点状态保持。
7. 换浏览器登录，确认红点一致。

### 13. 实施步骤

### 阶段 1：状态模型

1. 新增 `api/_lib/feed-state.js`。
2. 新增 `admin-app/src/app/rss/feed-state.ts`。
3. 实现 parse / serialize / normalize。
4. 增加单元测试。

### 阶段 2：服务端刷新

1. 新增 `api/_lib/github-content.js`。
2. 新增 `api/refresh-feeds.js`。
3. 复用 `api/_lib/feed-import.js` 抓取 feed。
4. 实现 key diff 和 unread 合并。
5. 增加 API 测试。

### 阶段 3：前端接入

1. `App.tsx` 登录后读取 feed-state。
2. 顶部红点改读 feed-state。
3. `FeedDashboard` 改读 feed-state unread count。
4. 点击条目和全部标已读时保存 feed-state。
5. 保留 localStorage viewed 缓存，但不再作为红点事实源。

### 阶段 4：Cron 与部署

1. 修改 `vercel.json` 增加 crons。
2. 配置 Vercel 环境变量。
3. 部署。
4. 手动触发 `/api/refresh-feeds` 验证。
5. 等待 2 小时观察自动刷新。

### 阶段 5：优化

1. 支持 ETag / Last-Modified。
2. 对连续失败 feed 降频。
3. 前端标已读保存 debounce。
4. 在 RSS 页面展示 `lastRefreshAt` 和失败 feed 提示。

### 14. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| GitHub API 写冲突 | unread 状态覆盖 | 实现 merge retry |
| Cron 调用失败 | 红点延迟超过 2 小时 | 记录 `lastRefreshAt`，前端展示过期状态 |
| 某些 feed 没有稳定 guid | 新旧判断误差 | fallback 到 normalized URL 和 hash |
| 订阅数量增加 | Vercel 函数超时 | 并发限制，后续分批刷新 |
| 状态文件膨胀 | GitHub 文件变大 | 只保留最近 N 个 `latestItemKeys` 和 unread |
| Token 泄漏 | 内容仓库风险 | 使用 Vercel env，限制 fine-grained PAT 权限 |

### 15. 推荐默认参数

| 参数 | 默认值 |
| --- | --- |
| Cron 频率 | 每 2 小时 |
| 抓取并发 | 3 |
| 每个 feed 保留 latest keys | 50 |
| unread keys 最大保留 | 200 |
| 保存冲突重试 | 1 次 |
| 单 feed 抓取超时 | 沿用现有 `feed-import` |
| 首次刷新 | 建立基线，不标未读 |

### 16. 最终效果

改造完成后：

1. RSS 红点不依赖用户是否打开页面。
2. RSS 更新最多 2 小时内被发现。
3. 条数不变但内容更新也能识别。
4. 未读状态跨设备一致。
5. 当前轻量 GitHub 内容仓库架构保持不变。

这个方案是 Feedly 式轮询模型的轻量实现，适合当前 Hexo + GitHub Pages + admin-app 项目。
