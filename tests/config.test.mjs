// maestro-config.mjs: the example config loads and deep-merges over DEFAULTS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, readJson } from './helpers.mjs';
import { DEFAULTS, loadConfig } from '../maestro-guardrail/hooks/maestro-config.mjs';

function withConfigEnv(file, fn) {
  const prev = process.env.MAESTRO_CONFIG;
  process.env.MAESTRO_CONFIG = file;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.MAESTRO_CONFIG; else process.env.MAESTRO_CONFIG = prev;
  }
}

test('maestro.config.example.json parses and only uses known top-level sections', () => {
  const ex = readJson('maestro.config.example.json');
  for (const k of Object.keys(ex)) {
    if (k.startsWith('$')) continue;
    assert.ok(k in DEFAULTS, `unknown section ${k}`);
  }
  assert.equal(ex.brain.enabled, false, 'brain ships disabled');
  assert.equal(ex.instinct.enabled, false, 'instinct ships disabled');
  assert.deepEqual(ex.guardrail.extraDenyRules, []);
});

test('loadConfig honors $MAESTRO_CONFIG and merges the example over DEFAULTS', () => {
  withConfigEnv(path.join(ROOT, 'maestro.config.example.json'), () => {
    const cfg = loadConfig();
    assert.equal(cfg.brain.source, 'muse-maestro');
    assert.equal(cfg.sessionWatch.bytesWarn, 2000000);
    // Keys the example omits fall back to DEFAULTS (deep merge, not replace).
    assert.equal(cfg.secrets.scanLLM, DEFAULTS.secrets.scanLLM);
    assert.equal(cfg.secrets.highEntropy, DEFAULTS.secrets.highEntropy);
    for (const k of Object.keys(DEFAULTS)) assert.ok(k in cfg, `section ${k} present`);
  });
});

test('loadConfig deep-merges a partial user override', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cfg-'));
  const file = path.join(tmp, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ sessionWatch: { bytesWarn: 1 }, guardrail: { extraDenyRules: [{ id: 'z', pattern: 'z' }] } }));
  try {
    withConfigEnv(file, () => {
      const cfg = loadConfig();
      assert.equal(cfg.sessionWatch.bytesWarn, 1);
      assert.equal(cfg.sessionWatch.tokensWarn, DEFAULTS.sessionWatch.tokensWarn);
      assert.equal(cfg.guardrail.enabled, true);
      assert.equal(cfg.guardrail.extraDenyRules.length, 1);
      assert.deepEqual(DEFAULTS.guardrail.extraDenyRules, [], 'DEFAULTS not mutated');
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('loadConfig fails open to DEFAULTS when the pointed-at file is garbage', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-cfg-'));
  const file = path.join(tmp, 'config.json');
  fs.writeFileSync(file, '{ not json');
  try {
    withConfigEnv(file, () => {
      const cfg = loadConfig();
      assert.equal(typeof cfg.guardrail.enabled, 'boolean');
      assert.equal(cfg.doneproof.overridePhrase, DEFAULTS.doneproof.overridePhrase);
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
