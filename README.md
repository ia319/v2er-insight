# V2ER Insight

V2EX 用户画像深度分析工具。通过自动化抓取数据、统计解析及 AI 语言模型建模，构建多维度的用户行为与心理画像。

目前画像结果一般。受限于模型能力、Analyze 结果、提示词，后两个需要更多的迭代。

## 核心流程 (Pipe Flow)

本项目采用管道化设计，目前通过以下步骤逐步生成深度报告：
**Fetch** (抓取) → **Analyze** (统计) → **AI** (建模) → **Show** (展示)

## 快速开始

按顺序完成以下步骤：

1. 安装 CLI 包

```bash
npm install -g v2er-insight
# 或
pnpm add -g v2er-insight
```

2. AI provider

Gemini API Key：

```bash
v2er config set ai.gemini.apiKey <your_gemini_api_key>
```

Codex 使用本机 ChatGPT/Codex App 的登录会话：

```bash
v2er config set ai.provider codex
v2er session check --provider codex
```

独立 Codex App Server 使用真实 `CODEX_HOME` 中的凭据存储。账户检查使用 `account/read(refreshToken: false)`；实际模型请求期间的 Token 自动刷新可能更新登录缓存。v2er 的账户响应投影限于账户类型和鉴权可用状态，用于 runtime 选择与诊断输出。

自动发现仅启动带有效 OpenAI Authenticode 签名和匹配发布者的 Windows 原生 CLI。PATH 中的 Codex CLI 只进入诊断；普通独立 CLI 通过 `ai.codex.executable` 显式配置。独立 CLI 与 App 使用同一 `CODEX_HOME` 时共享登录状态和 thread 历史，不同 Codex home 对应独立的账户与历史边界。候选选择校验版本、App Server 初始化、账户、模型和 reasoning effort；thread 方法在实际创建、恢复和发送阶段校验。

Codex 版本探测和 App Server 使用受限子进程环境。环境继承范围限于 Codex runtime、用户与系统目录、临时目录、区域设置、代理和证书路径；API Key、access token、`NODE_OPTIONS`、`ComSpec` 和其他业务变量位于继承范围之外。显式 `.cmd` shim 使用经过文件检查的系统命令处理器。代理值可能包含代理凭据。

Codex thread 固定使用只读 sandbox、`approvalPolicy: never` 和 `networkAccess: false`，关闭 Web 搜索、shell、apps/connectors、hooks、子代理和 plugin 能力。临时 thread 读取所选 Codex home 的实际 MCP 工具名称，持久 thread 按名称关闭对应服务；持久 thread 的 MCP 工具清单为空后进入消息发送。详细边界见 [Codex App Server 接入规范](docs/codex-app-server-integration.md#9-权限与工具边界)。

Codex 默认 Project 为 `~/.v2er-insight/data`。该目录注册为 App 本地 Project 后，创建的任务显示在项目树中；thread 创建独立于该注册状态。

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
| `--new-thread`                | 为 Codex 创建新的 thread generation      |
| `--codex-project <path>`      | 指定新 Codex thread 的 Project 路径      |
| `--resend`                    | 强制重新发送完整分析数据                 |
| `-v, --verbose`               | 显示调试输出                             |

一键命令根据本地 `raw.json`、`analyzed.json` 和 `result.json` 选择执行起点。`analysis-state.json` 提供 analyze 与 AI 步骤的 provenance 校验状态。`--force` 从抓取步骤重新执行。

---

### 分步执行

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
| `--new-thread`                | 创建新的 Codex thread generation    |
| `--codex-project <path>`      | 指定新 Codex thread 的 Project 路径 |
| `--resend`                    | 强制重新发送完整分析数据            |

AI 命令包含来源验证、相同分析结果复用和不完整抓取警告。

默认 provider 为 `gemini`。

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

### 4. 报告展示 (Show)

以结构化的格式展示最终的分析报告，包含 OCEAN 五维性格雷达图（字符模拟）。

```bash
v2er show <username> [选项]
```

| 选项      | 说明                           |
| --------- | ------------------------------ |
| `--brief` | 简略版输出（仅摘要及核心指标） |
| `--json`  | 输出 AI 返回的原始 JSON 数据   |

### 5. 配置管理 (Config)

- **group**: 配置分组名，可选 `ai`、`fetch`、`analyzer`、`data`、`log`、`proxy`
- **path**: 点分路径，如 `ai.model`、`log.level`、`data.keepRaw`
- **value**: 配置值，自动进行类型转换（字符串/数字/布尔）和枚举校验

```bash
# 查看
v2er config show                            # 查看全部配置（apiKey 自动掩码）
v2er config show ai                         # 查看 ai 分组

# 设置
v2er config set ai.model gemini-2.5-flash   # 切换模型
v2er config set ai.thinkingLevel medium     # 设置思考等级
v2er config set log.level debug             # 开启调试日志
v2er config set data.keepRaw true           # 保留原始数据
v2er config set ai.timeout 120000           # AI 请求超时 120s
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

### 6. Provider Session 检查

```bash
v2er session check [username] --provider gemini
v2er session check [username] --provider codex
```

Gemini 检查展示模型、思考等级和 API Key 可用状态。Codex 检查的 RPC 范围为 initialize、`account/read(refreshToken: false)`、model/list 和可选 thread/read；输出包含 CLI 候选的来源、信任依据与版本，账户状态、实时模型目录、Project 路径、执行锁、本地 session，以及指定用户的 thread 状态。凭据存储访问仍由独立 App Server 承担。

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
- 数据本地化：数据存储于 `~/.v2er-insight/data/{username}/` 下。
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

### 安全与隐私

- 文件权限：在 Linux/Mac 系统上，程序创建的配置文件权限为 `0600`（仅当前用户读写）。
- 隐私保护：建议避免在配置文件中直接存储包含明文凭据的代理 URL。
- Windows 用户建议：手动检查 `~/.v2er-insight/config.json` 的访问控制列表 (ACL)，确保其安全性。
- Codex 本地执行边界：持久分析 thread 的 sandbox 为 read-only；Web、shell、apps、plugins 和 MCP 工具为关闭状态。
- Codex 提示词注入安全边界：不可信输入范围为 `AnalyzerOutput` 中的帖子和回复；发送前执行隔离为持久 thread 零 MCP 工具校验。程序在一次分析请求开始前订阅 Codex 事件；工具调用、其他非分析动作或未知动作开始时，程序请求中断当前分析。当前 AI 步骤返回失败，流程结束于画像解析和 `result.json` 写入之前，已有 `result.json` 保持原状。
- Codex Project：默认目录包含各用户的 raw、analyzed、result 和 session 数据；App Server 加载的 Project 指令来源保留在 thread 元数据中。
