#!/usr/bin/env node
// maestro-secrets PreLLMCall — block a model call whose payload carries a secret.
// NOTE: Muse 1.3 rejects `updatedMessages`, so we cannot redact-in-place; we
// fail CLOSED (block) rather than let an un-allowlisted secret reach the model.
import { loadConfig, readStdin } from './maestro-config.mjs';
import { scan, textFromMessages } from './secrets-core.mjs';
(async () => {
  try {
    const event = await readStdin();
    const cfg = loadConfig();
    if (!cfg.secrets || cfg.secrets.enabled === false) process.exit(0);
    if (cfg.secrets.scanLLM === false) process.exit(0);
    const text = textFromMessages(event && event.messages);
    if (!text) process.exit(0);
    const hits = scan(text, cfg);
    if (hits.length) {
      const kinds = [...new Set(hits.map(h => h.kind))].join(', ');
      process.stdout.write(JSON.stringify({
        decision: 'block',
        reason: `maestro-secrets: the outgoing model payload contains a secret-shaped value [${kinds}]. Blocked to avoid sending it to the model provider. Remove/redact the secret from context (Muse 1.3 offers no in-place message redaction), or add it to secrets.allowlist if it is deliberately public.`,
      }));
    }
  } catch { /* fail-open */ }
  process.exit(0);
})();
