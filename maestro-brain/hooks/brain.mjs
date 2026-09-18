#!/usr/bin/env node
// maestro-brain — SessionEnd persistence of durable facts to an HTTP memory API.
//
// Ships DISABLED (no endpoint). Enable by setting brain.endpoint in your
// maestro config. It POSTs a conservative, durable one-liner distilled from the
// session's final assistant message to a memory endpoint of your choice.
//
// Contract (verified on Muse Code 1.3.0): SessionEnd stdin includes
//   { hook_event_name:"SessionEnd", session_id, cwd, reason, last_assistant_message? }
// SessionEnd is terminal; the hook emits nothing and just performs the POST.
//
// CONSERVATIVE by design: only clearly-durable facts (topology, a fix with
// evidence, a config-that-lies scar) are persisted. Transient chatter is
// skipped. Dedupe against searchEndpoint first (a timed-out write may still
// have stored, so we search before writing). Fully FAIL-OPEN.

import { loadConfig, readStdin } from './maestro-config.mjs';

const DURABLE = /\b(port|:\d{2,5}\b|systemd|service|runs on|listens on|process|pid|restart|deploy|root cause|because|turned out|actually|scar|gotcha|config|endpoint|topology|located at|lives (in|at)|path is|fixed by|resolved by|caused by)\b/i;
const TRANSIENT = /\b(let me|i'll|i will|working on|in progress|next step|todo|maybe|not sure|trying|let's)\b/i;
const FIX_OR_FACT = /\b(fixed|resolved|root cause|because|runs on|listens on|located|lives|config|endpoint|topology|restart|deploy|scar|gotcha)\b/i;

function timeout(ms) {
  return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
}

async function alreadyStored(searchEndpoint, text, ms) {
  if (!searchEndpoint) return false; // no dedupe configured -> proceed
  try {
    const q = encodeURIComponent(text.slice(0, 80));
    const url = `${searchEndpoint}${searchEndpoint.includes('?') ? '&' : '?'}q=${q}`;
    const res = await Promise.race([fetch(url), timeout(ms)]);
    if (!res || !res.ok) return false;
    const body = await res.text();
    // If the first ~48 chars already appear in the corpus, treat as present.
    const needle = text.slice(0, 48).toLowerCase();
    return needle.length > 12 && body.toLowerCase().includes(needle);
  } catch {
    return false; // search failed -> do not block the write, but risk a dup
  }
}

function distill(msg) {
  if (!msg || typeof msg !== 'string') return null;
  // Pick the most fact-like line from the final message.
  const lines = msg.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  let best = null;
  for (const l of lines) {
    if (l.length < 25 || l.length > 400) continue;
    if (TRANSIENT.test(l)) continue;
    if (!DURABLE.test(l)) continue;
    if (!FIX_OR_FACT.test(l)) continue;
    if (!best || l.length > best.length) best = l;
  }
  return best;
}

async function main() {
  const event = await readStdin();
  const cfg = loadConfig();
  const b = cfg.brain || {};
  if (!b.enabled || !b.endpoint) process.exit(0); // disabled by default

  const fact = distill(event.last_assistant_message);
  if (!fact) process.exit(0); // nothing clearly durable -> stay quiet

  const content = `[muse-maestro/${event.cwd || 'session'}] ${fact}`;
  try {
    if (await alreadyStored(b.searchEndpoint, fact, b.timeoutMs || 4000)) {
      process.exit(0); // dedupe hit
    }
    const payload = {
      content,
      region: b.region || 'knowledge',
      source: b.source || 'muse-maestro',
      topic: b.topic || 'muse-maestro',
    };
    await Promise.race([
      fetch(b.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      timeout(b.timeoutMs || 4000),
    ]);
  } catch {
    // brain unreachable / timeout -> fail open, session already ended
  }
  process.exit(0);
}

main().catch(() => process.exit(0));
