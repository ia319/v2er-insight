# V2ER Insight

V2EX 用户数据抓取与分析工具。

## CLI 命令

### 抓取用户数据

```bash
v2er <username> [选项]
```

抓取指定用户的 V2EX 数据。

| 选项        | 说明                 |
| ----------- | -------------------- |
| `--topics`  | 仅抓取用户发布的帖子 |
| `--replies` | 仅抓取用户的回复     |

默认抓取全部数据（个人资料 + 帖子 + 回复）。

**示例**：

```bash
v2er <username> --replies
```

### 代理配置

```bash
v2er config proxy [url] [选项]
```

配置 HTTP 代理。

| 用法                        | 说明         |
| --------------------------- | ------------ |
| `v2er config proxy <url>`   | 设置代理     |
| `v2er config proxy`         | 查看当前代理 |
| `v2er config proxy --clear` | 清除代理设置 |

**示例**：

```bash
v2er config proxy http://127.0.0.1:10808
```

#### 代理读取优先级

程序按以下顺序读取代理配置：

1. 配置文件 (`~/.v2errc.json`)
2. 环境变量 `HTTPS_PROXY`
3. 环境变量 `HTTP_PROXY`

若以上均未设置，则不使用代理。

#### 技术说明

- 使用 `https-proxy-agent` 库创建代理 Agent
- Axios 的内置代理处理已禁用 (`proxy: false`)，避免与自定义 Agent 冲突
