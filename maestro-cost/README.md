# maestro-cost

**Hook:** `PostLLMCall` · **Action:** token/cost telemetry.

After each model call it appends one JSONL line to a ledger (default
`~/.local/share/maestro/cost-ledger.jsonl`, configurable via `cost.ledgerPath`):
timestamp, session id, model, input/output/reasoning tokens, cache-hit %, and an
estimated cost from a configurable per-model rate table (`cost.rates`, USD per 1M
tokens; unknown models cost 0). Near-zero overhead, non-blocking, fail-open.

Report:

```bash
node maestro-cost/report.mjs            # sums today / all-time and per-model
node maestro-cost/report.mjs /path/to/cost-ledger.jsonl
```

Or a quick `jq` one-liner for today's spend:

```bash
jq -rs 'map(select(.ts|startswith(now|strftime("%Y-%m-%d"))))|map(.est_cost_usd)|add' \
  ~/.local/share/maestro/cost-ledger.jsonl
```
