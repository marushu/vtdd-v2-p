import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const doc = readFileSync(
  new URL('../docs/security/setup-wizard-meaning-first-contract.md', import.meta.url),
  'utf8'
);

test('setup wizard meaning-first contract defines wizard as meaning-preserving and coherent', () => {
  assert.equal(doc.includes('Preserve Meaning At Every Step'), true);
  assert.equal(doc.includes('Keep The Human On One Coherent Path'), true);
  assert.equal(doc.includes('Hide Cross-Service Wiring As Much As Possible'), true);
  assert.equal(doc.includes('Make Success Legible'), true);
});

test('setup wizard meaning-first contract states current VTDD setup is not yet a full wizard', () => {
  assert.equal(doc.includes('Current VTDD setup is not yet a full wizard.'), true);
  assert.equal(doc.includes('better described as a bounded bootstrap'), true);
  assert.equal(doc.includes('GitHub App creation'), true);
  assert.equal(doc.includes('Cloudflare bootstrap token management'), true);
});

test('setup wizard meaning-first contract fixes future acceptance criteria around meaning and continuity', () => {
  assert.equal(doc.includes('The human can tell what VTDD is doing now and why.'), true);
  assert.equal(doc.includes('A required external redirect is narrated before and after the jump.'), true);
  assert.equal(doc.includes('VTDD status surfaces explain connection state in user terms first, operator'), true);
});
