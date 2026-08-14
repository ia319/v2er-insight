# AI 分析结果数据结构规范

本文档定义 AI analysis 返回并持久化的 `AIAnalysisResult` 结构。`result.json`、结果版本和 `show` 命令均使用这一数据结构。

## 设计哲学

AI 分析结果分为七个维度，全面刻画用户画像：

1. **summary**：自然语言总结，一段话概括用户特征。
2. **professional**：专业画像 — 技术栈、职业方向、成长轨迹。
3. **personal**：个人画像 — 兴趣爱好、人生阶段、价值观。
4. **psychological**：心理画像 — 基于 OCEAN 大五人格模型量化评分。
5. **behavioral**：行为画像 — 社区角色、互动风格、活跃模式。
6. **social**：社交画像 — 内容吸引力、讨论深度。
7. **risk**：风险评估 — 账号异常检测（水军/买卖）。

> [!IMPORTANT]
> **校验策略**：根对象和所有嵌套对象要求完整、精确的字段集合。JSON 语法、缺失字段、多余字段、类型、枚举或数值范围不符合结构约束时，analysis 失败且不生成默认画像。

---

## 1. summary - 用户画像总结

| 字段      | 类型     | 说明                           |
| :-------- | :------- | :----------------------------- |
| `summary` | `string` | 一段自然语言的用户画像概括描述 |

---

## 2. professional - 专业画像

基于用户帖子的节点分布、内容深度和时间跨度推断。

| 字段              | 类型       | 说明             |
| :---------------- | :--------- | :--------------- |
| `tech_stack`      | `string[]` | 推断的技术栈列表 |
| `career_path`     | `string`   | 职业方向推断     |
| `level`           | `string`   | 技术水平推断     |
| `focus_coherence` | `string`   | 技术关注一致性   |
| `evolution`       | `object`   | 技术演变轨迹     |

### evolution 子结构

| 字段       | 类型                       | 说明                 |
| :--------- | :------------------------- | :------------------- |
| `summary`  | `string`                   | 总体趋势描述         |
| `timeline` | `EvolutionTimelineEntry[]` | 按时间排列的演变记录 |

#### EvolutionTimelineEntry

| 字段     | 类型     | 说明                   |
| :------- | :------- | :--------------------- |
| `period` | `string` | 时间段，如 "2019-2020" |
| `focus`  | `string` | 该时段的主要关注点     |

---

## 3. personal - 个人生活画像

基于非技术类帖子和回复内容推断。

| 字段         | 类型       | 说明         |
| :----------- | :--------- | :----------- |
| `hobbies`    | `string[]` | 兴趣爱好     |
| `life_stage` | `string`   | 人生阶段推断 |
| `values`     | `string[]` | 价值观关键词 |

---

## 4. psychological - 心理画像

基于大五人格模型 (OCEAN) 进行推断。

> [!IMPORTANT]
> **分数范围**：所有分数必须是 0 到 100 之间的有限数字。超出范围的值使整个结果校验失败。

### scores

| 字段                | 类型     | 说明                | 范围  |
| :------------------ | :------- | :------------------ | :---- |
| `openness`          | `number` | 开放性 — 兴趣广度   | 0-100 |
| `conscientiousness` | `number` | 尽责性 — 条理严谨度 | 0-100 |
| `extraversion`      | `number` | 外向性 — 社交活跃度 | 0-100 |
| `agreeableness`     | `number` | 宜人性 — 友善温和度 | 0-100 |
| `neuroticism`       | `number` | 神经质 — 情绪波动度 | 0-100 |

### keywords

| 字段       | 类型       | 说明           |
| :--------- | :--------- | :------------- |
| `keywords` | `string[]` | 性格关键词标签 |

---

## 5. behavioral - 行为画像

基于用户的发帖/回复模式推断。

| 字段                | 类型     | 说明       |
| :------------------ | :------- | :--------- |
| `role`              | `string` | 社区角色   |
| `interaction_style` | `string` | 互动风格   |
| `active_pattern`    | `string` | 活跃模式   |
| `heat_sensitivity`  | `string` | 热点敏感度 |

---

## 6. social - 社交画像

基于用户内容的吸引力和讨论参与深度推断。

| 字段               | 类型     | 说明           |
| :----------------- | :------- | :------------- |
| `content_appeal`   | `string` | 内容吸引力特征 |
| `discussion_depth` | `string` | 讨论参与深度   |

---

## 7. risk - 风险评估

基于活动周期的中断模式和前后内容风格差异推断。

| 字段     | 类型                                    | 说明     |
| :------- | :-------------------------------------- | :------- |
| `level`  | `'safe' \| 'suspicious' \| 'high_risk'` | 风险等级 |
| `reason` | `string`                                | 判断理由 |

---

## 结构化输出与持久化校验

Gemini 和 Codex 的 analysis turn 使用同一份封闭 JSON Schema。每个对象的所有字段均为必填字段，并禁止额外字段。

Provider 最终消息还需通过 `parseAIAnalysisResult()` 和 `isAIAnalysisResult()` 的运行时校验。校验包含：

- 最终消息是单个有效 JSON 值。
- 根对象及每个嵌套对象只包含数据结构中定义的字段。
- 字符串数组的每个元素均为字符串。
- OCEAN 分数为 0 到 100 之间的有限数字。
- `risk.level` 属于 `safe`、`suspicious` 或 `high_risk`。

任一条件不满足时，AI 步骤返回无效输出错误。该次响应不写入 `result.json`、结果版本或 provider 会话历史。
