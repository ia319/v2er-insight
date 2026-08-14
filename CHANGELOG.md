# 更新日志

本文件记录 V2ER Insight 面向用户的重要变化。版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [2.0.0] - 2026-08-15

### 重大变更

- 默认 AI provider 从 Gemini 改为 Codex。Codex 通过本机已登录的 Codex App Server 运行；继续使用 Gemini 时，执行 `v2er config set ai.provider gemini`。
- 抓取数据和分析数据升级为 Raw Snapshot V2 与 AnalyzerOutput V2，并要求完整的来源信息。1.x 生成的 `raw.json` 和 `analyzed.json` 不能用于新的分析流程；升级后请执行 `v2er <username> --force` 重新抓取并分析目标用户。

### 升级说明

1. 安装 2.0.0 后，确认要使用的 AI provider。Codex 使用本机 Codex 登录状态；Gemini 用户需要显式选择 Gemini，并保留原有 API key 配置。
2. 对需要重新分析的既有目标执行 `v2er <username> --force`，生成带来源信息的新数据。
3. 结构仍有效的旧 `result.json` 可以继续查看，并会以只读的虚拟版本 `v000001` 出现在结果查询中。完成一次新的 AI 分析后，程序开始保存正式的不可变结果历史。

### 新增

- 新增 Codex provider，支持选择模型、推理强度、Codex 项目和新建 thread，无需在项目中保存 OpenAI API key。
- 新增持久化 AI 会话。Gemini 保存本地对话历史，Codex 保存远端 thread 标识，并提供 `chat`、`session check` 和 `session clear` 命令。
- 每次成功的 AI 分析都会保存不可变结果版本、生成参数和输入摘要。`show` 支持简要报告、JSON、历史列表和指定版本查询。
- 结果报告增加数据覆盖情况、账号概况和活跃周期等确定性事实，帮助用户结合 AI 分析判断结果。
- 新增快照质量、来源校验和变化检测。输入未变化时可以跳过重复分析，也可以使用 `--resend` 强制重新发送。

### 变更

- AI 分析改为发送一条完整、紧凑的 AnalyzerOutput JSON 消息，并只保存通过完整结构校验的结果。
- `data.keepRaw` 默认值改为 `true`，保留抓取数据以支持来源核验和后续重新分析。显式设为 `false` 时继续按保留期限清理。
- AI 配置按 `ai.codex` 和 `ai.gemini` 分组；原有 Gemini 配置仍可读取。
- 项目许可证改为 MIT License。

### 修复

- 结果、版本索引和会话索引采用事务式写入与恢复，降低进程中断后出现文件关系不一致的风险。
- 串行化同一目标的分析、聊天和会话清理操作，并只在确认持锁进程已经退出后回收遗留锁。
- Gemini 无法确认上下文容量时停止发送请求，避免使用固定容量假设继续执行。
- AI 返回缺失字段、无效 JSON 或不匹配结构时停止持久化，避免无效结果覆盖已有结果。
- `show` 在读取期间校验文件快照和索引关系，避免组合来自不同状态的数据。

### 安全

- Windows 自动发现只启动通过 OpenAI 签名和发布者校验的原生 Codex CLI；显式配置的 CLI 使用独立的路径和版本校验。
- Codex 分析 thread 使用只读文件系统、关闭网络和工具能力；检测到意外操作时中断执行，不保存该次结果。
- 诊断信息避免记录凭据和完整模型正文。

[2.0.0]: https://github.com/ia319/v2er-insight/compare/v1.2.0...v2.0.0
