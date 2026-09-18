#!/usr/bin/env node
// maestro-cost report — sum the cost ledger by day and by model.
// Usage: node maestro-cost/report.mjs [path-to-ledger.jsonl]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv[2];
const lp = argv || path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'maestro', 'cost-ledger.jsonl');
let lines = [];
try { lines = fs.readFileSync(lp, 'utf8').trim().split('\n').filter(Boolean); }
catch { console.error(`no ledger at ${lp}`); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
const byModel = {};
let allCost = 0, allIn = 0, allOut = 0, todayCost = 0, calls = 0;
for (const l of lines) {
  let r; try { r = JSON.parse(l); } catch { continue; }
  calls++;
  const c = r.est_cost_usd || 0;
  allCost += c; allIn += r.input_tokens || 0; allOut += r.output_tokens || 0;
  if ((r.ts || '').slice(0, 10) === today) todayCost += c;
  const m = r.model || 'unknown';
  byModel[m] = byModel[m] || { calls: 0, in: 0, out: 0, cost: 0 };
  byModel[m].calls++; byModel[m].in += r.input_tokens || 0;
  byModel[m].out += r.output_tokens || 0; byModel[m].cost += c;
}
console.log(`Maestro cost ledger: ${lp}`);
console.log(`calls=${calls}  in=${allIn}  out=${allOut}  all-time=$${allCost.toFixed(4)}  today=$${todayCost.toFixed(4)}`);
console.log('per-model:');
for (const [m, v] of Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost)) {
  console.log(`  ${m.padEnd(22)} calls=${String(v.calls).padStart(4)}  in=${String(v.in).padStart(9)}  out=${String(v.out).padStart(8)}  $${v.cost.toFixed(4)}`);
}
