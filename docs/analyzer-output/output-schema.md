# AI 输入数据结构规范

本文档定义了发送给 AI 进行分析的数据结构。它是 Analyzer 模块与 AI 助手之间通信的唯一事实来源。

根对象使用 `schemaVersion: 2`，并包含 `dataQuality`：

| 字段                     | 类型             | 说明                                       |
| ------------------------ | ---------------- | ------------------------------------------ |
| `dataQuality.capturedAt` | `string`         | 本次抓取统一使用的 ISO 时间。              |
| `topics/replies.status`  | `SnapshotStatus` | `complete`、`partial` 或 `not_requested`。 |
| `totalExpected`          | `number \| null` | 期望总数；无法可靠确定时为 null。          |
| `fetchedCount`           | `number`         | 已抓取并进入分析的数据条数。               |
| `failedCount`            | `number`         | 已知缺失、无效或与声明总数不一致的条数。   |

`partial` 和 `not_requested` 表示缺失记录状态未知。

## 设计哲学

数据分为三个层次，旨在为 AI 提供全局背景和细致的语义信息：

1.  **UserOverview**：全局用户信息和表现指标。
2.  **PeriodsSummary**：所有检测到的活跃期统计摘要及全局基准。
3.  **Content (Chunks)**：按同一活跃期分段的实际内容（帖子/回复），用于深度分析。

> [!IMPORTANT]
> **切片边界**：单个内容切片（Chunk）对应一个活跃期，内容按时间顺序排列。

## 数据层次

数据结构顺序：

1.  **UserOverview** → 建立身份和全局画像。
2.  **PeriodsSummary** → 提供所有活动的路线图和统计概览。
3.  **PeriodContent/Chunk** → 为特定活跃期提供语义细节（帖子/回复）。

---

## 1. UserOverview - 用户总览

目标用户的基本画像和整体活动水平。

| 字段              | 类型             | 说明             | 分析意义                                  |
| :---------------- | :--------------- | :--------------- | :---------------------------------------- |
| `joinDate`        | `string`         | 账号创建日期     | 确定用户的“资历”和长期行为基准。          |
| `lastActiveTime`  | `string`         | 最后活跃时间     | 衡量用户近期的存留状态。                  |
| `topicReplyRatio` | `number \| null` | 发帖与回复比率   | 主题隐藏、范围未请求或没有回复时为 null。 |
| `totalTopics`     | `number \| null` | 累计发帖总数     | 主题隐藏或未请求帖子时为 null。           |
| `totalReplies`    | `number \| null` | 累计回复总数     | 未请求回复时为 null。                     |
| `isTopicsHidden`  | `boolean`        | 是否隐藏主题列表 | 隐私倾向标识。true 对应帖子维度数据受限。 |
| `dailyRanking`    | `number \| null` | 今日活跃度排名   | 衡量该用户在该社区中的当前热度位置。      |

---

## 2. SinglePeriodStats - 单个活跃期统计指标

“活跃期”定义为连续的活动块，由至少 60 天的不活动期分隔。

### 帖子统计 (Topic Stats)

| 字段                    | 类型                     | 说明                 | 分析意义                                           |
| :---------------------- | :----------------------- | :------------------- | :------------------------------------------------- |
| `topicCount`            | `number`                 | 该周期内帖子总数     | 该阶段的创作产出频率。                             |
| `avgTopicReplyCount`    | `number`                 | 平均每篇帖子的回复数 | **衡量内容影响力**：引起社区讨论的能力。           |
| `avgTopicClickCount`    | `number`                 | 平均每篇帖子的点击数 | **衡量话题吸引力**：标题党程度或话题的大众化程度。 |
| `avgTopicLifecycleDays` | `number`                 | 平均帖子活跃时长     | **衡量帖子生命周期**：话题的持久讨论度。           |
| `topicInteractionRatio` | `number`                 | 回复/点击转化率      | **参与深度**：用户发起的话题是否能引发深层互动。   |
| `topicHourDistribution` | `Record<number, number>` | 24 小时发布分布      | 识别用户的作息规律和活跃时段。                     |
| `topicNodeDistribution` | `Record<string, number>` | 前 3 个发布节点      | 定义用户在该阶段的**专业领域和兴趣分布**。         |

### 回复统计 (Reply Stats)

| 字段                       | 类型                             | 说明               | 分析意义                                                           |
| :------------------------- | :------------------------------- | :----------------- | :----------------------------------------------------------------- |
| `replyCount`               | `number`                         | 该周期内总回复数   | 该阶段的社交互动活跃水平。                                         |
| `avgReplyLength`           | `number`                         | 平均回复字符长度   | 衡量表达的认真程度与交流深度。                                     |
| `directReplyRatio`         | `number`                         | 直接回复主帖的比率 | **高**：更关注主旨，倾向开启新讨论；**低**：倾向于跟帖与他人互动。 |
| `avgRepliedTopicHeat`      | `number`                         | 参与话题的平均热度 | **高**：追逐热点话题；**低**：更关注分众/小众领域。                |
| `replyWeekdayDistribution` | `Record<string, number> \| null` | 7 天百分比分布     | 识别周内活动规律（如：工作日活跃还是周末活跃）。                   |
| `replyNodeDistribution`    | `Record<string, number>`         | 前 3 个回复节点    | 定义用户在该阶段的**活跃领域和社交边界**。                         |

---

## 3. PeriodsSummary - 活跃期汇总

所有活跃期的统计数据及纵向变化依据。

| 字段           | 类型                  | 说明                                               |
| :------------- | :-------------------- | :------------------------------------------------- |
| `totalPeriods` | `number`              | 检测到的总活跃期数量。                             |
| `periods`      | `SinglePeriodStats[]` | 统计数据数组，按 `periodIndex` 索引（从 0 开始）。 |

---

## 4. 语义内容模型 (Semantic Data Models)

这些模型包含实际的文本内容，用于 AI 的深度语义分析。

### ContentTopic - 帖子内容

| 字段       | 类型     | 分析用途                                         |
| :--------- | :------- | :----------------------------------------------- |
| `title`    | `string` | 分析关注的话题焦点和表达风格。                   |
| `nodeName` | `string` | 识别特定领域（Node）下的专业度。                 |
| `content`  | `string` | 核心文本，用于分析写作风格、逻辑表达和思维深度。 |

### ContentReply - 回复内容

| 字段         | 类型     | 分析用途                                               |
| :----------- | :------- | :----------------------------------------------------- |
| `topicTitle` | `string` | 提供背景：该用户被什么样的话题所吸引而产生回帖冲动。   |
| `nodeName`   | `string` | 识别社交互动发生的领域。                               |
| `content`    | `string` | 识别表达风格（简短、尖锐、理性、情绪化等）和情感倾向。 |

---

## 5. 活跃期内容与分片 (Period Content & Chunking)

### PeriodContent (完整版)

当整个活跃期的数据可以直接放入一个传输单元时使用。

| 字段          | 类型             | 说明                                                             |
| :------------ | :--------------- | :--------------------------------------------------------------- |
| `periodIndex` | `number`         | 唯一索引，允许 AI 将内容关联回 `PeriodsSummary.periods[index]`。 |
| `topics`      | `ContentTopic[]` | 帖子文本集合。                                                   |
| `replies`     | `ContentReply[]` | 回复文本集合。                                                   |

### PeriodContentChunk (分片版)

内容超过阈值时采用分片结构，所有分片保存在同一 `AnalyzerOutput.contents` 中。

| 字段                  | 类型             | 说明                                           |
| :-------------------- | :--------------- | :--------------------------------------------- |
| `periodIndex`         | `number`         | 关联所属活跃期。                               |
| `chunkIndex`          | `number`         | 序列索引。                                     |
| `totalChunksInPeriod` | `number`         | 该活跃期预期的总分片数，辅助 AI 构建整体认知。 |
| `topics`              | `ContentTopic[]` | 细分的帖子列表。                               |
| `replies`             | `ContentReply[]` | 细分的回复列表。                               |

---

## 结构示例与关联关系

```text
UserOverview { ... }
PeriodsSummary { totalPeriods: 10, ... }
PeriodContent { periodIndex: 2, ... } // 对应 PeriodsSummary.periods[2]
```

`periodIndex` 建立 `Content` 与 `SinglePeriodStats` 的对应关系；统计指标与内容语义共同构成该活跃期的分析依据。
