# AI 会话

## 会话边界

每个用户、每个 AI provider 使用独立的活动会话。AI 分析成功后，会话记录对应的结果版本、分析指纹和成功时间。`--new-thread` 创建所选 provider 的新 session generation；新会话成功前，原活动指针保持不变。

当前 CLI 只向会话发送分析输入，不提供普通聊天或会话删除命令。不要手工修改 `sessions/index.json` 或 provider 会话文件；索引摘要必须与对应文件严格一致。

## Codex

Codex 对话历史由所选 `CODEX_HOME` 中的持久 thread 保存。本地 `sessions/codex/<localSessionId>.json` 保存 thread ID、模型、Project、回合恢复状态和最近结果关联，不复制完整 thread 历史。

后续命令按 thread ID 恢复，不按显示名搜索。提示词或模型不兼容以及显式 `--new-thread` 产生新的 generation。

## Gemini

Gemini 没有本功能可用的持久远端 thread ID。完整成功历史保存于 `sessions/gemini/<localSessionId>.json`，每次 CLI 进程重新创建 SDK Chat：

1. 校验固定的 `systemInstruction` 和严格成对的 `user` / `model` 历史。
2. 把完整历史一次传给 `chats.create()`。
3. 只通过 `sendMessage()` 发送本轮新的 AnalyzerOutput。
4. 保存结果版本后，追加本轮输入和模型结果。

旧消息不会逐条重新发送，也不会产生新的可见提示消息或额外模型回复。“提示词只设置一次”表示一个逻辑 session 固定一个提示词版本；每次进程重建时，SDK 请求仍携带相同的 `systemInstruction` 和历史。

模型调用失败、响应解析失败或结果版本写入失败时，不追加 Gemini 历史。结果版本已经保存但会话写入失败时，pending 结果关联保持不变；再次执行相同分析，从已保存版本补齐会话，不重复请求模型。

## 保留与用量

会话文件永久保留，不受 `data.keepRaw` 或 `data.rawRetention` 影响。Gemini 历史包含完整分析快照和模型结果；关闭源数据保留不会清除这些副本。

Gemini 历史越长，每次请求携带的上下文越多，延迟和模型用量随之增加。当前实现不自动截断、总结或压缩历史。
