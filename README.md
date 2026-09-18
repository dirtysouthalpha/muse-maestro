# Maestro

**A safety-and-sanity plugin suite for [Meta Muse Code](https://github.com/facebookresearch) (Muse Spark 1.3) — the terminal coding agent.**

![license](https://img.shields.io/badge/license-MIT-blue)
![muse](https://img.shields.io/badge/Muse%20Code-1.3-black)
![plugins](https://img.shields.io/badge/plugins-7-green)
![status](https://img.shields.io/badge/hooks-native%20.muse--plugin-orange)

Fast agents are wonderful right up until they aren't. Run a coding agent with
approvals off (`--yolo`) and you trade every confirmation prompt for speed — and
for risk. Maestro is the seatbelt: five small, native Muse plugins that add a
safety floor and a few good habits **without slowing the agent down**.

---

## The problems Maestro solves

| Problem | Plugin |
| --- | --- |
| A `--yolo` agent has **no safety floor** — one bad command can wipe a disk, a home dir, or force-push over `main`. | **maestro-guardrail** |
| Agents announce **"done" / "fixed" / "all tests pass"** without ever showing proof. | **maestro-doneproof** |
| A session transcript grows **unbounded** until it blows the context window and the session dies. | **maestro-session-watch** |
| Hard-won **ops lessons are forgotten** every new session. | **maestro-instinct** |
| Durable facts a session discovers **vanish** when it ends. | **maestro-brain** |
| A **secret** (token, key, private cert) gets echoed into the transcript or sent to the model. | **maestro-secrets** |
| You have **no idea what a session cost** in tokens or dollars. | **maestro-cost** |

Every plugin is **pure Node, fail-open** (if the plugin errors it gets out of
the way — it never blocks your agent because of its own bug), and adds only a
few tens of milliseconds per event.

---

## The plugins

### 1. maestro-guardrail — the safety floor (`PreToolUse`)
Denies **only catastrophic, irreversible** operations and lets everything else
run at full speed. Shipped universal deny-list (extend it in one JSON file):

- recursive deletes targeting `/`, `~`, `$HOME`, or a system directory (`/etc`, `/usr`, `/boot`, `/var`, …)
- `rm --no-preserve-root`
- fork bombs (`:(){ :|:& };:` and named variants)
- `mkfs` / `dd of=/dev/…` / `wipefs` / redirecting onto a block device
- piping a downloaded script straight into a shell (`curl … | bash`)
- `chmod 777` / recursive `chown` on system directories
- `git push --force` to a protected branch (`main` / `master` / `release` / `prod`)

It returns a clear reason on a deny and **stays silent on everything else**
(silence is how Muse's `PreToolUse` contract expresses "allow"). The deny list
lives in [`maestro-guardrail/data/denylist.json`](maestro-guardrail/data/denylist.json);
add your own site rules via `guardrail.extraDenyRules` in your config.

### 2. maestro-doneproof — proof before "done" (`Stop`)
If the final message claims success (`done`, `fixed`, `passing`, `complete`,
`verified`, `works now`, …) **without any evidence** (a command + exit code,
a test result, a re-read file, a URL that responded), it **blocks the stop** and
asks for proof. Trivial claims can stop anyway by including an override phrase
(default `[skip-doneproof]`). It never loops — once it has blocked a turn it lets
the next stop through.

### 3. maestro-session-watch — don't blow the context (`PostToolUse` + `PreCompact`)
Watches the on-disk session transcript and **warns once** (non-blocking) when it
crosses ~2 MB / ~150k estimated tokens, suggesting you checkpoint and start a
fresh session before the window blows. Thresholds are configurable.

### 4. maestro-instinct — remember the ops scars (`SessionStart` + `PreToolUse`)
Before risky work (cron, GPU, host facts, model servers) it calls a
**learned-ops memory command you configure** and surfaces the top results to the
model as context. Ships **disabled**; point `instinct.command` at any tool that
prints advice on stdin. Bounded (<2s), silent when empty.

### 5. maestro-brain — keep what you learned (`SessionEnd`)
When a session ends, it **conservatively** distills one clearly-durable fact
(topology, a fix with evidence, a "looks-like-X-but-is-Y" scar) and `POST`s it to
**any HTTP memory endpoint you choose**. Ships **disabled** (no endpoint). It
dedupes against a search endpoint first and is fully fail-open.

### 6. maestro-secrets — credential hygiene (`PreToolUse` + `PreLLMCall`)
Stops secrets from leaking (distinct from the guardrail, which stops *destruction*).
It **blocks** a tool command that carries a secret-shaped value (so a token never
lands in the transcript) and **blocks** a model call whose payload carries one (so
it never reaches the provider). Ships narrow, generic detectors — AWS keys,
GitHub/GitLab tokens, Slack/Stripe/OpenAI/Google prefixes, `Bearer`/JWT, PEM
private keys, `SECRET=…`/`TOKEN=…` assignments — extendable via config, with an
allowlist for deliberately-public values. It **never prints the matched secret**.

> Muse 1.3's hook API cannot mutate LLM-bound messages (`updatedMessages` is
> rejected), so true in-place redaction of model content isn't possible;
> maestro-secrets fails **closed** (blocks) instead — safer, since a missed
> redaction is a leak.

### 7. maestro-cost — token/cost telemetry (`PostLLMCall`)
Appends one JSONL line per model call to a ledger: tokens (in/out/reasoning),
cache-hit %, and an estimated cost from a configurable per-model rate table.
`node maestro-cost/report.mjs` sums today / all-time and per-model. Non-blocking,
near-zero overhead, fail-open.

### Considered and skipped: maestro-checkpoint
Muse already ships strong native session continuity — `muse resume` /
`muse resume --last` / `muse resume <session-ref>` (full-fidelity resume from the
per-session `session.jsonl` event log, plus a workspace session picker), the
`read-session` skill for summarizing or recovering a prior session, and
`resume-claude` / `resume-codex` / `import` for cross-agent handoff. A dedicated
checkpoint plugin would mostly duplicate that, and the one net-new idea (writing a
session summary file into your repo) risks committing session notes into your
tree. **Verdict: covered by native resume — not built.** (maestro-brain already
persists the *durable* takeaways at session end.)

---

## Install

Requires the `muse` CLI on your `PATH` and Node.js.

```bash
git clone https://github.com/<you>/muse-maestro.git
cd muse-maestro
./install.sh          # validates, installs, and APPROVES every plugin
```

> Muse loads plugin hooks only after they're **approved** (new hooks sit in
> `review_needed` until then). `install.sh` runs both `muse plugins install` and
> `muse plugins approve` for you.

Uninstall any time — fully reversible:

```bash
./install.sh --uninstall     # or: muse plugins remove maestro-guardrail (etc.)
```

Check what's installed: `muse plugins list`.

---

## Configure

All settings are optional — every plugin has safe built-in defaults. To override,
copy the example and edit:

```bash
cp maestro.config.example.json ~/.config/maestro/config.json
$EDITOR ~/.config/maestro/config.json
```

The installed hooks read `~/.config/maestro/config.json`. `install.sh` also
deploys a repo-local `maestro.config.json` there if you keep one (that filename
is **gitignored**, so your private endpoints and paths never enter git).

See [`maestro.config.example.json`](maestro.config.example.json) for every key,
including commented examples for adding your own guardrail rules (protect a NAS
share, refuse to stop specific containers, block force-pushes to a specific
remote, and so on).

```jsonc
{
  "brain":    { "enabled": false, "endpoint": "" },      // point at your memory API
  "instinct": { "enabled": false, "command": [] },       // your ops-memory tool
  "guardrail":{ "extraDenyRules": [ /* your site rules */ ] }
}
```

---

## How it works (and portability)

Maestro's plugins are **native Muse plugins** — `.muse-plugin/plugin.json`
bundles whose hooks run as Node scripts on Muse's lifecycle events. Muse's hook
input/output contract mirrors the widely-used
[Agent Plugins](https://agent-plugins.dev) hook standard (the same
`hookSpecificOutput.permissionDecision` shape used by other agents), so the
skill/MCP-style pieces are broadly portable across compatible agents.

Each hook is fail-open by construction: on any internal error it emits nothing
and exits 0, so Maestro can never be the reason your agent stalls.

---

## License

MIT © Brandon Goolsby. See [LICENSE](LICENSE).
