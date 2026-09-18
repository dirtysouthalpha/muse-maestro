// instinct-core.mjs — shared logic for maestro-instinct.
//
// Before high-risk work (cron / GPU / host-fact / model-server), consult a
// learned-ops memory command you configure and surface its top output to the
// model as additional context. Ships DISABLED and command-less; set
// instinct.command in your maestro config to enable.
//
// The configured command is an argv array; the context string is appended as a
// final argument, e.g. ["python3","/path/instinct.py","inject"] + "<context>".
// Output is injected via hookSpecificOutput.additionalContext (valid for
// SessionStart and PreToolUse). Bounded to instinct.timeoutMs (<2s default),
// silent when empty or on any error. Fully FAIL-OPEN.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { loadConfig } from './maestro-config.mjs';

export function readStdinSync() {
  try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { return {}; }
}

export function inject(context) {
  const cfg = loadConfig();
  const ins = cfg.instinct || {};
  if (!ins.enabled) return null;
  if (!Array.isArray(ins.command) || ins.command.length === 0) return null;

  const argv = ins.command.slice();
  const prog = argv.shift();
  argv.push(String(context || '').slice(0, 400));

  try {
    const res = spawnSync(prog, argv, {
      timeout: ins.timeoutMs || 2000,
      encoding: 'utf8',
      maxBuffer: 256 * 1024,
    });
    if (!res || res.status !== 0) return null;
    const out = (res.stdout || '').trim();
    if (!out) return null;
    return out.slice(0, 4000);
  } catch {
    return null;
  }
}

export function shouldTriggerForCommand(cfg, text) {
  try {
    const pat = (cfg.instinct && cfg.instinct.triggerPattern) || '';
    if (!pat || !text) return false;
    return new RegExp(pat, 'i').test(text);
  } catch { return false; }
}

export function emitContext(eventName, text) {
  try {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: eventName, additionalContext: text },
    }));
  } catch {}
}
