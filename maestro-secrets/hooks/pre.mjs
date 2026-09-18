#!/usr/bin/env node
// maestro-secrets PreToolUse — block a tool command that carries a secret literal.
import { loadConfig, readStdin } from './maestro-config.mjs';
import { scan } from './secrets-core.mjs';
(async () => {
  try {
    const event = await readStdin();
    const cfg = loadConfig();
    if (!cfg.secrets || cfg.secrets.enabled === false) process.exit(0);
    const ti = event && event.tool_input;
    let text = '';
    if (ti && typeof ti === 'object') { try { text = JSON.stringify(ti); } catch {} }
    else if (typeof ti === 'string') text = ti;
    if (!text) process.exit(0);
    const hits = scan(text, cfg);
    if (hits.length) {
      const kinds = [...new Set(hits.map(h => h.kind))].join(', ');
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `maestro-secrets: this command contains a secret-shaped value [${kinds}] that would be written into the session transcript. Denied to prevent leaking it. Use an env var or a secrets manager instead, or add the value to secrets.allowlist if it is deliberately public.`,
        },
      }));
    }
  } catch { /* fail-open */ }
  process.exit(0);
})();
