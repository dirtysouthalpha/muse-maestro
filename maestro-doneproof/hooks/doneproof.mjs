#!/usr/bin/env node
// maestro-doneproof — Stop hook that refuses an unproven success claim.
//
// If the final message claims success ("done"/"fixed"/"passing"/"complete"/
// "verified"/"works now"/...) WITHOUT any evidence line, it blocks the stop and
// asks for evidence. Lightweight; an override phrase lets you stop anyway.
//
// Contract (verified on Muse Code 1.3.0): Stop stdin includes
//   { hook_event_name:"Stop", last_assistant_message, stop_hook_active, ... }
// Block the stop with: {"decision":"block","reason":"..."}.
// IMPORTANT: when stop_hook_active is true we already blocked once this turn --
// blocking again would loop, so we allow. Fully FAIL-OPEN.

import { loadConfig, readStdin } from './maestro-config.mjs';

async function main() {
  const event = await readStdin();
  const cfg = loadConfig();
  const dp = cfg.doneproof || {};
  if (dp.enabled === false) process.exit(0);

  // Never loop: if we already blocked this turn, let it stop.
  if (event && event.stop_hook_active === true) process.exit(0);

  const msg = event && typeof event.last_assistant_message === 'string'
    ? event.last_assistant_message : '';
  if (!msg) process.exit(0);

  const override = dp.overridePhrase || '[skip-doneproof]';
  if (override && msg.includes(override)) process.exit(0);

  let claimRe, evidenceRe;
  try { claimRe = new RegExp(dp.claimPattern, 'i'); } catch { claimRe = /\b(done|fixed|passing|complete|verified|works now)\b/i; }
  try { evidenceRe = new RegExp(dp.evidencePattern, 'i'); } catch { evidenceRe = /(evidence|exit code|tests? passed|output:)/i; }

  const claims = claimRe.test(msg);
  const hasEvidence = evidenceRe.test(msg);

  if (claims && !hasEvidence) {
    const reason =
      'maestro-doneproof: you claimed success but provided no EVIDENCE. Before stopping, show the proof — ' +
      'the command you ran and its exit code / output, the test result, the file you re-read, or the URL that responded. ' +
      `If the claim is genuinely trivial and no evidence applies, restate it including the phrase "${override}" to stop.`;
    try {
      process.stdout.write(JSON.stringify({ decision: 'block', reason }));
    } catch {}
    process.exit(0);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
