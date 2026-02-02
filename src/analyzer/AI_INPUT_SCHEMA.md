# AI 输入数据结构规范

> 本文档定义发送给 AI 分析的数据结构，用于讨论字段含义和设计决策。

## 设计思路

1. **UserOverview** - 用户总览（全局信息）
2. **PeriodsSummary** - 所有活跃期的统计分析结果（一次性发送）
3. **PeriodContent** - 按活跃期分片发送内容
4. **关键规则**：不同活跃期必须分 chunk（同一 chunk 只能包含同一活跃期的内容）

## 发送策略

```
1. UserOverview      → AI 获得用户基本画像
2. PeriodsSummary    → AI 获得所有活跃期的统计概览
3. PeriodContent/Chunk → 按需分片发送各活跃期内容
```

---

## 1. UserOverview - 用户总览

> 在提示词后首先发送给 AI，描述目标用户的基本信息

| 字段              | 类型             | 说明                                                                                  |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------- |
| `joinDate`        | `string`         | 加入时间，格式：`2010-04-25 21:45:46 +08:00`                                          |
| `lastActiveTime`  | `string`         | 最后活动时间（取最后发帖/回复时间中较晚的）                                           |
| `topicReplyRatio` | `number`         | 发帖与回复量比率 = totalTopics / totalReplies<br>高 = 偏向发起话题；低 = 偏向参与讨论 |
| `totalTopics`     | `number`         | 总发帖数                                                                              |
| `totalReplies`    | `number`         | 总回复数                                                                              |
| `isTopicsHidden`  | `boolean`        | 是否隐藏主题列表（用户主动隐藏）                                                      |
| `dailyRanking`    | `number \| null` | 今日活跃度排名，null = 未显示                                                         |

---

## 2. SinglePeriodStats - 单个活跃期统计

> 活跃期定义：两个暂停期（>60天无活动）之间的连续活动时间段

### 基本信息

| 字段        | 类型     | 说明                                       |
| ----------- | -------- | ------------------------------------------ |
| `timeRange` | `string` | 时间范围，格式：`2015-04-01 to 2017-08-15` |

### 帖子统计

| 字段                    | 类型                     | 说明                                                   |
| ----------------------- | ------------------------ | ------------------------------------------------------ |
| `topicCount`            | `number`                 | 本活跃期内帖子数量                                     |
| `avgTopicReplyCount`    | `number`                 | 平均回复数 - 衡量内容影响力                            |
| `avgTopicClickCount`    | `number`                 | 平均点击数 - 衡量话题吸引力                            |
| `avgTopicLifecycleDays` | `number`                 | 平均帖子生命周期（天）= Avg(lastReplyTime - createdAt) |
| `topicInteractionRatio` | `number`                 | 回复/点击转化率 = Sum(replyCount) / Sum(clickCount)    |
| `topicHourDistribution` | `Record<number, number>` | 帖子发布时间分布 (0-23 小时)                           |
| `topicNodeDistribution` | `Record<string, number>` | 帖子发布节点前三，按数量降序                           |

### 回复统计

| 字段                       | 类型                             | 说明                                                                                 |
| -------------------------- | -------------------------------- | ------------------------------------------------------------------------------------ |
| `replyCount`               | `number`                         | 本活跃期内回复数量                                                                   |
| `avgReplyLength`           | `number`                         | 平均回复长度（字符数）                                                               |
| `directReplyRatio`         | `number`                         | 直接回复率 = 直接回复主帖数 / 总回复数<br>高 = 主动发起讨论；低 = 倾向于跟帖互动     |
| `avgRepliedTopicHeat`      | `number`                         | 参与话题的平均热度 = Avg(topicReplyCount)<br>高 = 追热点；低 = 关注小众话题          |
| `replyWeekdayDistribution` | `Record<string, number> \| null` | 回复星期分布（百分比），如 `{ "周一": 0.20 }`<br>通过相对时间计算，无法计算则为 null |
| `replyNodeDistribution`    | `Record<string, number>`         | 回复节点分布（前 3 个），按数量降序                                                  |

---

## 3. PeriodsSummary - 活跃期统计汇总

> 一次性发送，让 AI 看到全局概览

| 字段           | 类型                  | 说明                                              |
| -------------- | --------------------- | ------------------------------------------------- |
| `totalPeriods` | `number`              | 总活跃期数                                        |
| `periods`      | `SinglePeriodStats[]` | 各活跃期的统计数据，索引 = 活跃期序号 (从 0 开始) |

---

## 4. ContentTopic - 帖子内容

> 发送给 AI 用于风格分析

| 字段       | 类型     | 说明                                  |
| ---------- | -------- | ------------------------------------- |
| `title`    | `string` | 主题标题 - 用于分析关注话题和表达风格 |
| `nodeName` | `string` | 节点名称 - 用于分析专业领域和兴趣分布 |
| `content`  | `string` | 主题内容 - 用于分析写作风格和思维深度 |

---

## 5. ContentReply - 回复内容

> 发送给 AI 用于风格分析

| 字段         | 类型     | 说明                                        |
| ------------ | -------- | ------------------------------------------- |
| `topicTitle` | `string` | 回复所在的主题标题 - 用于分析关注的话题类型 |
| `nodeName`   | `string` | 节点名称 - 用于分析活跃领域                 |
| `content`    | `string` | 回复内容 - 用于分析表达风格和情感倾向       |

---

## 6. PeriodContent - 活跃期内容

> 当内容量小于阈值时使用

| 字段          | 类型             | 说明                                                    |
| ------------- | ---------------- | ------------------------------------------------------- |
| `periodIndex` | `number`         | 活跃期序号 - 对应 `PeriodsSummary.periods[periodIndex]` |
| `topics`      | `ContentTopic[]` | 帖子列表                                                |
| `replies`     | `ContentReply[]` | 回复列表                                                |

---

## 7. PeriodContentChunk - 活跃期内容分片

> 当单个活跃期内容过多时（帖子>20 或 回复>100），分片发送  
> **关键规则**：同一 chunk 只能包含同一活跃期的内容

| 字段                  | 类型             | 说明                 |
| --------------------- | ---------------- | -------------------- |
| `periodIndex`         | `number`         | 活跃期序号           |
| `chunkIndex`          | `number`         | 分片序号 (从 0 开始) |
| `totalChunksInPeriod` | `number`         | 本活跃期总分片数     |
| `topics`              | `ContentTopic[]` | 帖子列表             |
| `replies`             | `ContentReply[]` | 回复列表             |

---

## 8. AnalyzerOutput - 最终输出结构

| 字段       | 类型                                      | 说明                                    |
| ---------- | ----------------------------------------- | --------------------------------------- |
| `summary`  | `PeriodsSummary`                          | 所有活跃期的统计汇总（一次性发送）      |
| `contents` | `(PeriodContent \| PeriodContentChunk)[]` | 各活跃期的内容，按 periodIndex 顺序发送 |

---

## AI 关联说明

AI 如何关联活跃期与内容：

1. AI 首先收到 `PeriodsSummary`，了解共有 N 个活跃期及其统计数据
2. AI 逐个收到 `PeriodContent` / `PeriodContentChunk`
3. 每个内容都有 `periodIndex` 字段，明确标识属于哪个活跃期
4. AI 可以通过 `periodIndex` 将内容与 `summary.periods[periodIndex]` 对应

### 示例发送序列

```
→ UserOverview { joinDate, lastActiveTime, ... }
→ PeriodsSummary { totalPeriods: 3, periods: [stats0, stats1, stats2] }
→ PeriodContent { periodIndex: 0, topics: [...], replies: [...] }
→ PeriodContentChunk { periodIndex: 1, chunkIndex: 0, totalChunksInPeriod: 2, ... }
→ PeriodContentChunk { periodIndex: 1, chunkIndex: 1, totalChunksInPeriod: 2, ... }
→ PeriodContent { periodIndex: 2, topics: [...], replies: [...] }
```

AI 可以清晰地知道：

- 活跃期 0 (stats0)：1 个完整内容包
- 活跃期 1 (stats1)：2 个分片，需要合并理解
- 活跃期 2 (stats2)：1 个完整内容包
