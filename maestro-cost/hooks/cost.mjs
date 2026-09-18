#!/usr/bin/env node
// maestro-cost PostLLMCall — append one JSONL line per model call to a ledger.
//
// Contract (verified on Muse Code 1.3.0): PostLLMCall stdin includes
//   { hook_event_name:"PostLLMCall", session_id, model, model_provider, status,
//     usage:{ input_tokens, output_tokens, reasoning_tokens,
//             cache_read_tokens, cache_write_tokens, cached_tokens }, ... }
// Near-zero overhead, non-blocking, fail-open.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, readStdin } from './maestro-config.mjs';

function ledgerPath(cfg) {
  const p = cfg.cost && cfg.cost.ledgerPath;
  if (p && String(p).trim()) return p;
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'maestro', 'cost-ledger.jsonl');
}

// rate = USD per 1,000,000 tokens.
function estCost(cfg, model, usage) {
  try {
    const rates = (cfg.cost && cfg.cost.rates) || {};
    const r = rates[model];
    if (!r) return 0;
    const inTok = usage.input_tokens || 0;
    const outTok = usage.output_tokens || 0;
    const pc = ((inTok * (r.prompt || 0)) + (outTok * (r.completion || 0))) / 1e6;
    return Math.round(pc * 1e6) / 1e6;
  } catch { return 0; }
}

(async () => {
  try {
    const event = await readStdin();
    const cfg = loadConfig();
    if (!cfg.cost || cfg.cost.enabled === false) process.exit(0);
    const u = event.usage || {};
    const inTok = u.input_tokens || 0;
    const outTok = u.output_tokens || 0;
    const cacheRead = u.cache_read_tokens || u.cached_tokens || 0;
    const cacheHitPct = inTok > 0 ? Math.round((cacheRead / inTok) * 1000) / 10 : 0;
    const line = {
      ts: new Date().toISOString(),
      session_id: event.session_id || null,
      model: event.model || null,
      provider: event.model_provider || null,
      status: event.status || null,
      input_tokens: inTok,
      output_tokens: outTok,
      reasoning_tokens: u.reasoning_tokens || 0,
      cache_read_tokens: cacheRead,
      cache_hit_pct: cacheHitPct,
      est_cost_usd: estCost(cfg, event.model, u),
    };
    const lp = ledgerPath(cfg);
    fs.mkdirSync(path.dirname(lp), { recursive: true });
    fs.appendFileSync(lp, JSON.stringify(line) + '\n');
  } catch { /* fail-open */ }
  process.exit(0);
})();
