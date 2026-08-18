<h1 align="center">V2ER Insight</h1>

<p align="center">
  V2EX 用户画像分析工具，通过公开数据抓取、统计分析和 AI 建模生成多维度报告。
</p>

## 核心流程 (Pipe Flow)

本项目采用管道化设计，目前通过以下步骤逐步生成深度报告：
**Fetch** (抓取) → **Analyze** (统计) → **AI** (建模) → **Show** (展示)

## 负责任使用

- 遵守 V2EX 的服务规则和访问限制，合理控制抓取频率。
- 仅处理公开可访问的数据，妥善保护本地保存的用户内容、AI 会话和分析结果。
- 将报告作为辅助观察，结合数据覆盖提示核对 AI 推断，避免把心理画像当作已验证事实。
- 不要使用本工具骚扰、跟踪或歧视他人，也不要将报告直接用于就业、信贷等影响个人权益的自动化决策。

## 快速开始

按顺序完成以下步骤：

1. 安装 CLI 包

```bash
npm install -g v2er-insight
# 或
pnpm add -g v2er-insight
```

2. AI provider

Codex 是默认 provider，使用本机 ChatGPT/Codex App 的登录会话：

```bash
v2er session check --provider codex
```

切换到 Gemini 时，选择 provider 并配置 API Key：

```bash
v2er config set ai.provider gemini
v2er config set ai.gemini.apiKey <your_gemini_api_key>
```

Codex 使用所选 CLI 对应的 `CODEX_HOME` 登录状态和 thread 历史。Windows 自动发现只启动通过 OpenAI 签名校验的 App CLI；使用其他兼容 CLI 时，配置 `ai.codex.executable`。

Codex thread 使用只读 sandbox，并关闭 Web、shell、apps、plugins 和 MCP 工具。默认 Project 为 `~/.v2er-insight/data`。完整的账户、进程环境和工具隔离边界见 [Codex App Server 接入规范](docs/codex-app-server-integration.md)。

3. 代理（可选）

```bash
v2er config proxy http://127.0.0.1:7890
```

4. 一键分析

```bash
v2er <username>
```

## CLI 命令

### 一键分析（推荐）

从零到报告，一条命令完成全流程：

```bash
v2er <username>
```

| 选项                          | 说明                                     |
| ----------------------------- | ---------------------------------------- |
| `--force`                     | 强制重新抓取（忽略本地缓存）             |
| `--provider <provider>`       | 本次使用 `gemini` 或 `codex`             |
| `--model [name]`              | 指定当前 provider 的模型                 |
| `--thinking-level [level]`    | Gemini 思考等级                          |
| `--reasoning-effort <effort>` | Codex 思考深度；可用值由当前模型目录决定 |
| `--new-thread`                | 为所选 provider 创建新一代会话           |
| `--codex-project <path>`      | 指定新 Codex thread 的 Project 路径      |
| `--resend`                    | 强制重新发送完整分析数据                 |
| `-v, --verbose`               | 显示调试输出                             |

一键命令根据本地 `raw.json`、`analyzed.json` 和 `result.json` 选择执行起点。`analysis-state.json` 提供 analyze 与 AI 步骤的 provenance 校验状态。`--force` 从抓取步骤重新执行。

---

以下命令可以分别执行各阶段：

### 1. 数据抓取 (Fetch)

抓取指定用户的个人资料、帖子内容及所有回复。

```bash
v2er fetch <username> [选项]
```

| 选项        | 说明                                  |
| ----------- | ------------------------------------- |
| `--topics`  | 仅抓取话题                            |
| `--replies` | 仅抓取回复                            |
| `--force`   | 强制重新抓取（忽略本地 `.json` 缓存） |

### 2. 统计分析 (Analyze)

对抓取的原始数据进行加工，计算活跃周期、发帖频率、节点分布等指标。

- 分析结果文档定义：[docs/analyzer-output/output-schema.md](docs/analyzer-output/output-schema.md)

```bash
v2er analyze <username>
```

### 3. AI 画像建模 (AI)

支持 **Google Gemini** 和本机 **ChatGPT/Codex App**。AI provider 基于统计结果进行多维度心理、行为及社交建模，生成分析报告。

- 核心提示词所在位置：[docs/prompt.md](docs/prompt.md)
- 分析维度详细说明：[docs/ai-result/result-schema.md](docs/ai-result/result-schema.md)

```bash
v2er ai <username> [选项]
```

| 选项                          | 说明                                |
| ----------------------------- | ----------------------------------- |
| `--provider <provider>`       | 本次使用 `gemini` 或 `codex`        |
| `--model [name]`              | 指定当前 provider 的模型            |
| `--thinking-level [level]`    | 指定 Gemini 思考等级                |
| `--reasoning-effort <effort>` | 指定 Codex 思考深度                 |
| `--new-thread`                | 为所选 provider 创建新一代会话      |
| `--codex-project <path>`      | 指定新 Codex thread 的 Project 路径 |
| `--resend`                    | 强制重新发送完整分析数据            |

AI 命令包含来源验证、相同分析结果复用和不完整抓取警告。每次成功分析保存当前 `result.json` 和一个不可变结果版本。结果版本文件同时保存该次输入中的账号、抓取覆盖和活跃期摘要；命令结果的 `meta.resultVersionId` 标识对应版本。

AI 会话行为：

- 成功分析更新所选 provider 的活动 session。
- Codex 按 thread ID 恢复远端历史。
- Gemini 从永久保留的本地历史重建 SDK Chat。
- `--new-thread` 为所选 provider 创建新一代会话。

存储、恢复和 Gemini 上下文成本见 [AI 会话](docs/ai-conversations.md)。

默认 provider 为 `codex`。

Gemini 默认值：

| 配置项                    | 默认值                   | 含义                                       |
| ------------------------- | ------------------------ | ------------------------------------------ |
| `ai.gemini.apiKey`        | 未设置                   | 配置、兼容字段与环境变量解析顺序见详细说明 |
| `ai.gemini.model`         | `gemini-3.1-pro-preview` | Gemini 模型名称                            |
| `ai.gemini.thinkingLevel` | `high`                   | Gemini 思考等级                            |
| `ai.gemini.timeout`       | `60_000` 毫秒            | 单次请求期限                               |
| `ai.maxRetries`           | `3`                      | 请求重试次数                               |
| `ai.baseDelay`            | `1_000` 毫秒             | 重试基础延迟                               |
| `ai.maxDelay`             | `10_000` 毫秒            | 重试延迟上限                               |

Codex 默认值：

| 配置项                     | 默认值                 | 含义                                     |
| -------------------------- | ---------------------- | ---------------------------------------- |
| `ai.codex.executable`      | 自动发现可信 App CLI   | 普通 CLI 的显式路径；空值启用签名发现    |
| `ai.codex.projectPath`     | `~/.v2er-insight/data` | 新 thread 的 Project 目录                |
| `ai.codex.model`           | `app-default`          | App Server 实时目录中的唯一默认模型      |
| `ai.codex.reasoningEffort` | `model-default`        | 所选模型声明的默认 reasoning effort      |
| `ai.codex.startupTimeout`  | `10_000` 毫秒          | CLI 探测、App Server 启动和普通 RPC 期限 |
| `ai.codex.turnTimeout`     | `600_000` 毫秒         | 单个 turn 的完成期限                     |
| `ai.codex.shutdownGrace`   | `2_000` 毫秒           | 独立 App Server 子进程的关闭宽限         |

将 `~/.v2er-insight/data` 注册为 Codex App 本地 Project 后，v2er 创建的任务显示在对应项目树中。Project 注册状态不影响 thread 创建。

### 4. 持续聊天 (Chat)

向已有的 AI 分析会话发送普通消息：

```bash
v2er chat <username> <message...>
v2er chat <username> --provider gemini <message...>
v2er chat <username> --provider codex <message...>
```

未指定 `--provider` 时，命令使用最近一次成功生成画像的 provider。显式 provider 只选择本次消息使用的活动会话，后续默认选择保持不变。消息以 `-` 开头时，在消息前加入 `--` 结束选项解析。

命令把本轮模型回复写入 `stdout`，把诊断和上下文警告写入 `stderr`。普通聊天完成后，`result.json`、结果版本和最近成功画像的 provider 保持不变。

目标 provider 必须存在活动会话。需要建立或重置聊天基线时，执行：

```bash
v2er ai <username> --provider <provider> --new-thread
```

### 5. 报告展示 (Show)

读取当前结果或一个已保存的不可变版本。完整报告展示结果来源、生成模型、抓取覆盖、账号与活跃期事实，以及 AI 返回的全部画像维度。

```bash
v2er show <username>
v2er show <username> --brief
v2er show <username> --json
v2er show <username> --history
v2er show <username> --history --json
v2er show <username> --version v000002
```

| 选项             | 说明                                           |
| ---------------- | ---------------------------------------------- |
| `--brief`        | 输出所选结果的摘要、关键账号事实和风险理由     |
| `--json`         | 输出当前或指定版本的裸 `AIAnalysisResult` JSON |
| `--history`      | 按新到旧列出经过完整性校验的结果版本           |
| `--version <id>` | 展示指定的 `vNNNNNN` 版本                      |
| `-v, --verbose`  | 显示诊断输出                                   |

`--history --json` 输出版本摘要数组。`--json --brief`、`--history --brief` 和 `--history --version` 是无效组合。报告、表格和 JSON 写入 `stdout`；数据质量、结果文件状态和恢复建议写入 `stderr`。

`show` 命令以只读方式访问结果与来源状态。默认模式校验 `result.json`，并在存在可关联版本时核对 `results/index.json`、对应结果版本文件和 `analysis-state.json` 中的当前结果关联；`--history` 和 `--version` 使用各版本自带的生成信息和输入摘要。查询不修改结果、会话或源数据文件。详细文件关系、完整性规则和恢复命令见 [结果历史与展示](docs/result-history.md)。

### 6. 配置管理 (Config)

- **group**: 配置分组名，可选 `ai`、`fetch`、`analyzer`、`data`、`log`、`proxy`
- **path**: 点分路径，如 `ai.gemini.model`、`log.level`、`data.keepRaw`
- **value**: 配置值，自动进行类型转换（字符串/数字/布尔）和枚举校验

```bash
# 查看
v2er config show                            # 查看全部配置（apiKey 自动掩码）
v2er config show ai                         # 查看 ai 分组

# 设置
v2er config set ai.gemini.model gemini-3.1-pro-preview # 切换 Gemini 模型
v2er config set ai.gemini.thinkingLevel medium         # 设置 Gemini 思考等级
v2er config set log.level debug             # 开启调试日志
v2er config set data.keepRaw true           # 保留原始数据
v2er config set ai.gemini.timeout 120000    # Gemini 请求超时 120s
v2er config set ai.maxRetries 5             # AI 最大重试次数
v2er config set ai.baseDelay 2000           # AI 重试基础延迟 2s
v2er config set ai.maxDelay 20000           # AI 重试最大延迟 20s
v2er config set fetch.maxRetries 5           # 抓取最大重试次数
v2er config set fetch.baseDelay 2000         # 抓取重试基础延迟 2s
v2er config set fetch.maxDelay 30000         # 抓取重试最大延迟 30s

# 重置
v2er config reset                           # 重置全部为默认值
v2er config reset ai                        # 仅重置 ai 分组

# 代理快捷方式
v2er config proxy http://127.0.0.1:7890     # 设置代理
v2er config proxy                           # 查看代理
v2er config proxy --clear                   # 清除代理
```

Provider 配置示例：

```bash
v2er config set ai.provider gemini
v2er config set ai.gemini.apiKey <key>
v2er config set ai.gemini.model gemini-3.1-pro-preview
v2er config set ai.gemini.thinkingLevel high

v2er config set ai.provider codex
v2er config set ai.codex.model app-default
v2er config set ai.codex.reasoningEffort model-default
v2er config set ai.codex.projectPath <path>
```

默认配置 `data.keepRaw=true`：永久保留 `raw.json` 和 `analyzed.json`。`data.keepRaw=false`：按 `data.rawRetention` 自动清理。`v2er config reset data` 恢复默认保留。清理对重发和外部会话的影响见 [数据生命周期](docs/data-lifecycle.md)。

### 7. AI 会话管理

#### 检查会话

```bash
v2er session check [username] --provider gemini
v2er session check [username] --provider codex
```

会话检查是只读操作。指定用户后，命令展示活动会话代次、模型、历史或 thread 身份，以及最近结果版本关联。

- Gemini：展示思考等级和 API Key 可用状态。
- Codex：通过初始化、`account/read(refreshToken: false)`、`model/list` 和可选的 `thread/read` 检查运行环境。输出包括 CLI 候选及其信任依据、账户状态、模型目录、Project 路径、执行锁、本地会话和 thread 状态。

Codex App Server 使用所选 `CODEX_HOME` 中的凭据存储。模型请求可能刷新该登录缓存。

#### 永久清理

```bash
v2er session clear <username>
v2er session clear <username> --provider all
v2er session clear <username> --provider codex --all-versions
```

默认范围是最近一次成功生成画像的 provider 的活动会话。`--provider all` 选择两个 provider 的活动会话，`--all-versions` 选择对应 provider 的全部会话代次。

命令先在 `stderr` 展示精确目标和保留项。交互终端中输入完整的 `yes` 后，命令锁定目标并重新核对清理范围。

- Gemini：删除所选本地会话文件并更新共享索引。
- Codex：先调用 App Server 的 `thread/delete`，再删除对应的本地会话文件和索引映射。远端删除失败或所选 CLI 不支持该方法时，对应本地会话保持不变。

清理范围不包含 `raw.json`、`analyzed.json`、`result.json`、`analysis-state.json` 和 `results/` 中的不可变结果版本。

---

## 详细配置说明

配置文件位于 `~/.v2er-insight/config.json`，可通过 `v2er config set` 或手动编辑。

### 1. Gemini API Key 解析顺序

AI 模块通过以下优先级依次尝试读取 Gemini API Key：

- `~/.v2er-insight/config.json` 中的 `ai.gemini.apiKey` 字段
- 兼容字段 `ai.apiKey`
- 环境变量 `GOOGLE_API_KEY`
- 环境变量 `GEMINI_API_KEY`

### 2. 代理读取逻辑 (Proxy)

Fetcher 与 Gemini 按以下优先级解析代理：

1. 配置文件 (`~/.v2er-insight/config.json`) 中的 `proxy` 字段
2. 系统环境变量 `HTTPS_PROXY`
3. 系统环境变量 `HTTP_PROXY`

Codex App Server 继承 v2er-insight 进程白名单中的 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 和 `NO_PROXY`。配置文件中的 `proxy` 同时覆盖子进程的 HTTP 与 HTTPS 代理；未配置时保留继承值。版本探测仅使用继承环境。

缺少有效代理配置和环境变量时使用直接连接。

### 3. 参数优先级与默认值来源

配置解析关系：显式参数 > `~/.v2er-insight/config.json` > [src/config/defaults.ts](src/config/defaults.ts)（特例：`proxy` / `apiKey` 还会读取环境变量）。

### 4. 技术实现细节

- 日志系统：采用级别过滤（Error/Warn/Info/Debug），支持带进度的章节式输出。
- 网络代理：
  - **Fetcher**（V2EX 数据抓取）：`https-proxy-agent` + Axios `httpsAgent`
  - **AI / Gemini**：`undici` `ProxyAgent` + `setGlobalDispatcher`（原生 `fetch()` 代理）
  - **AI / Codex**：App Server 子进程的受限代理环境
- **AI / Codex**：发现兼容 Codex CLI，自动候选优先来自本机 App，独立短生命周期 App Server 使用已登录的 Codex home 创建或恢复 thread。
- 数据本地化：数据存储于 `~/.v2er-insight/data/{username}/` 下；`results/versions/` 保存不可变结果版本和版本输入摘要，`results/index.json` 保存版本顺序和 metadata，`sessions/` 保存活动 provider 和会话状态。
- 环境要求：Node.js >= 20.18.1（undici 7.x 要求）。

---

## 开发

### 安装与构建

```bash
pnpm install
pnpm run build
```

### 开发模式（直接运行源码）

```bash
npx ts-node -r tsconfig-paths/register src/cli/index.ts <command> <username>
```

### 质量检查

```bash
pnpm run check:types    # TypeScript 类型检查
pnpm run lint           # ESLint 代码规范
pnpm run test           # Vitest 单元测试（单次）
pnpm run dev            # Vitest 监听模式
pnpm run ci             # 完整 CI（类型 + lint + 格式 + 测试）
```

---

## 安全与隐私

- 文件权限：在 Linux/Mac 系统上，程序创建的配置文件权限为 `0600`（仅当前用户读写）。
- 隐私保护：建议避免在配置文件中直接存储包含明文凭据的代理 URL。
- Windows 用户建议：手动检查 `~/.v2er-insight/config.json` 的访问控制列表 (ACL)，确保其安全性。
- Codex 本地执行边界：持久 thread 的 sandbox 为 read-only；Web、shell、apps、plugins 和 MCP 工具为关闭状态。
- Codex 提示词注入安全边界：
  - 不可信输入：`AnalyzerOutput` 中的帖子和回复，以及 `chat` 命令的用户消息。
  - 发送前隔离：持久 thread 的 MCP 工具数量为零。
  - 运行期监听：在 `turn/start` 前订阅 Codex 事件。
  - 中断条件：工具调用、其他执行型动作或未知动作开始。
  - 中断结果：通过 `turn/interrupt` 请求中断。分析 turn 在画像解析和结果持久化前结束；普通聊天保持画像结果不变。
- Codex session 完成失败：持久化数据包含结果版本、`result.json`、结果索引和 pending 版本关联。状态一致时，后续同一 Codex 命令复用已保存版本并完成原 turn。
- Codex Project：默认目录包含各用户的 raw、analyzed、result 和 session 数据；App Server 加载的 Project 指令来源保留在 thread 元数据中。
