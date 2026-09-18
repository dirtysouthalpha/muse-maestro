#!/usr/bin/env node
// maestro-session-watch PostToolUse entry — advisory size warning.
import { evaluate, readStdinSync, emitContext } from './watch-core.mjs';
try {
  const event = readStdinSync();
  const warn = evaluate(event);
  if (warn) emitContext('PostToolUse', warn);
} catch { /* fail-open */ }
process.exit(0);
