#!/usr/bin/env bash
# Maestro installer — installs and approves each Maestro plugin into Muse Code.
#
# Muse requires two steps per plugin:
#   1) muse plugins install <dir>   (adds it to the local cache)
#   2) muse plugins approve <id>    (trusts the hooks so they run at runtime)
# New/changed hooks land in "review_needed" until approved — this script does both.
#
# It also deploys your local config (if present) to ~/.config/maestro/config.json
# so the installed plugins read your real settings.
#
# Usage:
#   ./install.sh              # install + approve all plugins
#   ./install.sh --uninstall  # remove all Maestro plugins
#   MUSE=/path/to/muse ./install.sh   # use a specific muse binary

set -uo pipefail

MUSE="${MUSE:-muse}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGINS=(maestro-guardrail maestro-brain maestro-doneproof maestro-session-watch maestro-instinct maestro-secrets maestro-cost)

if ! command -v "$MUSE" >/dev/null 2>&1; then
  echo "error: '$MUSE' not found on PATH. Set MUSE=/path/to/muse and retry." >&2
  exit 1
fi

if [[ "${1:-}" == "--uninstall" ]]; then
  for p in "${PLUGINS[@]}"; do
    echo ">> removing $p"
    "$MUSE" plugins remove "$p" 2>/dev/null || true
  done
  echo "Done. (Your ~/.config/maestro/config.json was left in place.)"
  exit 0
fi

# 1) Deploy local config to the canonical live location, if present.
CFG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/maestro"
mkdir -p "$CFG_DIR"
if [[ -f "$ROOT/maestro.config.json" ]]; then
  cp "$ROOT/maestro.config.json" "$CFG_DIR/config.json"
  echo ">> deployed local maestro.config.json -> $CFG_DIR/config.json"
elif [[ ! -f "$CFG_DIR/config.json" ]]; then
  cp "$ROOT/maestro.config.example.json" "$CFG_DIR/config.json"
  echo ">> no local config found; seeded example -> $CFG_DIR/config.json (edit to taste)"
else
  echo ">> keeping existing $CFG_DIR/config.json"
fi

# 2) Install + approve each plugin.
fail=0
for p in "${PLUGINS[@]}"; do
  dir="$ROOT/$p"
  [[ -d "$dir" ]] || { echo "!! skip $p (missing dir)"; continue; }
  echo ">> validating $p"
  if ! "$MUSE" plugins validate "$dir" >/dev/null 2>&1; then
    echo "!! $p failed validation; skipping"; fail=1; continue
  fi
  echo ">> installing $p"
  "$MUSE" plugins install "$dir" >/dev/null 2>&1 || { echo "!! install failed for $p"; fail=1; continue; }
  echo ">> approving $p hooks"
  "$MUSE" plugins approve "$p" >/dev/null 2>&1 || echo "   (nothing to approve or already approved)"
done

echo
"$MUSE" plugins list 2>/dev/null | grep -E 'maestro' || true
echo
if [[ "$fail" == "0" ]]; then
  echo "Maestro installed. Uninstall any time with: ./install.sh --uninstall"
else
  echo "Maestro installed with warnings (see above)."
fi
