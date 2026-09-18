// watch-core.mjs — shared logic for maestro-session-watch.
//
// Guards the failure mode where a Muse session transcript grows unbounded
// (a real incident hit ~5.9 MB / ~1.7M tokens and broke the session). It warns,
// non-blocking, when the transcript crosses a size/token threshold and suggests
// checkpointing into a fresh session.
//
// Muse stores each session transcript at:
//   <data>/muse/sessions/YYYY/MM/DD/<session_id>/session.jsonl
// We locate it by session_id, stat its size, and estimate tokens from bytes.
//
// Advisory only: context is injected via hookSpecificOutput.additionalContext
// (valid for PostToolUse and PreCompact). To avoid spamming on every tool call,
// we stamp the session dir once per crossed threshold band. Fully FAIL-OPEN.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from './maestro-config.mjs';

function sessionsRoot() {
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg && xdg.trim() ? xdg : path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'muse', 'sessions');
}

// Find <root>/YYYY/MM/DD/<session_id>/session.jsonl without a full recursive walk.
function findTranscript(sessionId) {
  if (!sessionId) return null;
  const root = sessionsRoot();
  try {
    for (const y of safeDirs(root)) {
      for (const m of safeDirs(path.join(root, y))) {
        for (const d of safeDirs(path.join(root, y, m))) {
          const cand = path.join(root, y, m, d, sessionId, 'session.jsonl');
          if (fs.existsSync(cand)) return cand;
        }
      }
    }
  } catch {}
  return null;
}

function safeDirs(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^[0-9]/.test(e.name))
      .map((e) => e.name);
  } catch { return []; }
}

export function evaluate(event) {
  const cfg = loadConfig();
  const sw = cfg.sessionWatch || {};
  if (sw.enabled === false) return null;

  const transcript = findTranscript(event && event.session_id);
  if (!transcript) return null;

  let bytes = 0;
  try { bytes = fs.statSync(transcript).size; } catch { return null; }

  const bpt = sw.bytesPerToken || 4;
  const estTokens = Math.round(bytes / bpt);
  const bytesWarn = sw.bytesWarn || 2000000;
  const tokensWarn = sw.tokensWarn || 150000;

  const crossed = bytes >= bytesWarn || estTokens >= tokensWarn;
  if (!crossed) return null;

  // Debounce: one warning per band (band = floor(bytes / bytesWarn)).
  const band = Math.floor(bytes / bytesWarn) || 1;
  try {
    const stamp = path.join(path.dirname(transcript), '.maestro-watch-band');
    let prev = 0;
    try { prev = parseInt(fs.readFileSync(stamp, 'utf8'), 10) || 0; } catch {}
    if (prev >= band) return null; // already warned at/above this band
    fs.writeFileSync(stamp, String(band));
  } catch {
    // if we cannot stamp, still warn (better a repeat than silence)
  }

  const mb = (bytes / 1e6).toFixed(1);
  const kt = Math.round(estTokens / 1000);
  return `maestro-session-watch: this session transcript is ~${mb} MB (~${kt}k est. tokens), past the ${(bytesWarn / 1e6).toFixed(1)} MB / ${Math.round(tokensWarn / 1000)}k guardrail. Long transcripts slow every turn and risk context blowout. Consider checkpointing your state and starting a FRESH session (\`muse\` new session, or \`muse resume\` a trimmed one) before continuing.`;
}

export function readStdinSync() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

export function emitContext(eventName, text) {
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: eventName, additionalContext: text },
    }));
  } catch {}
}
