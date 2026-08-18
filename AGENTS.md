# Agent Directives (Token & Performance Optimization)

## 1. Output Constraint (Anti-Verbosity)
- **Be extremely concise.** Provide code, commands, and direct answers first.
- **No unsolicited explanations.** Do not explain the "why" or summarize what you did unless explicitly asked or if the fix involves complex architectural changes.
- **Skip pleasantries.** No "Sure, I can help with that" or "Here is the code". Just output the result.

## 2. Tool Usage Strategy (Evo-First)
When exploring or reading code, strictly prioritize token-saving Evo tools over native tools:
- Use `evo_map` to understand repository structure instead of multiple `ls` or `glob` calls.
- Use `evo_grep` to find specific code snippets instead of reading entire files.
- Use `evo_read` (which has session-level caching) instead of standard `read` to avoid redundant token consumption on unchanged files.
- Only fall back to standard tools if Evo tools fail or are insufficient.

## 3. Execution Style
- Adopt a "Doer" (react) mindset for standard coding tasks: execute immediately, verify, and report briefly.
- Reserve deep planning (spec) only for multi-file refactors or complex architectural requests.

