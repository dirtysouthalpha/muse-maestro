// install.sh passes shellcheck (skipped with a note if shellcheck is absent locally; CI installs it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

test('install.sh passes shellcheck', (t) => {
  const which = spawnSync('shellcheck', ['--version'], { encoding: 'utf8' });
  if (which.error) { t.skip('shellcheck not installed'); return; }
  const r = spawnSync('shellcheck', [path.join(ROOT, 'install.sh')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('install.sh parses under bash -n', () => {
  const r = spawnSync('bash', ['-n', path.join(ROOT, 'install.sh')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
