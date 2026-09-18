#!/usr/bin/env node
// maestro-guardrail — PreToolUse safety floor for --yolo Muse Code sessions.
//
// It DENIES only catastrophic, irreversible operations and lets everything
// else run at full speed. It is pure Node (no network), fast, and FAIL-OPEN:
// any internal error results in an ALLOW (emit nothing), never a block.
//
// Muse PreToolUse output contract (verified on Muse Code 1.3.0):
//   deny  -> {"hookSpecificOutput":{"hookEventName":"PreToolUse",
//             "permissionDecision":"deny","permissionDecisionReason":"..."}}
//   allow -> emit NOTHING (a bare "allow" is rejected by Muse; silence = pass).
//
// The deny list is data (data/denylist.json + config extraDenyRules) so it is
// trivial to extend without touching this code.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, readStdin } from './maestro-config.mjs';

function allow() {
  // Silence == allow/pass-through under Muse's PreToolUse contract.
  process.exit(0);
}

function deny(reason) {
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }));
  } catch {
    // If we cannot even write, fail open rather than hang.
  }
  process.exit(0);
}

// Pull the human-meaningful command text out of any tool payload shape.
function extractText(event) {
  const parts = [];
  try {
    const ti = event && event.tool_input;
    if (ti && typeof ti === 'object') {
      for (const k of ['command', 'cmd', 'script', 'code', 'content', 'input']) {
        if (typeof ti[k] === 'string') parts.push(ti[k]);
      }
      // Fallback: stringify the whole tool_input so nested/renamed fields still scan.
      try { parts.push(JSON.stringify(ti)); } catch {}
    } else if (typeof ti === 'string') {
      parts.push(ti);
    }
  } catch {}
  return parts.join('\n');
}

async function main() {
  const event = await readStdin();
  const cfg = loadConfig();

  if (!cfg.guardrail || cfg.guardrail.enabled === false) allow();

  const text = extractText(event);
  if (!text) allow();

  // Load shipped rules + user extra rules.
  let rules = [];
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const dl = JSON.parse(fs.readFileSync(path.resolve(here, '..', 'data', 'denylist.json'), 'utf8'));
    if (dl && Array.isArray(dl.rules)) rules = dl.rules;
  } catch {
    // If the shipped list is unreadable we still honor config rules below.
  }
  try {
    const extra = cfg.guardrail && cfg.guardrail.extraDenyRules;
    if (Array.isArray(extra)) rules = rules.concat(extra);
  } catch {}

  for (const rule of rules) {
    try {
      if (!rule || typeof rule.pattern !== 'string') continue;
      const re = new RegExp(rule.pattern, typeof rule.flags === 'string' ? rule.flags : 'i');
      if (re.test(text)) {
        const id = rule.id || 'rule';
        const desc = rule.description || 'catastrophic operation blocked';
        deny(`maestro-guardrail: blocked [${id}] ${desc}. This op is denied as irreversible/destructive. If you truly intend it, run it yourself outside Muse, or add an allowance to your maestro config.`);
      }
    } catch {
      // A bad regex in one rule must not disable the rest, and must not block.
      continue;
    }
  }

  allow();
}

main().catch(() => process.exit(0)); // absolute fail-open
