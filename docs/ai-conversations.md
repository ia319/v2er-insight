# AI 会话

## 会话边界

每个用户在每个 AI provider 下最多保留一个活动会话。AI 分析成功后，会话记录对应的结果版本、分析指纹和成功时间。`--new-thread` 为所选 provider 创建新的会话代次。新会话成功前，原活动指针保持不变。

不要手工修改 `sessions/index.json` 或 provider 会话文件。索引摘要、活动指针和对应 provider 文件必须保持一致；写入由 provider session 文件和共享索引事务协调。

## 普通聊天

使用已有活动会话继续对话：

```bash
v2er chat <username> <message...>
v2er chat <username> --provider gemini <message...>
v2er chat <username> --provider codex <message...>
```

未指定 `--provider` 时，命令使用 `sessions/index.json` 中的 `lastSuccessfulAnalysisProvider`。共享索引缺失且旧版 Codex 注册表等待迁移时，命令选择 Codex。显式 provider 选择本次消息使用的活动会话，`lastSuccessfulAnalysisProvider` 保持不变。

命令发送由 CLI 参数组成的用户消息，把最终回复写入 `stdout`，把诊断、错误和上下文警告写入 `stderr`。成功的普通聊天只更新 provider 会话状态；`result.json`、`analysis-state.json` 和结果版本保持不变。

目标 provider 必须存在活动会话。需要建立或重置聊天基线时，执行 `v2er ai <username> --provider <provider> --new-thread`。

## Codex

Codex 对话历史由所选 `CODEX_HOME` 中的持久 thread 保存。本地 `sessions/codex/<localSessionId>.json` 保存 thread ID、模型、Project、回合恢复状态和最近结果关联，不复制完整 thread 历史。结果版本保存后，程序先完成已接受的 turn，再写入 `lastResultVersionId`、分析指纹和成功时间，最后发布共享会话索引。

后续命令按 thread ID 恢复，不按显示名搜索。提示词、模型或 Project 路径与活动 session 不兼容，或者显式使用 `--new-thread` 时，创建新一代会话。结果已经保存但 turn 或索引发布失败时，再次执行相同分析补齐原 session 和结果关联，不创建重复结果版本。

Codex 普通聊天按本地记录的 thread ID 恢复，发送一个不带画像 `outputSchema` 的 user turn，并读取该 turn 的最终 agent message。恢复失败、thread busy、状态未知或上下文超限会终止本轮。Thread 和 provider 身份在整个命令中保持固定。

## Gemini

Gemini 不提供可供本功能复用的持久远端 thread ID。完整成功历史保存于 `sessions/gemini/<localSessionId>.json`。SDK Chat 由 CLI 根据本地完整成功历史重建：

1. 校验固定的 `systemInstruction` 和严格成对的 `user` / `model` 历史。
2. 把完整历史一次传给 `chats.create()`。
3. 通过 `sendMessage()` 发送本轮用户消息。
4. AI 分析保存结果版本后，追加 AnalyzerOutput 和画像结果。
5. 普通聊天取得非空回复后，追加用户消息和模型回复。

旧消息不会逐条重新发送，也不会产生新的可见提示消息或额外模型回复。“提示词只设置一次”表示一个逻辑 session 固定一个提示词版本；每次进程重建时，SDK 请求仍携带相同的 `systemInstruction` 和历史。

Gemini 在模型、`promptHash` 或 `systemInstruction` 不兼容时创建新一代会话。Gemini thinking level 仅作用于当次请求，不影响活动会话复用。

Gemini 历史只记录成功的完整消息对。模型调用失败、响应解析失败、结果版本写入失败或普通聊天返回空回复时，原历史保持不变。结果版本已经保存但会话写入失败时，pending 结果关联继续指向该版本；再次执行相同分析时，程序从已保存版本补齐会话。

## 上下文与并发

### 上下文检查

- Gemini 在发送普通聊天消息前读取 SDK 模型的输入上限并计算 token 数量。任一结果不可用时，命令以 `CHAT_CONTEXT_UNVERIFIED` 结束，执行停在 SDK Chat 创建和消息发送之前。达到已验证上限或 Gemini 返回上下文超限时，命令返回 `CHAT_CONTEXT_TOO_LONG`。
- Gemini token 数量达到输入上限的 90% 但尚未达到上限时，命令继续发送并产生 `SESSION_CONTEXT_NEAR_LIMIT`。
- Codex 根据 App Server 返回的上下文错误信息识别 `CHAT_CONTEXT_TOO_LONG`。

### 并发控制

- Provider 会话锁按 `username + provider + localSessionId` 区分，串行执行同一会话的 AI 分析、普通聊天和已确认清理。AI 分析和普通聊天的会话锁冲突返回 `SESSION_BUSY`。
- 不同 provider 使用独立的会话锁。Codex 迁移、分析 turn、普通聊天 turn 和删除流程还使用每用户 Codex 执行锁。
- `sessions/index.json` 的读改写使用短时的每用户索引锁。Provider 网络调用在该事务之外执行。

崩溃遗留锁的回收条件是本机 PID 已确认不存在，且删除前再次读取的 owner token 保持一致。`acquiredAt` 只用于诊断。存活进程、无效锁内容、权限不足和发生变化的 owner token 保持占用状态。

## 检查与永久清理

`v2er session check [username] --provider gemini|codex` 只读取诊断信息。指定用户后，命令校验会话索引、provider 文件、活动指针、Gemini 历史角色顺序或 Codex thread 身份，并展示最近结果版本关联。Codex 旧注册表的待迁移和冲突状态保持原样。

`v2er session clear <username>` 按以下顺序执行：

1. 默认选择 `lastSuccessfulAnalysisProvider` 的活动会话；`--provider` 和 `--all-versions` 扩展选择范围。
2. 在 `stderr` 展示目标会话和保留项。
3. 接受交互终端输入的完整 `yes`。
4. 获取所有目标会话锁并重新解析范围。范围发生变化时终止清理。
5. 执行 provider 删除并持久化剩余会话索引。

- Gemini：删除所选本地会话文件并更新共享索引。缺失的目标文件视为已删除；其他文件删除失败会恢复原索引。
- Codex：先通过所选 App Server 调用 `thread/delete`，再删除对应的本地会话文件和索引映射。方法不受支持或远端删除失败时，对应本地会话保持不变。

远端 Codex thread 删除成功但本地写入失败时，错误报告该 thread 的外部删除状态和此前已经完整删除的会话数量。

## 保留与用量

会话文件位于自动数据保留策略的范围之外。确认后的 `session clear` 是程序提供的会话删除入口。Gemini 历史包含完整分析快照和模型结果；源数据清理后，历史中的副本继续保留。

Gemini 历史越长，每次请求携带的上下文越多，延迟和模型用量随之增加。Gemini 历史不自动截断、总结或压缩。

会话清理的保留范围包括 `raw.json`、`analyzed.json`、`result.json`、`analysis-state.json` 和 `results/`。删除会话后，已有画像结果继续保留。
