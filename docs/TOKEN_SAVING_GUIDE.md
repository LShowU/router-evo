# Token Saving Guide

Router Evo reduces the first request surface. It is not a token estimator and it
must not report savings from file size, character counts, or tool-output length.

## First Turn

The router classifies the first user task and exposes a small tool surface:

- Chat: no tools when none are needed.
- File or code work: an editor-oriented surface.
- Command or test work: a shell-oriented surface.
- Later requests restore the full tool catalog.

Chinese build and maintenance keywords are supported directly in UTF-8.

## Evo Tools

- `evo_read` caches unchanged files within a session.
- `evo_edit` keeps an in-memory checkpoint for undo.
- `evo_grep` supports files, count, summary, and full output modes.
- `evo_map` summarizes a repository structure.
- `evo_verify` runs focused lint or test checks after an edit.

These tools reduce repeated output where applicable. They do not by themselves
prove provider token savings.

## Measuring Savings

Use fresh control and candidate sessions with identical provider, model, task,
working directory, and success criteria. Compare the full `code` preset to
`router-evo`.

Prompt tokens are provider-reported:

```text
inputTokens + cacheReadTokens + cacheWriteTokens
```

The current five-task first-turn benchmark measured a 53.97-54.05% reduction,
with a 54.00% mean. Treat 50-80% as a design target, not a universal result.

For multi-turn or tool-heavy work, run a separate controlled benchmark and
report the raw sessions, task definition, model route, and all token buckets.
