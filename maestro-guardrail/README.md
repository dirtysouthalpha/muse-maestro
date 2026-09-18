# maestro-guardrail

**Hook:** `PreToolUse` · **Action:** deny catastrophic ops, allow everything else.

The only safety floor for a `--yolo` Muse session. It scans each tool command
against a deny-list of irreversible operations (root/home recursive deletes,
fork bombs, `mkfs`/`dd` on a device, `curl|bash`, force-push to a protected
branch, …). A match returns a `deny` with a clear reason; anything else passes
silently (Muse treats silence as allow).

- Deny rules are data: [`data/denylist.json`](data/denylist.json). Add your own
  via `guardrail.extraDenyRules` in your Maestro config.
- Pure Node, no network, fail-open (a guard error never blocks the agent).

Test it yourself:
```bash
muse plugins hook test maestro-guardrail:guardrail --fixture fixture.json --json
# fixture.json: {"event":"PreToolUse","stdin":{"tool_name":"bash","tool_input":{"command":"rm -rf /"}}}
```
