const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRefundMethod, formatRefundMethodLabel } = require('../utils/refund-methods');

test('normalizes refund methods and preserves store credit when deducting from due', () => {
  assert.equal(normalizeRefundMethod('Card'), 'card');
  assert.equal(normalizeRefundMethod('unknown'), 'cash');
  assert.equal(normalizeRefundMethod('', { deductFromDue: true }), 'store_credit');
  assert.equal(normalizeRefundMethod('cash', { deductFromDue: true }), 'store_credit');
});

test('formats refund method labels for display', () => {
  assert.equal(formatRefundMethodLabel('mobile_pay'), 'Mobile Pay');
  assert.equal(formatRefundMethodLabel('store_credit'), 'Store Credit');
  assert.equal(formatRefundMethodLabel('', { deductFromDue: true }), 'Store Credit');
});
