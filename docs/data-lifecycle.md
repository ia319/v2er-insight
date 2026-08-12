# 数据生命周期

## 文件边界

每个用户的数据位于 `~/.v2er-insight/data/<username>/`：

| 文件                  | 用途                                           | 清理策略       |
| --------------------- | ---------------------------------------------- | -------------- |
| `raw.json`            | 规范化抓取快照                                 | 可选自动清理   |
| `analyzed.json`       | 发送给 AI 的完整 AnalyzerOutput V2             | 可选自动清理   |
| `result.json`         | 当前 AI 分析结果                               | 永久保留       |
| `results/`            | 不可变结果版本和有序版本 metadata              | 永久保留       |
| `analysis-state.json` | 数据指纹、当前结果版本、pending 和 provider 态 | 永久保留       |
| `sessions/`           | AI 会话索引和 provider 会话状态                | 确认后手动清理 |
| `codex-sessions.json` | 旧版 Codex 会话的只读迁移来源                  | 永久保留       |

`data.keepRaw=true` 是默认配置，对应源数据永久保留。`v2er config reset data` 恢复该配置。

有效的 `analysis-state.json` 产生两类结果状态提示：`DATA_RESULT_STALE` 表示结果落后于当前数据，`DATA_SNAPSHOT_PARTIAL` 表示结果基于不完整抓取。每个成功结果关联不可变 version ID；旧版 `result.json` 保持可展示，缺少 sidecar 时 provenance 状态未知。

## 自动清理

`data.keepRaw=false` 启用自动清理。AI 分析成功后，修改时间超过 `data.rawRetention` 的 `raw.json` 和 `analyzed.json` 进入删除范围。

```bash
v2er config set data.keepRaw false
v2er config set data.rawRetention 7
```

配置启用或调整清理策略时显示 `DATA_RETENTION_ENABLED`。实际删除文件时显示 `DATA_FILES_CLEANED`，并列出保留期、删除文件和恢复命令。stderr 承载 notice 摘要、影响、恢复步骤和文档路径；stdout 保留主要结果。

## 对重发与 AI 会话的影响

- 已有完整数据历史的外部会话独立保留其上下文。
- Codex 会话写入 `sessions/`；旧版 `codex-sessions.json` 迁移后保持只读且不自动删除。
- Gemini 会话在 `sessions/gemini/` 保存完整成功历史，包括 AnalyzerOutput 和模型结果。
- `data.keepRaw=false` 和 `data.rawRetention` 不清除 Gemini 历史中的副本。
- `--resend` 的新分析输入：从可读取且 provenance 匹配的 `analyzed.json` 重建。
- Gemini 会话上下文：从 `sessions/gemini/` 保存的完整成功历史恢复。
- `raw.json` 与 `analyzed.json` 提供完整 AnalyzerOutput 的重建数据；`result.json`、`results/` 与 `analysis-state.json` 保存当前结果、不可变版本和投递状态。

## 手动清理 AI 会话

`v2er session clear <username>` 清理经过选择和确认的 AI 会话。默认范围是最近一次成功生成画像的 provider 的活动会话；`--provider gemini|codex|all` 选择 provider，`--all-versions` 选择对应 provider 的全部会话代次。

清理按以下顺序执行：

1. 展示 provider、会话代次、本地会话 ID、Codex thread ID 和本地文件路径。
2. 接受交互终端输入的完整 `yes`。
3. 获取目标会话锁并重新核对清理范围。
4. 执行 provider 删除并持久化剩余会话索引。

- Gemini：删除所选本地会话历史。
- Codex：先永久删除远端 thread，再删除对应的本地会话文件和索引映射。Codex CLI 不支持 `thread/delete` 或远端删除失败时，对应本地会话保持不变。

会话清理的保留范围包括 `raw.json`、`analyzed.json`、`result.json`、`analysis-state.json` 和 `results/`。删除会话后，不可变画像版本继续由现有展示流程读取；普通聊天需要新的活动会话。缺少 `analyzed.json` 时，清理预览显示 `SESSION_SOURCE_DATA_MISSING`，并提供 `v2er <username> --force` 重建命令。

Provider 会话的存储与恢复规则见 [AI 会话](ai-conversations.md)。

源数据清理后的重建命令：

```bash
v2er <username> --force
```

## 查看状态

```bash
v2er config show data
```

命令输出当前 data 配置和派生的自动清理状态。未启用状态显示“自动清理: 未启用”；启用状态显示 `DATA_RETENTION_ENABLED` 及当前保留天数。
