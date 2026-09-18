# maestro-session-watch

**Hooks:** `PostToolUse`, `PreCompact` · **Action:** advisory size warning.

Guards against an unbounded session transcript blowing the context window. It
locates the session's `session.jsonl`, checks its size, and warns **once per
size band** (non-blocking) when it crosses ~2 MB / ~150k estimated tokens,
suggesting a checkpoint + fresh session. Configure `sessionWatch.bytesWarn`,
`sessionWatch.tokensWarn`, `sessionWatch.bytesPerToken`.
