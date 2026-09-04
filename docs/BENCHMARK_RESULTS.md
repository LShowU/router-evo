# Benchmark Results

## Scope

This benchmark compares the full `code` preset with `router-evo` on fresh,
single-turn sessions. Each pair uses the same provider, model, working directory,
and task text. Prompt tokens are provider-reported DSH usage:

```text
inputTokens + cacheReadTokens + cacheWriteTokens
```

## Result

Five first-turn, no-tool tasks were measured: explanation, code generation,
debugging, design, and code review.

| Metric | Result |
| --- | ---: |
| Samples | 5 |
| Minimum reduction | 53.97% |
| Maximum reduction | 54.05% |
| Mean reduction | 54.00% |
| Median reduction | 53.99% |

The full preset used 13,540-13,561 prompt tokens. Router Evo used 6,221-6,242
prompt tokens, saving 7,319 tokens in every pair.

## Interpretation

This supports a roughly 54% first-turn prompt-token reduction for the tested
workloads. It does not support a universal 70-95% claim. The published 50-80%
range is a design target for common first-turn workloads and must be verified
per provider, model, task type, and multi-turn workflow.
