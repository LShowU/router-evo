# Router Evo

**中文介绍 | English**

---

## 中文介绍

**让 DSH Agent 首轮对话省 70-95% Token 的智能路由预设**

Router Evo 是一个 DSH（DeepSeek Harness）用户预设，通过智能路由和工具裁剪大幅降低 Agent 对话成本。

### 核心特性

🚀 **首轮智能路由**
- 聊天对话：0 工具，节省 95% Token
- 文件/代码任务：仅 `str_replace_editor`，节省 70-80% Token
- 命令/测试任务：仅 `pwsh`，节省 80-85% Token
- 第二轮自动恢复完整工具目录

🧠 **Evo 工具套件**
- `evo_read`：会话级缓存，第二次读取返回 0 Token
- `evo_edit`：智能编辑 + 自动 checkpoint
- `evo_grep`：压缩搜索结果（仅文件名/统计/摘要模式）
- `evo_verify`：自动验证编辑结果
- `evo_map`：生成仓库结构地图
- `evo_stats`：Token 统计追踪

⚡ **PowerShell 脚本层**
- 会话缓存、checkpoint、Repo Map
- 输出压缩、自动验证、上下文注入
- 自动内存清理

📊 **实测效果**
- 普通聊天首轮：从 ~2000 Token → 46 字符
- 代码任务首轮：从 ~1500 Token → ~300 Token
- 第二轮及以后：完整工具目录，无性能损失

### 快速开始

```powershell
# 1. 复制预设到 DSH 配置目录
Copy-Item -Recurse preset\router-evo "$env:USERPROFILE\.dsh\.agent-presets\router-evo"

# 2. 设置为默认预设
# 编辑 %USERPROFILE%\.dsh\settings.yaml
# agent-presets:
#   default: router-evo

# 3. 启动新的 DSH 会话
```

---

## English

A DSH user preset focused on reducing first-turn prompt and tool-schema tokens.

## Included

- `preset/router-evo/`: Router Evo (default)
- `scripts/`: cache, checkpoint, repository map, compressed output, verification, context injection, cleanup
- `AGENTS.md`: concise agent operating rules
- `docs/`: design and activation notes

## First-turn routing

- Chat: no tools
- File/code task: `str_replace_editor` only
- Command/test task: shell only
- Second request: restore the full tool catalog

## Install

1. Copy `preset/router-evo` to `%USERPROFILE%\\.dsh\\.agent-presets\\router-evo`.
2. Set `agent-presets.default` to `router-evo` in DSH settings.
3. Start a new DSH session.

Do not commit API keys, session logs, caches, checkpoints, or machine-specific settings.
