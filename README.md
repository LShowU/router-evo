<div align="center">

# Router Evo

### DSH 首轮智能路由与 Prompt Token 优化预设

**典型首轮对话节省约 50–80% Prompt Token**

[![DSH](https://img.shields.io/badge/DSH-0.1.0--rc.6-20232A?style=flat-square)](https://github.com/deepseek-ai)
[![First-turn savings](https://img.shields.io/badge/首轮节省-50%25--80%25-16A34A?style=flat-square)](#工作原理)
[![Runtime](https://img.shields.io/badge/runtime-zero%20dependencies-2563EB?style=flat-square)](preset/router-evo)
[![Platform](https://img.shields.io/badge/tested-Windows-64748B?style=flat-square)](#兼容性)

[中文](#中文) · [English](#english)

</div>

---

## 中文

Router Evo 是面向 DeepSeek Harness 的任务感知预设。它在首轮请求发送前识别任务类型，只加载当前需要的提示词与工具；进入实际工作后自动恢复完整工具目录。

首轮 Prompt Token 通常可减少 **50–80%**。实际比例取决于原始 preset 大小、工具目录规模、模型、provider 缓存策略、用户输入长度和任务类型。完整配置越大，首轮裁剪收益通常越明显。

### 工作原理

传统完整 Agent 会在第一句话之前发送所有系统指令和工具 Schema。多数首轮任务只需要其中很小一部分。

```text
用户请求
   |
   v
中文 / 英文任务分类
   |
   +-- 普通对话 ------> 最小提示，无工具
   +-- 文件与代码 ----> 编辑器优先
   +-- 命令与测试 ----> Shell 优先
   +-- 修复与维护 ----> 检查、编辑工具优先
   |
   v
首轮完成后恢复完整工具目录
```

Router Evo 优化的是发送给模型的上下文体积，不修改模型、不改变任务内容，也不限制后续完整工作能力。

### 核心能力

| 能力 | 说明 |
| --- | --- |
| 智能首轮路由 | 根据任务内容选择最小可用工具 surface |
| 中文关键词支持 | 原生识别开发、创建、修复、重构、排查、审查等任务 |
| 完整能力恢复 | 首轮后恢复文件、Shell、检索、Skills、计划、子代理和工作流能力 |
| 会话文件缓存 | `evo_read` 避免重复返回未变化的完整文件 |
| 安全编辑 | `evo_edit` 自动 checkpoint，`evo_undo` 可恢复 |
| 紧凑搜索 | `evo_grep` 支持 files、count、summary 和 full 模式 |
| 仓库概览 | `evo_map` 一次生成项目结构、配置和 Git 状态摘要 |
| 聚焦验证 | `evo_verify` 只在失败时返回必要的 lint 或测试信息 |
| 用量观察 | `evo_stats` 汇总 provider-reported usage，不拿字符数冒充 Token |

### 安装

```powershell
Copy-Item -Recurse preset\router-evo "$env:USERPROFILE\.dsh\.agent-presets\router-evo"
```

在 `%USERPROFILE%\.dsh\settings.yaml` 中设置：

```yaml
agent-presets:
  default: router-evo
```

重启 DSH，然后创建新会话。

### 兼容性

| 项目 | 支持情况 |
| --- | --- |
| DeepSeek Harness | 已验证 `0.1.0-rc.6` |
| Node.js | 跟随当前 DSH 运行时要求 |
| Windows | 已验证，自动使用 PowerShell 工具 |
| Linux / macOS | preset 提供 bash 条件分支，尚未在本项目环境完整验证 |
| 更早的 DSH RC | 不保证兼容，需具备当前 Cordis preset 与 session event API |

Router Evo 使用以下 Harness 能力：

- Cordis agent preset 组合
- `system-prompt/assemble` 首轮提示组装
- `session/event` 会话事件
- DSH 工具注册与 provider usage 数据

Harness API 发生变化时，应重新执行语法检查和首轮会话验证。

### 项目结构

```text
preset/router-evo/
  agent.cordis.yml         preset 组合入口
  router-bootstrap.mjs     首轮路由与工具裁剪
  router-bootstrap-v1.mjs  兼容入口
  router-core.mjs          UTF-8 中英文任务分类
  evo-enhance.mjs          Evo 工具套件

docs/                      设计和使用文档
scripts/                   可选本地 PowerShell 辅助脚本
```

`scripts/` 中的脚本不是 preset 运行时依赖，不会被自动调用。

---

## English

Router Evo is a task-aware preset for DeepSeek Harness. It reduces the first-request system prompt and tool-schema surface, then restores the complete tool catalog when the work continues.

**Typical first-turn prompt-token reduction is approximately 50–80%.** The exact result depends on the original preset size, tool catalog, model, provider cache behavior, user input, and task type.

### Highlights

- UTF-8 Chinese and English task routing
- Minimal first-turn tool surface selected by task type
- Full capabilities restored after the first request
- Cached reads, checkpointed edits, compact search, repository maps, and focused verification
- Provider usage observation without byte or character-based token claims
- Zero additional runtime npm dependencies

### Compatibility

- Tested with `@deepseek-ai/dsh 0.1.0-rc.6`
- Tested on Windows with the PowerShell tool path
- Includes conditional bash configuration for Linux and macOS; full platform verification is pending
- Earlier DSH release candidates are not guaranteed because Router Evo depends on the current Cordis preset, prompt assembly, session event, and tool registration APIs

### Install

```powershell
Copy-Item -Recurse preset\router-evo "$env:USERPROFILE\.dsh\.agent-presets\router-evo"
```

Set `agent-presets.default` to `router-evo` in `%USERPROFILE%\.dsh\settings.yaml`, restart DSH, and create a new session.

---

<div align="center">

**Smaller first request. Full capability when the work begins.**

</div>
