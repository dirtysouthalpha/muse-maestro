#!/usr/bin/env node
// maestro-instinct PreToolUse entry — targeted instincts before risky ops.
import { inject, emitContext, shouldTriggerForCommand, readStdinSync } from './instinct-core.mjs';
import { loadConfig } from './maestro-config.mjs';
try {
  const event = readStdinSync();
  const cfg = loadConfig();
  const ti = event && event.tool_input;
  const cmd = ti && typeof ti === 'object' && typeof ti.command === 'string'
    ? ti.command
    : (typeof ti === 'string' ? ti : '');
  if (cmd && shouldTriggerForCommand(cfg, cmd)) {
    const text = inject(cmd);
    if (text) emitContext('PreToolUse', 'Learned-ops instincts for this action:\n' + text);
  }
} catch { /* fail-open */ }
process.exit(0);
