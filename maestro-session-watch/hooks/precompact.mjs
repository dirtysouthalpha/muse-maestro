#!/usr/bin/env node
// maestro-session-watch PreCompact entry — advisory size warning at compaction.
import { evaluate, readStdinSync, emitContext } from './watch-core.mjs';
try {
  const event = readStdinSync();
  const warn = evaluate(event);
  if (warn) emitContext('PreCompact', warn);
} catch { /* fail-open */ }
process.exit(0);
