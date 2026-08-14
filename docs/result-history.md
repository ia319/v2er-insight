# 结果历史与展示

## 文件关系

每个用户的画像结果位于 `~/.v2er-insight/data/<username>/`：

```text
result.json
results/
├── index.json
└── versions/
    ├── v000001.json
    └── v000002.json
```

- `result.json` 保存当前的裸 `AIAnalysisResult`。
- `results/index.json` 保存版本顺序、生成信息和 `latestVersionId`。`latestVersionId` 标识结果目录中的最新版本。
- `results/versions/vNNNNNN.json` 保存不可变结果版本。生成的版本包含 `metadata`、裸 `AIAnalysisResult`、版本绑定的输入摘要和对应哈希。

输入摘要来自该版本实际分析的 `AnalyzerOutput`，保留用户名、Analyzer 语义配置、抓取质量、用户总览和活跃期统计。摘要不包含帖子或回复正文。

## 查看结果

```bash
v2er show <username>
v2er show <username> --brief
v2er show <username> --json
v2er show <username> --history
v2er show <username> --history --json
v2er show <username> --version v000002
v2er show <username> --version v000002 --brief
v2er show <username> --version v000002 --json
```

| 模式                     | 输出                                 |
| ------------------------ | ------------------------------------ |
| 无选项                   | `result.json` 对应的完整报告         |
| `--brief`                | 当前结果的简略报告                   |
| `--json`                 | 当前的裸 `AIAnalysisResult` JSON     |
| `--history`              | 按新到旧排列的版本摘要表             |
| `--history --json`       | 版本摘要 JSON 数组                   |
| `--version <id>`         | 指定结果版本的完整报告               |
| `--version <id> --brief` | 指定结果版本的简略报告               |
| `--version <id> --json`  | 指定版本的裸 `AIAnalysisResult` JSON |

`--json --brief`、`--history --brief` 和 `--history --version` 是无效组合。

## 报告内容

完整报告包含：

- 版本 ID、生成时间、保存时间、来源、provider、模型、reasoning 等级、会话、数据质量和结果文件关系状态。
- 用户名、注册时间、抓取时间、最后活跃时间、当日排名、帖子数、回复数、帖回比和主题可见性。
- 帖子与回复的抓取状态、预期数量、实际数量和失败数量。
- 活跃期总数、分段阈值、每期时间范围、帖子数、回复数和主要节点。
- AI 画像总结、职业、个人、OCEAN 推断分数、行为、社交和风险结果。

简略报告保留版本信息、关键账号事实、画像摘要、职业方向、技术水平、人生阶段、风险等级和风险理由。

`--history` 表格使用“最新”标记 `results/index.json` 的 `latestVersionId`。`--history --json` 中的 `isLatest` 表示同一关系，`inputSummaryAvailable` 表示对应版本是否保存输入摘要。

`--history --json` 的每个元素使用以下结构：

```ts
interface ResultVersionSummary {
  versionId: string;
  sequence: number;
  origin: 'analysis' | 'resend' | 'legacy' | 'untracked-current';
  createdAt: string | null;
  savedAt: string | null;
  provider: 'gemini' | 'codex' | 'unknown';
  model: string | null;
  reasoningLevel: string | null;
  sessionName: string | null;
  dataQuality: 'complete' | 'partial' | 'unknown';
  warningCount: number | null;
  inputSummaryAvailable: boolean;
  isLatest: boolean;
  virtual: boolean;
}
```

## 完整性与只读边界

默认查询校验 `result.json` 的结构，并在可验证时核对结果哈希、版本 `metadata`、输入摘要哈希和 `analysis-state.json` 中的当前结果关联。

`--history` 查询校验 `results/index.json`、所有已索引版本文件和版本 `metadata`。指定版本查询校验 `results/index.json` 和目标版本文件。未进入 `results/index.json` 的版本文件不会出现在 `--history` 输出中，也不能通过 `--version` 读取。

查询在完整文件快照发生变化时重试一次。第二次仍发生变化时返回 `RESULT_VERSION_BUSY`，不输出可能混合两次写入的结果。

`show` 命令不获取写锁，也不修复、覆盖、删除或重新索引文件。`--history` 和普通指定版本查询不读取 `analysis-state.json`、`raw.json`、`analyzed.json` 或 provider 会话文件。

## 状态提示

- `RESULT_LEGACY_CURRENT`：有效 `result.json` 没有 `results/index.json` 和版本文件。查询提供只读虚拟 `v000001`，来源和生成信息保持未知。
- `RESULT_CURRENT_NOT_LATEST`：`result.json` 匹配一个已索引版本，但该版本不是 `latestVersionId`。
- `RESULT_CURRENT_UNTRACKED`：`result.json` 不匹配任何已索引版本。
- `RESULT_ARCHIVE_UNAVAILABLE`：默认查询无法完成 `results/index.json` 与版本文件的关联校验。有效 `result.json` 仍可显示，来源信息和输入摘要保持未知。
- `RESULT_PROVENANCE_UNAVAILABLE`：当前结果与 `analysis-state.json` 的动态关联无法验证。过期和不完整状态不会从未关联的数据推断。
- `DATA_RESULT_STALE`：已验证的当前结果落后于最新分析数据。
- `DATA_SNAPSHOT_PARTIAL`：所选结果基于不完整抓取。
- `RESULT_RESPONSE_NORMALIZED`：所选结果的 `metadata` 记录了保存前的响应警告数量。结果文件不保存对应警告文本。
- `RESULT_INPUT_SUMMARY_UNAVAILABLE`：所选结果没有版本绑定的账号与活跃事实。报告不使用其他时间的源数据补齐。

提示、warning、error 和恢复建议写入 `stderr`。报告、表格和 JSON 写入 `stdout`。

## 恢复操作

| 状态                     | 操作                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------- |
| 缺少 `result.json`       | 执行 `v2er show <username> --history`；已知最新版本时使用 `--version` 查看            |
| 缺少所有结果             | 执行 `v2er ai <username>`                                                             |
| `result.json` 结构无效   | 保留原文件用于检查，然后执行 `v2er ai <username>`                                     |
| 版本不存在               | 执行 `v2er show <username> --history`                                                 |
| `RESULT_VERSION_BUSY`    | 等待同一用户的结果写入完成后重试                                                      |
| `RESULT_VERSION_CORRUPT` | 保留 `result.json` 和 `results/`，检查文件权限、`results/index.json` 与版本文件的关联 |

不要手工删除、重命名或改写 `results/index.json` 和 `results/versions/` 中的文件。
