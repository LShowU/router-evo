# Router Evo

**中文介绍 | English**

---

## 中文介绍

**面向 DSH 首轮请求的任务路由与工具目录裁剪预设**

Router Evo 在首轮请求中按任务类型收缩 system prompt 与工具目录，随后恢复完整目录。它不改变 provider 的 token 计费口径，而是减少首轮发送的 prompt 内容。

### 已验证的基准

在 `code` 完整 preset 对 Router Evo 的五类空白首轮会话基准中，固定 provider、model、工作目录和任务文本，provider-reported prompt tokens 的节省范围为 **53.97%–54.05%**，均值 **54.00%**。

**设计目标：** 常见首轮场景可争取 **50–80%** prompt-token 减少。该目标不是已验证范围；多轮、工具调用和不同 provider 必须单独测试。

### 核心特性

- 首轮任务路由：聊天、文件/代码、命令/测试任务采用不同最小工具 surface
- 第二轮恢复完整工具目录
- `evo_read`、`evo_edit`、`evo_grep`、`evo_verify`、`evo_map` 工具套件
- provider usage 基准：从 DSH `assistant/message.usage` 读取输入、缓存与输出 token

### 安装

```powershell
Copy-Item -Recurse preset\router-evo "$env:USERPROFILE\.dsh\.agent-presets\router-evo"
```

将 `%USERPROFILE%\.dsh\settings.yaml` 的 `agent-presets.default` 设置为 `router-evo`，然后启动新会话。

### 基准原则

使用同一 provider、model、任务、工作目录和完成标准，比较 `code` 完整 preset 与 `router-evo` 的空白会话。prompt token 口径为：

```text
inputTokens + cacheReadTokens + cacheWriteTokens
```

不要使用字符数、文件大小或工具输出长度估算 token。详细流程见 `docs/TOKEN_SAVING_GUIDE.md`。

---

## English

Router Evo is a DSH preset that reduces first-turn prompt and tool-schema payloads, then restores the full tool catalog after the first turn.

A controlled five-task benchmark against the full `code` preset measured **53.97%–54.05%** provider-reported prompt-token reduction, with a **54.00%** mean. The **50–80%** range is a design target for common first-turn workloads, not a universal measured claim.

Prompt-token accounting includes uncached input plus cache reads and writes. Do not estimate token savings from file bytes, characters, or tool-output size.

The `scripts/` directory contains optional local utilities. These scripts are not invoked by the preset runtime.
