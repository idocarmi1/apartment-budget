const test = require('node:test');
const assert = require('node:assert/strict');
const { parseQuickExpense } = require('../src/parser');

const today = new Date('2026-08-24T10:00:00Z');

test('מפענח 250 סופר', () => {
  const parsed = parseQuickExpense('250 סופר', today);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.amountCents, 25000);
  assert.equal(parsed.category, 'סופר');
  assert.equal(parsed.description, 'סופר');
});

test('מפענח סופר 250', () => {
  const parsed = parseQuickExpense('סופר 250', today);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.amountCents, 25000);
  assert.equal(parsed.category, 'סופר');
});

test('מפענח סכום עשרוני', () => {
  const parsed = parseQuickExpense('89.90 סופר', today);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.amountCents, 8990);
});
