# 数据生命周期

## 文件边界

每个用户的数据位于 `~/.v2er-insight/data/<username>/`：

| 文件                  | 用途                                           | 自动清理 |
| --------------------- | ---------------------------------------------- | -------- |
| `raw.json`            | 规范化抓取快照                                 | 可选     |
| `analyzed.json`       | 发送给 AI 的完整 AnalyzerOutput V2             | 可选     |
| `result.json`         | 当前 AI 分析结果                               | 永久保留 |
| `results/`            | 不可变结果版本和有序版本 metadata              | 永久保留 |
| `analysis-state.json` | 数据指纹、当前结果版本、pending 和 provider 态 | 永久保留 |

`data.keepRaw=true` 是默认配置，对应源数据永久保留。`v2er config reset data` 恢复该配置。

有效的 `analysis-state.json` 产生两类结果状态提示：`DATA_RESULT_STALE` 表示结果落后于当前数据，`DATA_SNAPSHOT_PARTIAL` 表示结果基于不完整抓取。每个成功结果关联不可变 version ID；旧版 `result.json` 保持可展示，缺少 sidecar 时 provenance 状态未知。

## 自动清理

`data.keepRaw=false` 启用自动清理。AI 分析成功后，修改时间超过 `data.rawRetention` 的 `raw.json` 和 `analyzed.json` 进入删除范围。

```bash
v2er config set data.keepRaw false
v2er config set data.rawRetention 7
```

配置启用或调整清理策略时显示 `DATA_RETENTION_ENABLED`。实际删除文件时显示 `DATA_FILES_CLEANED`，并列出保留期、删除文件和恢复命令。stderr 承载 notice 摘要、影响、恢复步骤和文档路径；stdout 保留主要结果。

## 对重发与外部会话的影响

- 已有完整数据历史的外部会话独立保留其上下文。
- `--resend` 的数据来源：可读取且 provenance 匹配的 `analyzed.json`。
- 分析上下文重建的数据来源：`analyzed.json`。
- `raw.json` 与 `analyzed.json` 提供完整 AnalyzerOutput 的重建数据；`result.json`、`results/` 与 `analysis-state.json` 保存当前结果、不可变版本和投递状态。

源数据清理后的重建命令：

```bash
v2er <username> --force
```

## 查看状态

```bash
v2er config show data
```

命令输出当前 data 配置和派生的自动清理状态。未启用状态显示“自动清理: 未启用”；启用状态显示 `DATA_RETENTION_ENABLED` 及当前保留天数。
