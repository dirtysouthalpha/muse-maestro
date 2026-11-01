// Every maestro-*/.muse-plugin/plugin.json parses and carries the fields the
// hooks / installer rely on, and every hook command points at a real script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, PLUGIN_DIRS, readJson } from './helpers.mjs';

const EVENTS = new Set(['PreToolUse', 'PostToolUse', 'Stop', 'SessionStart', 'SessionEnd', 'PreCompact', 'PreLLMCall', 'PostLLMCall']);

test('seven maestro-* plugin directories exist and match install.sh', () => {
  assert.equal(PLUGIN_DIRS.length, 7, PLUGIN_DIRS.join(','));
  const sh = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8');
  const m = sh.match(/^PLUGINS=\(([^)]*)\)/m);
  assert.ok(m, 'install.sh declares PLUGINS=(...)');
  assert.deepEqual(m[1].trim().split(/\s+/).sort(), PLUGIN_DIRS);
});

for (const dir of PLUGIN_DIRS) {
  test(`${dir}/.muse-plugin/plugin.json is a valid native Muse manifest`, () => {
    const pj = readJson(`${dir}/.muse-plugin/plugin.json`);
    assert.equal(pj.schemaVersion, 1);
    assert.equal(pj.name, dir, 'manifest name matches directory');
    assert.equal(typeof pj.displayName, 'string');
    assert.match(pj.version, /^\d+\.\d+\.\d+$/);
    assert.equal(typeof pj.description, 'string');
    assert.deepEqual(pj.compat, { source: 'native', manifestDir: '.muse-plugin' });
    const caps = pj.capabilities;
    for (const k of ['skills', 'commands', 'hooks', 'mcpServers', 'reminders']) {
      assert.ok(Array.isArray(caps[k]), `capabilities.${k} is an array`);
    }
    assert.ok(caps.hooks.length >= 1, 'at least one hook');
    const ids = new Set();
    for (const h of caps.hooks) {
      assert.equal(typeof h.id, 'string');
      assert.ok(!ids.has(h.id), `hook id ${h.id} unique`);
      ids.add(h.id);
      assert.ok(EVENTS.has(h.event), `known event: ${h.event}`);
      assert.deepEqual(h.command.slice(0, 1), ['node']);
      const script = path.join(ROOT, dir, h.command[1]);
      assert.ok(fs.existsSync(script), `hook script exists: ${script}`);
      assert.ok(Number.isInteger(h.timeoutMs) && h.timeoutMs > 0);
      assert.equal(typeof h.statusMessage, 'string');
    }
  });

  test(`${dir}/hooks/maestro-config.mjs is identical to the shared copy`, () => {
    const ref = fs.readFileSync(path.join(ROOT, 'maestro-guardrail/hooks/maestro-config.mjs'), 'utf8');
    const mine = fs.readFileSync(path.join(ROOT, dir, 'hooks/maestro-config.mjs'), 'utf8');
    assert.equal(mine, ref);
  });
}
