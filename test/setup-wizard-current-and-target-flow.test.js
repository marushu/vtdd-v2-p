import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const doc = readFileSync(
  new URL('../docs/mvp/setup-wizard-current-and-target-flow.md', import.meta.url),
  'utf8'
);

test('setup wizard current and target flow defines system roles across wizard, github, and cloudflare', () => {
  assert.equal(doc.includes('### Setup Wizard'), true);
  assert.equal(doc.includes('### GitHub App'), true);
  assert.equal(doc.includes('### Cloudflare Worker Runtime'), true);
  assert.equal(doc.includes('GitHub provides:'), true);
  assert.equal(doc.includes('Cloudflare provides:'), true);
});

test('setup wizard current and target flow explains current flow and why both services appear', () => {
  assert.equal(doc.includes('Today, setup wizard is helping VTDD acquire a GitHub execution identity'), true);
  assert.equal(doc.includes('### Phase 3: Start GitHub App Bootstrap'), true);
  assert.equal(doc.includes('### Phase 5: Store Runtime Secrets On Cloudflare'), true);
  assert.equal(doc.includes('desired success state is "VTDD can now do real GitHub work safely"'), true);
});

test('setup wizard current and target flow records manual debt, target flow, and tracked gaps', () => {
  assert.equal(doc.includes('Current Manual Debt'), true);
  assert.equal(doc.includes('Target Flow'), true);
  assert.equal(doc.includes('Issue #206'), true);
  assert.equal(doc.includes('Issue #207'), true);
  assert.equal(doc.includes('Issue #210'), true);
  assert.equal(doc.includes('Definition Of Done For Wizard Completion'), true);
});
