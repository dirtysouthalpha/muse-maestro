#!/usr/bin/env node
// maestro-instinct SessionStart entry — surface general learned-ops instincts.
import { inject, emitContext } from './instinct-core.mjs';
try {
  const text = inject('session start: general fleet/ops instincts before work begins');
  if (text) emitContext('SessionStart', 'Learned-ops instincts:\n' + text);
} catch { /* fail-open */ }
process.exit(0);
