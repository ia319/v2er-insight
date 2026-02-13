# V2ER Insight

V2EX 用户画像深度分析工具。通过自动化抓取数据、统计解析及 AI 语言模型建模，构建多维度的用户行为与心理画像。

## 核心流程 (Pipe Flow)

本项目采用管道化设计，目前通过以下步骤逐步生成深度报告：
**Fetch** (抓取) → **Analyze** (统计) → **AI** (建模) → **Show** (展示)

---

## 现阶段快速开始

### 安装，构建，运行

```bash
npm install
npm run build
npx ts-node -r tsconfig-paths/register src/cli/index.ts <command> <username>
```

### 开发模式（跳过构建，直接运行源码）

```bash
npx ts-node -r tsconfig-paths/register src/cli/index.ts fetch <username>
npx ts-node -r tsconfig-paths/register src/cli/index.ts analyze <username>
npx ts-node -r tsconfig-paths/register src/cli/index.ts ai <username>
npx ts-node -r tsconfig-paths/register src/cli/index.ts show <username>
```

### 质量检查

```bash
npm run check:types    # TypeScript 类型检查
npm run lint           # ESLint 代码规范
npm run test           # Vitest 单元测试（单次）
npm run dev            # Vitest 监听模式
npm run ci             # 完整 CI（类型 + lint + 格式 + 测试）
```

### 环境配置

在根目录创建 `.env` 文件，用于存储 AI 接口密钥：

```env
GOOGLE_API_KEY=你的_GEMINI_API_KEY
```

---

## CLI 命令

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

| 选项             | 说明                                       |
| ---------------- | ------------------------------------------ |
| `--model <name>` | 指定 Gemini 模型（默认: gemini-2.0-flash） |

### 4. 报告展示 (Show)

以结构化的格式展示最终的分析报告，包含 OCEAN 五维性格雷达图（字符模拟）。

```bash
v2er show <username> [选项]
```

| 选项      | 说明                           |
| --------- | ------------------------------ |
| `--brief` | 简略版输出（仅摘要及核心指标） |
| `--json`  | 输出 AI 返回的原始 JSON 数据   |

### 5. 代理配置 (Config)

```bash
v2er config proxy [url] [选项]
```

| 命令                        | 说明                 |
| --------------------------- | -------------------- |
| `v2er config proxy <url>`   | 设置 HTTP 代理地址   |
| `v2er config proxy`         | 查看当前已配置的代理 |
| `v2er config proxy --clear` | 清除代理配置         |

---

## 详细配置说明

### 1. API Key 解析顺序

AI 模块通过以下优先级依次尝试读取 Gemini API Key：

- 配置文件 `~/.v2errc.json` 中的 `geminiApiKey` 字段
- 环境变量 `GOOGLE_API_KEY`
- 环境变量 `GEMINI_API_KEY`

### 2. 代理读取逻辑 (Proxy)

程序按以下优先级确定请求使用的代理：

- 全局配置文件 (`~/.v2errc.json`)
- 系统环境变量 `HTTPS_PROXY`
- 系统环境变量 `HTTP_PROXY`

若以上均未配置，则尝试直接连接。

### 3. 技术实现细节

- 日志系统：采用级别过滤（Error/Warn/Info/Debug），支持带进度的章节式输出。
- 代理驱动：内置 `https-proxy-agent`。Axios 的内置代理参数已显式禁用，以确保 Agent 兼容性。
- 数据本地化：数据存储于 `~/.v2er-insight/data/{username}/` 下。

---

### 安全与隐私

- 文件权限：在 Linux/Mac 系统上，程序创建的配置文件权限为 `0600`（仅当前用户读写）。
- 隐私保护：建议避免在配置文件中直接存储包含明文凭据的代理 URL。
- Windows 用户建议：手动检查 `~/.v2errc.json` 的访问控制列表 (ACL)，确保其安全性。
