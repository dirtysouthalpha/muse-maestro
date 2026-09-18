# maestro-instinct

**Hooks:** `SessionStart`, `PreToolUse` · **Action:** surface learned-ops memory.

Before risky work (cron / GPU / host facts / model servers) it runs a memory
command **you configure** and injects the top results as context. Ships disabled
and command-less; set `instinct.command` to an argv array (the context string is
appended as the final argument). Bounded by `instinct.timeoutMs` (<2s), silent
when empty, fail-open. `instinct.triggerPattern` controls which commands trigger
the per-tool lookup.
