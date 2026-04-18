import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const doc = readFileSync(new URL('../docs/security/bootstrap-automation-model.md', import.meta.url), 'utf8');

test('bootstrap automation model treats setup wizard as core and splits auth layers', () => {
  assert.equal(doc.includes('Setup Wizard Is Core'), true);
  assert.equal(doc.includes('VTDD service access'), true);
  assert.equal(doc.includes('operator bootstrap authority'), true);
  assert.equal(doc.includes('external account connection'), true);
  assert.equal(doc.includes('runtime machine auth'), true);
});

test('bootstrap automation model records manifest 403 as connection-boundary problem', () => {
  assert.equal(doc.includes('github_app_manifest_conversion_failed'), true);
  assert.equal(doc.includes('403'), true);
  assert.equal(doc.includes('missing piece is the auth source for manifest conversion'), true);
});
