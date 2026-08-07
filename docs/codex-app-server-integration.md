# Codex App Server 接入规范

## 1. 接入范围

Codex provider 通过用户本机 Codex CLI 的 `app-server` 创建、恢复和驱动 thread。自动发现优先使用 ChatGPT/Codex App 自带的 CLI，显式配置支持兼容的独立 Codex CLI。账户会话和 thread 数据沿用所选 CLI 解析到的 Codex home，调用过程不需要 OpenAI API Key。

v2er 为每次命令启动独立的短生命周期 App Server 子进程，通过 UTF-8 JSONL stdio 交换 JSON-RPC 消息。桌面 App 自有 App Server 保持独立运行。

JSONL 协议边界从 `unknown` 解码响应、通知和带 ID 的服务端请求。客户端请求使用数字 ID；服务端反向请求接受数字或字符串 ID。协议错误保留字段路径或服务端 code、消息和 data。

Thread 与 turn 投影包含恢复所需的身份、cwd、模型、状态、错误和 agent message。`turn/completed` 决定最终回合状态；服务端反向请求统一返回 method-not-found。

## 2. 运行前提与 Project 可见性

运行前提与可见性关系：

- 账户前提：解析后的 `CODEX_HOME` 包含有效的 ChatGPT/Codex 登录状态。
- 默认 Project：storage 模块的 `getDataRootDir()`，与 raw、analyzed、result 和 session 共享数据根目录；当前结构为 `<配置目录>/data`，通常显示为 `~/.v2er-insight/data/`。
- App Project：同一路径的 App UI 归组状态，独立于 thread 创建和恢复。

`--codex-project <path>` 提供单次显式覆盖，`ai.codex.projectPath` 提供持久显式覆盖。新 generation 的解析优先级为：

```text
--codex-project → ai.codex.projectPath → storage getDataRootDir()
```

Project 路径结果包含规范化绝对路径、来源及可用、缺失、非目录或不可访问状态。该绝对路径作为 thread `cwd` 和 App Project 归组键。已有 thread 使用本地 session 保存的路径；路径变化对应新的 generation。

App UI Project 的注册及其注册状态检测位于程序范围之外。`v2er session check --provider codex` 在 Project 路径可用时显示 App 注册提示。App UI 根据已注册路径与 thread `cwd` 归组任务。

thread ID 是恢复和发送依据。配置文件归属上级配置目录，位于默认 Project 树外。

## 3. Codex CLI 发现与授权

Windows 自动发现优先使用运行中的原生 `codex.exe`，其次使用 ChatGPT App 包内的 `resources/codex.exe`。自动候选的启动资格由原生文件类型、有效 OpenAI Authenticode 签名和发布者决定；运行时选择依次验证 CLI 版本、App Server 初始化、账户状态、模型和 reasoning effort。Thread 方法在创建、恢复和发送阶段按实际响应校验。

Windows 发现通过只读进程路径查询取得正在运行的 `codex.exe`；ChatGPT 进程路径用于解析同一 App 包内的 `resources/codex.exe`。进程和签名查询固定使用 Windows 系统目录下的绝对 PowerShell 路径。查询失败时对应候选或签名证据为空。显式路径存在时候选集仅包含该路径；自动候选按运行中的 `codex.exe`、App 包和 PATH 排序，并按 Windows 大小写规则去重。

候选观察与启动授权分离。显式 `ai.codex.executable` 表示用户对该路径的执行授权；自动原生候选的启动授权来自有效 OpenAI Authenticode 签名；PATH 候选仅保留诊断信息，其启动授权来自显式配置。自动候选的版本探测与进程启动资格以有效且发布者匹配的签名为条件。

`ai.codex.executable` 支持 App 内置 CLI 和普通独立 Codex CLI。显式候选仍经过兼容性验证。普通 CLI 与桌面 App 解析到同一 `CODEX_HOME` 时复用登录状态和 thread 历史；不同 Codex home 形成独立账户与历史边界。

自动候选失败后保留分类诊断并继续后续候选；显式 executable 失败后停止选择。CLI 版本探测、App Server 协议、账户和模型选择共同决定候选可用性。

原生 CLI 通过 `shell: false` 直接启动。Windows `.cmd` 启动器只构造 `--version` 与 `app-server --listen stdio://` 两组固定参数，并使用 verbatim argument 传给系统命令处理器。命令处理器路径从绝对 `SystemRoot\System32\cmd.exe` 解析并通过文件检查；继承环境中的 `ComSpec` 不参与解析。shim 路径中的命令展开字符和不可用的系统命令处理器在启动前返回错误。

## 4. 进程边界与关闭

桌面 App 的现有 App Server 使用 App 私有 stdio 与父进程通信。v2er 启动自己的 App Server 子进程，不附加该私有 stdio。

该子进程使用真实用户 `CODEX_HOME` 中已有的 ChatGPT/Codex 登录状态，并访问 `auth.json` 或系统凭据存储。账户检查固定使用 `account/read(refreshToken: false)`；实际模型请求由 Codex 处理 Token 自动刷新，登录缓存可能随之更新。v2er 使用的账户 RPC 范围为 `account/read`，主进程保留账户类型和鉴权可用状态。凭据存储方式与刷新行为遵循 [Codex Authentication](https://learn.chatgpt.com/docs/auth)。

版本探测与 App Server 的受限环境来源为 v2er-insight 父进程。保留范围为用户、系统与临时目录，`CODEX_HOME`、`CODEX_SQLITE_HOME`，区域设置，代理和证书路径；显式 Windows `.cmd` shim 额外保留 PATH 与 PATHEXT。API Key、access token、`NODE_OPTIONS`、`ComSpec` 和其他业务变量位于继承范围之外。

根配置项 `proxy` 在 App Server 启动时覆盖 HTTP 与 HTTPS 代理变量；POSIX 环境同时设置对应的小写别名。`ALL_PROXY`、`NO_PROXY` 和证书路径保留继承值。版本探测仅使用继承环境。桌面 App 进程环境不参与子进程配置。代理值可能包含代理凭据。

一次发送批次采用以下生命周期：

```text
发现并验证 Codex CLI 候选
  → 启动 app-server --listen stdio://
  → initialize / initialized
  → account/read(refreshToken=false)
  → model/list
  → ephemeral thread/start
  → mcpServerStatus/list
  → thread/start 或 thread/resume（按名称关闭 MCP）
  → mcpServerStatus/list（MCP 工具数量为零）
  → turn/start 并等待最终状态
  → 关闭 stdin
  → 等待子进程退出
```

同一个新 thread 的提示轮和首轮分析共用一次 App Server 进程。后续命令重新启动子进程，并按 thread ID 恢复。

`thread/start` 创建持久 session，参数包含实际模型、Project cwd、`serviceName: v2er-insight`、`ephemeral: false` 和第 9 节定义的权限边界。请求不包含 base instructions 或 developer instructions。App Server 返回的 `instructionSources` 保存于本地 session 元数据，v2er 不修改对应指令来源。`thread/resume` 复用相同身份与权限边界；随后通过 `thread/read(includeTurns: true)` 返回的 turn 身份、状态和 agent message 核验恢复状态。

每个 turn 携带实际模型、reasoning effort、Project cwd 和相同权限边界。分析轮额外包含 delivery ID 与结果 Schema。外部 turn ID 在 App Server 接受请求后进入本地恢复状态。

自有 App Server 的关闭流程包含 stdin 结束和 `shutdownGrace` 期限内的正常退出等待。等待超时的终止范围限于本次命令创建的子进程。桌面 App 进程及其 App Server 位于该清理范围之外。

关闭调用具有幂等语义，返回有界 stderr、退出状态和强制终止标记。

## 5. Project 与 thread 映射

每个 V2EX 用户在 Codex provider 中拥有独立活动 thread：

- 第一代显示名：`<username>-insight`。
- 后续 generation：`<username>-insight-2`、`<username>-insight-3`。
- 恢复键：App Server 返回的 thread ID。
- Project 归组键：通过统一优先级解析并规范化的绝对路径，由 `thread/start.cwd` 传入。

新 generation 的编号取会话索引中的最大 generation 值加一。生成的显示名与本地 session 记录冲突时继续递增，保持 generation 和显示名唯一。

日常分析更新复用活动 thread。提示词版本变化、实际模型与活动 session 不一致或用户显式新建请求产生新的 generation；思考深度变化作用于下一轮。

Session 选择顺序为显式新建、最高 generation 的兼容 pending session、兼容的活动 ready session。兼容条件包含提示词哈希、模型和 Project 路径。共享 Project 路径等价规则在 Windows 上不区分大小写，在其他平台区分大小写。恢复契约包含 `thread/resume` 返回的 thread ID、模型、session cwd、thread cwd，以及 `thread/read` 返回的 thread ID 和 cwd。

未完成 session 的恢复与结算先于结果复用判断。每次状态推进最多启动一个外部 turn；活动回合返回 busy，已完成回合按持久 ID 恢复结果。

Codex 执行边界覆盖本地 registry、Project、runtime、账户、模型和回合恢复。自有 App Server 在成功、跳过、busy 和异常路径均进入关闭流程。不可变结果版本、当前 `result.json`、结果索引和 pending 版本关联持久化后，session 才进入完成状态；随后 provider 文件关联 version ID、分析指纹和成功时间，session index 发布最近成功 provider，最后更新 provider 发送态。

用户在 App 中修改显示名后，v2er 继续按 thread ID 恢复，不覆盖用户名称。

## 6. 消息顺序

### 新 thread 初始化

新 thread 使用两个相互独立的 turn：

1. 普通提示轮：分析提示词的普通 user message，以及该 turn 的完成状态。
2. 分析轮：单条完整 `AnalyzerOutput` JSON，以及 `AIAnalysisResult` 画像结果 Schema。

分析轮使用核心 AI 模块提供的闭合 `AIAnalysisResult` Schema，字段契约详见 [AI 结果 Schema](ai-result/result-schema.md)。

提示词通过普通 user message 发送，不写入 App 设置、Project 配置、`AGENTS.md` 或 `developerInstructions`。提示轮产生的 AI 回复保留在 Codex thread 历史中，只承担回合完成确认，不进入画像结果解析或本地画像文件。

提示词文本统一使用 LF 换行。Session 中的 `promptHash` 是该实际发送文本的 UTF-8 SHA-256 小写十六进制摘要。

首轮分析成功后，thread 进入可恢复状态。后续分析复用相同的分析轮契约。

### 初始化恢复

本地状态记录以下初始化阶段：

- `promptPending`：thread 已创建，提示轮尚未确认完成。
- `analysisPending`：提示轮已完成，首轮完整 JSON 尚未成功。
- `ready`：首轮分析成功，thread 可用于后续分析更新。

恢复依据为持久 thread ID、turn ID、Project 路径和消息顺序。活动 turn 返回 busy；已完成回合推进本地阶段或恢复原画像结果。缺失或无法关联的回合返回 `AI_CODEX_TURN_STATUS_UNKNOWN`，乱序或本地状态不一致返回 `AI_CODEX_STATE_INVALID`；两类结果均阻断自动发送。

## 7. 模型与思考深度

每次 App Server 连接通过 `model/list` 取得当前可见模型、默认模型及其 reasoning effort 范围。模型目录随 App 版本、账户和服务端配置变化，具体 model 与 effort 在运行时校验。

Codex 配置包含两个动态默认选择器：

```text
ai.codex.model = app-default
ai.codex.reasoningEffort = model-default
```

`app-default` 解析为实时目录中的唯一默认模型，`model-default` 解析为该模型声明的默认 effort。兼容 session 复用创建时保存的实际 model；每次运行根据当前模型目录解析 effort。新 generation 重新解析动态 model 默认值。显式 model 与目录中的 `model` 字段精确匹配，显式 effort 的有效范围来自所选模型。

Codex 生命周期包含启动与普通请求期限、turn 期限和关闭宽限，对应默认值与持久覆盖字段见 [README Codex 配置表](../README.md)。

Provider 与 CLI 选项的兼容性在 Provider 启动前校验。Codex model 与 effort 在账户检查后的实时模型目录中校验；目录无有效默认值、model 匹配结果不唯一或 effort 不受支持时返回分类错误。

## 8. 回复与回合状态

v2er 启动的 turn 具有实时状态和持久 ID。Turn 状态包括：

- `inProgress`：生成中。
- `completed`：回合完成。
- `failed`：回合失败，`turn.error` 提供错误信息。
- `interrupted`：回合中断。

提示轮以最终 turn 状态作为确认条件。分析轮校验 `completed` 状态与最终 agent message，随后执行结果 Schema 解析。最终消息优先取最后一个非空 `phase: final_answer`，缺少该 phase 时取最后一个非空 phase-null 消息。`commentary` 消息属于过程输出。

分析结果解析只接受原始 JSON 和完整闭合的 `AIAnalysisResult`。JSON 语法、必填字段、字段值或额外字段无效时，旧画像保持不变，不生成默认画像。

外部 turn ID 已持久化时，后续命令在连接中断或等待超时后按 thread ID 和 turn ID 恢复。尚未关联外部 turn ID 的 pending delivery 在后续发送中复用原 delivery ID。状态或回复完整性无法确认时返回 `AI_CODEX_TURN_STATUS_UNKNOWN`。

桌面 App 中由用户直接启动的 turn 运行在 App 自有连接上，v2er 仅在恢复时读取其持久状态。Codex 分支的正常结果为 skipped、busy 或 result；解析结果携带 delivery ID、local session ID、thread ID 和 thread name。结果版本及其 pending 关联先于 session 完成状态持久化，session 转移失败保留该版本用于同一 delivery 的恢复。

## 9. 权限与工具边界

Codex provider 使用以下运行边界：

- `sandbox: read-only`。
- `approvalPolicy: never`。
- `web_search: disabled`。
- 稳定 feature 中的执行、浏览器、App、plugin、hook、协作、skill 安装和工具发现能力关闭。
- 默认 `cwd` 为 storage `getDataRootDir()`；显式覆盖使用规范化绝对路径。
- 每个 analysis turn 显式复用同一权限和 `cwd`。

默认 Project 包含各用户的本地数据，`read-only` sandbox 允许 Codex 读取该目录内文件。`read-only` 约束写入权限，不构成文件读取白名单；`cwd` 只承担工作目录和 App 归组职责。显式 Project 路径的内容责任归属于路径所有者。

`networkAccess: false` 约束 sandbox 内本地工具的网络访问。模型传输和 App Server 管理的集成使用各自的 runtime 网络边界。

临时 ephemeral thread 使用相同模型、Project 和基础权限配置，模型 turn 数量为零。`mcpServerStatus/list(detail: toolsAndAuthOnly)` 提供所选 Codex home 解析后的服务名与工具名。持久 thread config 按动态服务名写入 `mcp_servers.<name>.enabled: false`。

持久 thread 创建或恢复后再次读取 MCP 清单。MCP 工具数量为零时进入提示轮或分析轮；非空清单和无法验证的响应归入协议错误。清单读取最多包含 100 页，重复游标归入协议错误。

画像分析使用独立 App Server 的标准 thread/turn 方法。App Server 发给客户端的反向请求统一返回 method-not-found；App Server 内部执行的模型工具不经过该客户端反向请求通道。工具审批请求映射为明确失败，命令保持可终止状态。

### 提示词注入安全边界

- 不可信输入范围：`AnalyzerOutput` 中的帖子和回复；消息类型为分析轮普通 user message。
- 发送前执行隔离：thread 权限配置与持久 thread 零 MCP 工具校验。
- 运行期监听：App Server `turn`（一次用户输入触发的处理过程）事件监听先于 `turn` 创建；`runTurn()` 订阅 `item/started` 后调用 `turn/start`。`item/started` 表示 `turn` 内容或动作开始。
- 允许事件类型：user message、agent message、plan、reasoning 和 context compaction。
- 中断条件：工具调用、其他非分析动作或未知动作开始。
- 中断流程：程序通过 `turn/interrupt` 请求 Codex 停止当前 `turn`；`runTurn()` 抛出 `CodexUnexpectedTurnActionError`。
- 数据路径：工具调用、其他非分析动作或未知动作触发中断时，当前 AI 步骤在 `parseAIAnalysisResult()` 和任何结果持久化之前失败，已有结果文件保持原状。Session 完成失败不属于该边界；已保存版本及其 pending 关联是后续命令的恢复依据。
- 事件时序：`item/started` 通知与对应动作并发；运行期监听位于通知接收之后。

## 10. 并发和幂等

同一用户的 AI 分析由跨进程锁串行化。Codex 的锁范围覆盖 runtime 与 turn、结果版本写入、pending 版本关联、session 完成、provider 发送态更新及数据清理；Gemini 使用同一锁保护共享 session index、结果关联和历史发布。锁记录保留 owner 诊断信息，释放具有 token 身份校验；异常退出后的遗留锁保持 busy 状态。锁文件继续使用 `.codex-execution.lock` 路径。

桌面 App 已有活动回合时返回 busy 状态，并保留用户当前回合。

每次分析数据投递具有本地唯一 delivery ID。外部 turn ID 存在时，pending delivery 保留该关联并在后续命令中核验；无法关联持久 turn 时返回 `AI_CODEX_TURN_STATUS_UNKNOWN`。

不同用户可以并行运行。相同用户的 Gemini 与 Codex 分析串行执行；Codex 命令使用独立 App Server 子进程。同一把锁覆盖待完成 delivery 的恢复与阻断判断。

## 11. 本地状态

`sessions/index.json` 保存 provider 活动指针、会话摘要和迁移标记。`sessions/codex/<localSessionId>.json` 保存恢复所需的 session 身份、Project、模型、提示词哈希、初始化阶段、turn ID、pending delivery identity、可执行文件路径与版本、App Server instruction sources、时间戳和最近结果关联。local session ID 使用规范 UUID；local session ID、thread ID、generation 和显示名保持唯一，活动 ID 只引用 ready session。

旧安装的 `codex-sessions.json` 仅作为只读迁移来源。Gemini 与 Codex 分析在 provider 访问前初始化共享会话存储；初始化在该用户的执行锁内校验旧注册表，把各 Codex session 文件写入后再发布索引。相同内容的既有 session 文件支持中断后继续。新旧存储同时存在时，索引必须包含与旧注册表内容哈希一致的迁移标记，否则返回 `SESSION_MIGRATION_CONFLICT`，不发送模型消息。迁移写入失败返回 `SESSION_MIGRATION_FAILED`。迁移完成后只写 `sessions/`，不修改或删除旧文件。

Pending delivery identity 在外部请求前持久化，App Server 接受后关联 turn ID。解析完成后，同一 delivery ID 进入 `analysis-state.json`；结果版本保存后，pending state 与 `currentResult` 同时关联该 version ID。Codex turn 完成后，provider 文件和会话索引关联该结果版本；随后 provider 发送态更新且 pending state 清除。时间戳采用 UTC ISO 格式，`promptHash`、`analysisFingerprint` 和 `payloadHash` 采用 SHA-256 小写十六进制。

完整 `AnalyzerOutput` 保存于 v2er 的 `analyzed.json`，发送后同时存在于 Codex thread 历史。解析后的画像结果保存于 `results/versions/vNNNNNN.json` 不可变 envelope、`results/index.json` 和当前 `result.json`；版本 metadata 保存 model、reasoning effort、local session ID、thread ID、thread name 和分析来源哈希。原始 thread 回复归属于 Codex home。凭据由 Codex home 或系统凭据存储管理。

会话索引和 provider 文件读取结果分为 missing、invalid 和 valid；索引摘要必须与对应 provider 文件一致。Invalid 文件保持原内容；有效更新先写 provider 文件，再发布索引。每个文件使用 UTF-8 无 BOM、同目录临时文件和原子替换。目标文件的创建模式为 `0o600`；Windows 的实际访问范围由现有 ACL 决定。新旧会话存储均采用永久保留策略。

## 12. 诊断与恢复

`v2er session check [username] --provider codex` 汇总以下信息：

- App 发现状态和全部 CLI 候选的路径、来源、启动类型、信任依据与版本探测结果。
- Runtime 选择结果、候选拒绝原因、CLI 版本和 App Server user agent。
- 当前账户可用状态和账户类型。
- 当前可见模型、默认模型、各模型默认 effort 与支持列表。
- 最终 Project 路径、路径来源、目录状态和 App Project 注册提示。
- 指定用户的执行锁 owner 摘要、`sessions/` 与旧 `codex-sessions.json` 状态、迁移状态、可用 session 投影、活动 session、thread 可读性、初始化阶段和最后 turn 状态。

诊断访问范围为账户类型与鉴权可用状态、CLI 与模型元数据、Project、新旧会话存储、thread、turn 和 lock owner 摘要。会话检查不写入索引、provider 文件或旧注册表；迁移 pending 和 conflict 均保持原文件。指定用户时，`thread/read(includeTurns: true)` 的解码结果包含 agent message 文本，诊断报告仅保留状态和身份元数据。凭据存储访问仍由独立 App Server 承担。

`v2er session check --provider gemini` 展示解析后的 Gemini 模型、思考等级和 API Key 可用状态，API Key 内容保持隐藏。

恢复行为按状态区分：

| 状态                   | 恢复条件或结果                                              |
| ---------------------- | ----------------------------------------------------------- |
| App 或兼容 CLI 不可用  | App runtime 可用，或 `ai.codex.executable` 指向兼容 CLI     |
| 账户不可用             | 解析后的 `CODEX_HOME` 包含有效登录状态                      |
| 模型或 effort 不可用   | 配置值属于当前 `model/list` 目录                            |
| Thread busy            | 当前 App 回合结束                                           |
| Thread 丢失            | 显式新 generation                                           |
| Turn 状态未知          | App thread 状态核对与显式重发决策                           |
| 最终回复缺失或结果无效 | 旧画像和 delivery 状态保持不变                              |
| Session 迁移冲突       | 保留新旧存储并通过只读诊断核对迁移标记与 session 身份       |
| Session 迁移失败       | 修复目录权限或空间后，再次执行同一 AI 命令                  |
| Session 完成失败       | 再次执行同一 Codex 命令，恢复已保存版本、原 turn 和结果关联 |

CLI 原因码覆盖可执行文件缺失或不兼容、账户不可用、协议错误、模型或 effort 不可用、Project 不可用、thread 身份丢失、turn 失败或状态未知、输出无效、超时、本地状态无效、执行占用、锁失败、session 迁移和 session 完成失败。恢复动作由原因码集中映射，Codex 已分类故障使用 Codex session 检查、App 状态核对、配置修正或显式新 generation。

## 13. 兼容性验证范围

自动化测试覆盖协议边界、runtime 选择、Project 映射、模型默认值、thread 恢复、状态持久化和进程关闭。测试通过注入的进程与连接边界运行，默认 CI 不访问真实 Codex 账户或本机 App Server runtime。
