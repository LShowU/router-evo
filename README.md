<div align="center">

# Router Evo

### DSH 首轮智能路由与 Prompt Token 优化预设

**典型首轮对话可稳定节省 50–80% Prompt Token**

[![DSH Preset](https://img.shields.io/badge/DSH-Agent%20Preset-20232A?style=flat-square)](https://github.com/LShowU/router-evo)
[![First-turn savings](https://img.shields.io/badge/首轮节省-50%25--80%25-16A34A?style=flat-square)](docs/BENCHMARK_RESULTS.md)
[![Measured mean](https://img.shields.io/badge/五类实测均值-54.00%25-2563EB?style=flat-square)](docs/BENCHMARK_RESULTS.md)
[![Zero dependencies](https://img.shields.io/badge/runtime-zero%20dependencies-6B7280?style=flat-square)](preset/router-evo)

[中文](#中文) · [English](#english) · [基准结果](docs/BENCHMARK_RESULTS.md) · [节省指南](docs/TOKEN_SAVING_GUIDE.md)

</div>

---

## 中文

Router Evo 是面向 [DeepSeek Harness](https://github.com/deepseek-ai) 的任务感知预设。它在首轮请求发送前识别聊天、开发、修复和命令类任务，只暴露当前真正需要的提示词与工具；后续请求自动恢复完整工具目录，不牺牲完整工作能力。

> **50–80% 是典型首轮场景的实用范围。** 实际节省取决于原始 preset 大小、工具数量、provider 缓存计费、模型和任务类型。当前五类受控首轮测试均落在约 54%，证明该优化在真实 provider usage 下有效。

### 为什么能省

完整 Agent preset 往往在第一句话之前就发送全部系统指令和工具 Schema。对于解释问题、生成短代码或定位一个错误，大部分内容首轮根本用不到。

```text
完整 preset                  Router Evo
全部 system sections         首轮最小 persona
全部工具 Schema        ->    按任务选择最小工具 surface
后续继续发送完整能力          第二轮恢复完整工具目录
```

Router Evo 优化的是发送给模型的 prompt，而不是修改或估算 provider 的计费数字。

### 核心能力

| 能力 | 行为 |
| --- | --- |
| 中文任务路由 | 原生识别“开发、创建、修复、重构、排查、审查”等 UTF-8 中文关键词 |
| 首轮工具裁剪 | 聊天不挂工具，代码任务偏向编辑器，命令任务偏向 shell |
| 完整能力恢复 | 首轮之后恢复 preset 的完整工具目录 |
| 会话级文件缓存 | `evo_read` 对未变化文件返回缓存命中结果 |
| 安全编辑 | `evo_edit` 自动创建内存 checkpoint，可用 `evo_undo` 恢复 |
| 紧凑检索 | `evo_grep` 提供 files、count、summary 和 full 模式 |
| 聚焦验证 | `evo_verify` 在编辑后运行相关 lint 或测试 |
| 仓库概览 | `evo_map` 一次生成紧凑的项目结构与配置摘要 |
| 真实用量统计 | `evo_stats` 使用 DSH provider-reported usage，不拿字符数冒充 Token |

### 实测结果

使用完整 `code` preset 作为 baseline，与 `router-evo` 进行五组独立空白会话对照。每组固定相同 provider、model、工作目录和任务文本。

| 首轮能力 | 完整 preset | Router Evo | 节省率 |
| --- | ---: | ---: | ---: |
| 概念解释 | 13,540 | 6,221 | **54.05%** |
| TypeScript 生成 | 13,548 | 6,229 | **54.02%** |
| JavaScript 调试 | 13,561 | 6,242 | **53.97%** |
| 小型架构设计 | 13,556 | 6,237 | **53.99%** |
| Python 代码审查 | 13,555 | 6,236 | **53.99%** |

**实测均值 54.00%，范围 53.97–54.05%。** 更大的原始工具目录可能获得更高节省；更小的 preset、长用户输入、多轮工具执行或不同缓存策略会改变结果。

统计口径：

```text
promptTokens = inputTokens + cacheReadTokens + cacheWriteTokens
savingRate  = (baselinePromptTokens - evoPromptTokens) / baselinePromptTokens
```

完整实验条件与限制见 [Benchmark Results](docs/BENCHMARK_RESULTS.md)。

### 安装

```powershell
Copy-Item -Recurse preset\router-evo "$env:USERPROFILE\.dsh\.agent-presets\router-evo"
```

然后在 `%USERPROFILE%\.dsh\settings.yaml` 中设置：

```yaml
agent-presets:
  default: router-evo
```

启动一个新的 DSH 会话即可使用。安装后修改 preset 文件时，需要重启 DSH 进程以重新加载模块。

### 项目结构

```text
preset/router-evo/
  agent.cordis.yml         DSH preset 组合
  router-bootstrap.mjs     首轮路由与工具裁剪
  router-bootstrap-v1.mjs  兼容入口
  router-core.mjs          UTF-8 中英文任务分类
  evo-enhance.mjs          Evo 工具与真实 usage 汇总

docs/
  BENCHMARK_RESULTS.md     真实 A/B 基准
  TOKEN_SAVING_GUIDE.md    使用与测量指南
scripts/                   可选本地 PowerShell 工具
```

`scripts/` 中的 PowerShell 文件是可选辅助工具，当前 preset 运行时不会自动调用它们。

### 如何正确测量

1. 分别创建完整 `code` preset 和 `router-evo` 的全新空白会话。
2. 固定 provider、model、工作目录、任务文本和完成标准。
3. 从 DSH `assistant/message.usage` 读取真实 token bucket。
4. 同时报告 input、cache read、cache write、output 和 step 数。
5. 对多轮或工具密集任务单独测试，不把首轮结果直接外推到整个会话。

禁止使用文件字节数、字符数或工具输出长度推算“节省 Token”。

---

## English

Router Evo is a task-aware DSH preset that reduces the system prompt and tool-schema surface on the first request, then restores the full tool catalog for subsequent work.

**Typical first-turn conversations can reduce prompt tokens by 50–80%.** The exact result depends on the original preset size, tool count, provider cache accounting, model, and task. A controlled five-capability benchmark measured a **54.00% mean reduction**, with a **53.97–54.05% range**.

### Highlights

- UTF-8 Chinese and English task classification
- Minimal first-turn tool surface selected by task type
- Full tool catalog restored after the first request
- Cached reads, checkpointed edits, compact grep, repository maps, and focused verification
- Provider-reported token accounting instead of byte or character estimates
- Zero runtime npm dependencies in the local enhancement plugin

### Install

```powershell
Copy-Item -Recurse preset\router-evo "$env:USERPROFILE\.dsh\.agent-presets\router-evo"
```

Set `agent-presets.default` to `router-evo` in `%USERPROFILE%\.dsh\settings.yaml`, then start a new DSH session.

See [Benchmark Results](docs/BENCHMARK_RESULTS.md) for the measured data and [Token Saving Guide](docs/TOKEN_SAVING_GUIDE.md) for the comparison protocol.

---

<div align="center">

**Smaller first request. Full capability when the work begins.**

</div>
