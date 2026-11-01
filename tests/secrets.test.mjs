// secrets-core.mjs: fake credential shapes are detected and redacted, and the
// redacted output never carries the original value. All values below are
// synthetic and assembled at runtime so no secret-shaped literal sits in the tree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan, redact, textFromMessages } from '../maestro-secrets/hooks/secrets-core.mjs';
import { DEFAULTS } from '../maestro-secrets/hooks/maestro-config.mjs';

const FAKE_AWS = 'AKIA' + 'EXAMPLEKEY0000AB';
const FAKE_GH = 'ghp_' + 'a'.repeat(36);
const FAKE_SLACK = 'xoxb-' + '0123456789-abcdefghij';
const FAKE_JWT = ['eyJ' + 'abcdefghij', 'klmnopqrst', 'uvwxyz0123'].join('.');
const FAKE_PEM = ['-----BEGIN', 'RSA', 'PRIVATE', 'KEY-----'].join(' ');
const FAKE_ENV_VAL = 'zq9v8w7x6y5t4r3e';

const CASES = [
  ['aws-access-key', `aws configure set aws_access_key_id ${FAKE_AWS}`, FAKE_AWS],
  ['github-token', `export GH=${FAKE_GH}`, FAKE_GH],
  ['slack-token', `curl -H "x: ${FAKE_SLACK}"`, FAKE_SLACK],
  ['jwt', `auth ${FAKE_JWT} ok`, FAKE_JWT],
  ['private-key', `${FAKE_PEM}\nMIIE...`, FAKE_PEM],
  ['env-secret', `API_TOKEN=${FAKE_ENV_VAL}`, FAKE_ENV_VAL],
];

for (const [kind, text, raw] of CASES) {
  test(`scan + redact: ${kind}`, () => {
    const hits = scan(text, DEFAULTS);
    assert.ok(hits.some((h) => h.kind === kind), `kind ${kind} in ${JSON.stringify(hits)}`);
    for (const h of hits) assert.deepEqual(Object.keys(h).sort(), ['id', 'kind'], 'scan never returns values');
    const out = redact(text, DEFAULTS);
    assert.ok(!out.includes(raw), 'raw value removed');
    assert.match(out, new RegExp(`\\[REDACTED:${kind}\\]`));
  });
}

test('placeholders in KEY=value are not flagged', () => {
  assert.deepEqual(scan('API_TOKEN=changeme', DEFAULTS), []);
  assert.deepEqual(scan('SECRET=<your-secret>', DEFAULTS), []);
  assert.equal(redact('API_TOKEN=changeme', DEFAULTS), 'API_TOKEN=changeme');
});

test('clean text yields no hits and is returned unchanged', () => {
  const t = 'git commit -m "fix: typo" && npm test';
  assert.deepEqual(scan(t, DEFAULTS), []);
  assert.equal(redact(t, DEFAULTS), t);
  assert.deepEqual(scan('', DEFAULTS), []);
});

test('allowlist suppresses a deliberately-public value', () => {
  const cfg = { ...DEFAULTS, secrets: { ...DEFAULTS.secrets, allowlist: [FAKE_GH] } };
  assert.deepEqual(scan(`token ${FAKE_GH}`, cfg), []);
  assert.equal(redact(`token ${FAKE_GH}`, cfg), `token ${FAKE_GH}`);
});

test('extraDetectors from config are honored', () => {
  const cfg = { ...DEFAULTS, secrets: { ...DEFAULTS.secrets, extraDetectors: [{ id: 'acme', kind: 'acme-token', pattern: '\\bACME_[A-Z0-9]{12}\\b', flags: '' }] } };
  const t = 'use ACME_ABCDEF123456 here';
  assert.ok(scan(t, cfg).some((h) => h.kind === 'acme-token'));
  assert.equal(redact(t, cfg), 'use [REDACTED:acme-token] here');
});

test('textFromMessages flattens string and block content', () => {
  const msgs = [{ content: 'hello' }, { content: [{ type: 'text', text: 'world' }, { type: 'tool_use', input: { k: 1 } }] }];
  const t = textFromMessages(msgs);
  assert.match(t, /hello/);
  assert.match(t, /world/);
  assert.match(t, /"k":1/);
  assert.equal(textFromMessages(null), '');
});
