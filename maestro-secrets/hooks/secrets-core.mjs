// secrets-core.mjs — shared detection/redaction for maestro-secrets.
//
// Ships GENERIC, narrow, low-false-positive detectors for common credential
// shapes. It NEVER emits a matched secret value — only its kind and location.
// User-extendable via config: secrets.extraDetectors (regex list) and
// secrets.allowlist (values or regexes that are deliberately public).
//
// IMPORTANT capability note (verified on Muse Code 1.3.0): Muse's PreLLMCall
// hook does NOT support mutating the outgoing messages (`updatedMessages` is
// rejected). True in-place redaction of LLM-bound content is therefore not
// available through the hook API, so the LLM path is fail-CLOSED: it BLOCKS a
// call carrying an un-allowlisted secret rather than silently letting it pass.
// The redact() helper below is used for safe reasons/logging (kind only).

import { loadConfig } from './maestro-config.mjs';

// Each detector: { id, kind, re }. Patterns are deliberately specific.
const BUILTIN = [
  { id: 'aws-access-key', kind: 'aws-access-key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: 'aws-secret-key', kind: 'aws-secret-key', re: /\baws_secret_access_key\b\s*[=:]\s*['"]?[A-Za-z0-9/+]{40}\b/gi },
  { id: 'github-pat', kind: 'github-token', re: /\bghp_[A-Za-z0-9]{36}\b/g },
  { id: 'github-fine', kind: 'github-token', re: /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g },
  { id: 'gitlab-pat', kind: 'gitlab-token', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/g },
  { id: 'slack-token', kind: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'stripe-live', kind: 'stripe-key', re: /\b[sr]k_live_[A-Za-z0-9]{16,}\b/g },
  { id: 'openai-key', kind: 'openai-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { id: 'google-api', kind: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'bearer', kind: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*\b/gi },
  { id: 'jwt', kind: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { id: 'pem-private-key', kind: 'private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g },
  // KEY=value where KEY names a secret. Value must look real (>=8, not a placeholder).
  { id: 'env-secret-assignment', kind: 'env-secret', re: /\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY)\b\s*[=:]\s*['"]?([^\s'"#]{8,})/gi },
];

const PLACEHOLDER = /^(?:x{3,}|changeme|placeholder|your[_-]?\w+|<[^>]+>|\$\{[^}]+\}|\*{3,}|redacted|example|null|none|true|false)$/i;

function shannon(s) {
  const n = s.length;
  if (!n) return 0;
  const freq = {};
  for (const c of s) freq[c] = (freq[c] || 0) + 1;
  let h = 0;
  for (const k in freq) { const p = freq[k] / n; h -= p * Math.log2(p); }
  return h;
}

// High-entropy base64-ish blob: mixed case + digit (excludes git SHAs / hex
// checksums, which are single-case hex), length >= 40, entropy > 4.0. Off unless
// the caller enables it (kept separate to stay low-false-positive by default).
const HIGH_ENTROPY_RE = /\b(?=[A-Za-z0-9+/_-]*[a-z])(?=[A-Za-z0-9+/_-]*[A-Z])(?=[A-Za-z0-9+/_-]*[0-9])[A-Za-z0-9+/_-]{40,}={0,2}\b/g;

function buildDetectors(cfg) {
  const list = BUILTIN.slice();
  try {
    const extra = cfg.secrets && cfg.secrets.extraDetectors;
    if (Array.isArray(extra)) {
      for (const d of extra) {
        if (d && typeof d.pattern === 'string') {
          try {
            list.push({ id: d.id || 'custom', kind: d.kind || d.id || 'custom', re: new RegExp(d.pattern, (d.flags || '') + (/(g)/.test(d.flags || '') ? '' : 'g')) });
          } catch { /* skip bad user regex */ }
        }
      }
    }
  } catch {}
  return list;
}

function allowlisted(cfg, value) {
  try {
    const al = (cfg.secrets && cfg.secrets.allowlist) || [];
    for (const a of al) {
      if (typeof a !== 'string') continue;
      if (a === value) return true;
      try { if (new RegExp(a).test(value)) return true; } catch {}
    }
  } catch {}
  return false;
}

// Returns [{kind, id}] with NO raw secret values. Deduped by kind.
export function scan(text, cfgIn) {
  const cfg = cfgIn || loadConfig();
  if (!text) return [];
  const dets = buildDetectors(cfg);
  const found = new Map();
  for (const d of dets) {
    d.re.lastIndex = 0;
    let m;
    while ((m = d.re.exec(text)) !== null) {
      const val = m[1] || m[0];
      if (!val) continue;
      if (d.id === 'env-secret-assignment' && PLACEHOLDER.test(val)) continue;
      if (allowlisted(cfg, val)) continue;
      found.set(d.kind, d.id);
      if (!d.re.global) break;
    }
  }
  // Optional high-entropy sweep (opt-in).
  try {
    if (cfg.secrets && cfg.secrets.highEntropy) {
      HIGH_ENTROPY_RE.lastIndex = 0;
      let m;
      while ((m = HIGH_ENTROPY_RE.exec(text)) !== null) {
        const val = m[0];
        if (allowlisted(cfg, val)) continue;
        if (shannon(val) > 4.0) found.set('high-entropy', 'high-entropy');
      }
    }
  } catch {}
  return Array.from(found.entries()).map(([kind, id]) => ({ kind, id }));
}

// Replace detected secrets with [REDACTED:kind]. Used for safe logging/reasons,
// never to reconstruct the original. (Muse 1.3 offers no LLM-message mutation.)
export function redact(text, cfgIn) {
  const cfg = cfgIn || loadConfig();
  if (!text) return text;
  let out = text;
  for (const d of buildDetectors(cfg)) {
    try {
      out = out.replace(new RegExp(d.re.source, d.re.flags), (full, g1) => {
        const val = g1 || full;
        if (d.id === 'env-secret-assignment' && PLACEHOLDER.test(val)) return full;
        if (allowlisted(cfg, val)) return full;
        if (g1) return full.replace(g1, `[REDACTED:${d.kind}]`);
        return `[REDACTED:${d.kind}]`;
      });
    } catch {}
  }
  return out;
}

// Flatten Muse message content blocks / tool payloads into scannable text.
export function textFromMessages(messages) {
  const parts = [];
  try {
    for (const msg of messages || []) {
      const c = msg && msg.content;
      if (typeof c === 'string') parts.push(c);
      else if (Array.isArray(c)) {
        for (const blk of c) {
          if (blk && typeof blk.text === 'string') parts.push(blk.text);
          else { try { parts.push(JSON.stringify(blk)); } catch {} }
        }
      }
    }
  } catch {}
  return parts.join('\n');
}
