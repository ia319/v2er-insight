# 数据生命周期

## 文件边界

每个用户的数据位于 `~/.v2er-insight/data/<username>/`：

| 文件                  | 用途                                 | 自动清理 |
| --------------------- | ------------------------------------ | -------- |
| `raw.json`            | 规范化抓取快照                       | 可选     |
| `analyzed.json`       | 发送给 AI 的完整 AnalyzerOutput V2   | 可选     |
| `result.json`         | 当前 AI 分析结果                     | 不清理   |
| `analysis-state.json` | 数据指纹、结果状态和 provider 发送态 | 不清理   |

默认配置 `data.keepRaw=true`，因此源数据不会自动删除。执行 `v2er config reset data` 也会恢复该默认值。

展示结果时，有效的 `analysis-state.json` 会产生两类状态提示：`DATA_RESULT_STALE` 表示结果落后于当前数据，`DATA_SNAPSHOT_PARTIAL` 表示结果基于不完整抓取。缺少 sidecar 的旧 `result.json` 仍可展示，程序不会猜测其 provenance。

## 自动清理

显式设置 `data.keepRaw=false` 后，AI 分析成功时会检查 `raw.json` 和 `analyzed.json`。文件修改时间超过 `data.rawRetention` 天才会删除。

```bash
v2er config set data.keepRaw false
v2er config set data.rawRetention 7
```

配置启用或调整清理策略时会显示 `DATA_RETENTION_ENABLED`。真实删除文件时会显示 `DATA_FILES_CLEANED`，并列出保留期、删除文件和恢复命令。notice 的摘要、影响、恢复步骤和文档路径写入 stderr，不会混入主要结果输出。

## 对重发与外部会话的影响

- 已持有完整数据历史的外部会话不依赖本地源文件，可以继续使用其已有上下文。
- `--resend` 需要可读取且 provenance 匹配的 `analyzed.json`。
- 重新建立分析上下文也需要 `analyzed.json`。
- `result.json` 和 `analysis-state.json` 保留不等于源数据仍可重建；它们不能替代已删除的完整 AnalyzerOutput。

源数据被清理后，使用以下命令重新抓取、分析并建立一致的 provenance：

```bash
v2er <username> --force
```

## 查看状态

```bash
v2er config show data
```

命令会显示当前 data 配置和派生的自动清理状态。清理未启用时显示“自动清理: 未启用”；启用时显示 `DATA_RETENTION_ENABLED` 及当前保留天数。
