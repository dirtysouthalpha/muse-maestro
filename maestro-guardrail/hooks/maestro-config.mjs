// maestro-config.mjs — shared config loader for all Maestro plugins.
//
// Design goals:
//   * FAIL-OPEN. A config problem must never crash a hook or block the agent.
//   * ZERO fleet-specific values live in code. Everything site-specific comes
//     from a user config file that is NOT committed to the public repo.
//   * Muse scrubs custom environment variables before running a hook, so config
//     is resolved from the filesystem, not from env.
//
// Resolution order (first file that parses wins, then merged over defaults):
//   1. $MAESTRO_CONFIG            (if the runtime happens to preserve it)
//   2. ~/.config/maestro/config.json   <-- canonical live location
//   3. <bundle>/../maestro.config.json (dev convenience, gitignored)
//   4. <bundle>/../maestro.config.example.json (shipped safe defaults)
//
// Every read is wrapped in try/catch. If nothing is found, DEFAULTS apply.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULTS = {
  guardrail: {
    enabled: true,
    // Extra rules are appended to the shipped data/denylist.json.
    // Each rule: { id, description, pattern, flags }
    extraDenyRules: [],
  },
  brain: {
    // Ships DISABLED. Point it at any HTTP memory endpoint to enable.
    enabled: false,
    endpoint: '',        // POST target, e.g. http://host:8000/neurons
    searchEndpoint: '',  // GET  ...?q=<query> for dedupe; blank = skip dedupe
    source: 'muse-maestro',
    region: 'knowledge',
    topic: 'muse-maestro',
    timeoutMs: 4000,
  },
  doneproof: {
    enabled: true,
    overridePhrase: '[skip-doneproof]',
    claimPattern: '\\b(done|fixed|passing|passes|complete|completed|verified|works now|resolved|deployed|shipped)\\b',
    evidencePattern: '(evidence|verified by|exit code|exit 0|tests? (pass|passed)|\\boutput:|\\blogs?:|\\bran\\b|http[s]?://|\\$\\s|\\bstat\\b|checksum|diff|screenshot)',
  },
  sessionWatch: {
    enabled: true,
    bytesWarn: 2000000,     // ~2 MB transcript
    tokensWarn: 150000,     // ~150k estimated tokens
    bytesPerToken: 4,       // rough estimate used for the token figure
  },
  instinct: {
    // Ships DISABLED and command-less. Set command to enable.
    enabled: false,
    command: [],            // e.g. ["python3","/path/instinct.py","inject"]
    timeoutMs: 2000,
    // PreToolUse commands matching this trigger a targeted instinct lookup.
    triggerPattern: '(cron\\b|crontab|\\bgpu\\b|nvidia|earlyoom|ollama|llama[-_ ]?swap|systemctl|model[ -]?server|reboot|shutdown)',
  },
};

function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over)) {
    const bv = base ? base[k] : undefined;
    const ov = over[k];
    if (ov && typeof ov === 'object' && !Array.isArray(ov) && bv && typeof bv === 'object' && !Array.isArray(bv)) {
      out[k] = deepMerge(bv, ov);
    } else {
      out[k] = ov;
    }
  }
  return out;
}

function tryRead(p) {
  try {
    if (!p) return null;
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadConfig() {
  let cfg = DEFAULTS;
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const bundleRoot = path.resolve(here, '..');
    const candidates = [
      process.env.MAESTRO_CONFIG,
      path.join(os.homedir(), '.config', 'maestro', 'config.json'),
      path.join(bundleRoot, 'maestro.config.json'),
      path.join(bundleRoot, 'maestro.config.example.json'),
    ];
    for (const c of candidates) {
      const found = tryRead(c);
      if (found) { cfg = deepMerge(DEFAULTS, found); break; }
    }
  } catch {
    // fail-open: keep DEFAULTS
  }
  return cfg;
}

// Read hook stdin as JSON. Fail-open to {}.
export function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    try {
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (d) => { raw += d; });
      process.stdin.on('end', () => {
        try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
      });
      process.stdin.on('error', () => resolve({}));
    } catch {
      resolve({});
    }
  });
}
