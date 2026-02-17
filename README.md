# V2ER Insight

V2EX 用户画像深度分析工具。通过自动化抓取数据、统计解析及 AI 语言模型建模，构建多维度的用户行为与心理画像。

## 核心流程 (Pipe Flow)

本项目采用管道化设计，目前通过以下步骤逐步生成深度报告：
**Fetch** (抓取) → **Analyze** (统计) → **AI** (建模) → **Show** (展示)

## CLI 命令

### 一键分析（推荐）

从零到报告，一条命令完成全流程：

```bash
v2er <username>
```

| 选项                       | 说明                                                               |
| -------------------------- | ------------------------------------------------------------------ |
| `--force`                  | 强制重新抓取（忽略本地缓存）                                       |
| `--model [name]`           | 指定 AI 模型（默认: `gemini-3-pro-preview`）                       |
| `--thinking-level [level]` | 指定思考等级（默认: `high`，可选 `minimal`/`low`/`medium`/`high`） |
| `-v, --verbose`            | 显示调试输出                                                       |

智能跳过：管道执行时，若 `raw.json` 已存在则跳过抓取步骤（analyze 和 ai 每次重新执行）。`--force` 忽略缓存从头开始。

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

目前仅支持 **Google Gemini** 服务。
调用 AI 模型，基于统计结果进行多维度心理、行为及社交建模，生成分析报告。

- 核心提示词所在位置：[docs/prompt.md](docs/prompt.md)
- 分析维度详细说明：[docs/ai-result/result-schema.md](docs/ai-result/result-schema.md)

```bash
v2er ai <username> [选项]
```

| 选项                       | 说明                                                               |
| -------------------------- | ------------------------------------------------------------------ |
| `--model <name>`           | 指定 Gemini 模型（默认: `gemini-3-pro-preview`）                   |
| `--thinking-level <level>` | 指定思考等级（默认: `high`，可选 `minimal`/`low`/`medium`/`high`） |

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

# 重置
v2er config reset                           # 重置全部为默认值
v2er config reset ai                        # 仅重置 ai 分组

# 代理快捷方式
v2er config proxy http://127.0.0.1:7890     # 设置代理
v2er config proxy                           # 查看代理
v2er config proxy --clear                   # 清除代理
```

---

## 详细配置说明

配置文件位于 `~/.v2er-insight/config.json`，可通过 `v2er config set` 或手动编辑。

### 1. API Key 解析顺序

AI 模块通过以下优先级依次尝试读取 Gemini API Key：

- `~/.v2er-insight/config.json` 中的 `ai.apiKey` 字段
- 环境变量 `GOOGLE_API_KEY`
- 环境变量 `GEMINI_API_KEY`

### 2. 代理读取逻辑 (Proxy)

程序按以下优先级确定请求使用的代理（Fetcher 和 AI 模块共用同一优先级）：

1. 配置文件 (`~/.v2er-insight/config.json`) 中的 `proxy` 字段
2. 系统环境变量 `HTTPS_PROXY`
3. 系统环境变量 `HTTP_PROXY`

若以上均未配置，则尝试直接连接。

### 3. 技术实现细节

- 日志系统：采用级别过滤（Error/Warn/Info/Debug），支持带进度的章节式输出。
- 代理驱动（双通道）：
  - **Fetcher**（V2EX 数据抓取）：`https-proxy-agent` + Axios `httpsAgent`
  - **AI**（Gemini API 调用）：`undici` `ProxyAgent` + `setGlobalDispatcher`（原生 `fetch()` 代理）
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
