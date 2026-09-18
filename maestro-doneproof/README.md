# maestro-doneproof

**Hook:** `Stop` · **Action:** block a success claim that has no evidence.

If the final message says `done` / `fixed` / `passing` / `complete` / `verified`
without showing proof (a command + exit code, test output, a re-read file, a URL
that responded), the stop is blocked and evidence is requested. Include the
override phrase (default `[skip-doneproof]`) to stop anyway. Never loops
(honours `stop_hook_active`). Fail-open.

Configure `doneproof.claimPattern`, `doneproof.evidencePattern`, and
`doneproof.overridePhrase`.
