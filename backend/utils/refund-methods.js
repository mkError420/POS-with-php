const REFUND_METHODS = ['cash', 'card', 'mobile_pay', 'bank_transfer', 'store_credit'];

function normalizeRefundMethod(value, options = {}) {
  const rawValue = (value || '').toString().trim().toLowerCase();
  const deductFromDue = Boolean(options.deductFromDue);

  if (deductFromDue || rawValue === 'store_credit') {
    return 'store_credit';
  }

  if (rawValue === 'card') return 'card';
  if (rawValue === 'mobile_pay' || rawValue === 'mobile-pay' || rawValue === 'mobile pay') return 'mobile_pay';
  if (rawValue === 'bank_transfer' || rawValue === 'bank-transfer' || rawValue === 'bank transfer') return 'bank_transfer';

  return 'cash';
}

function formatRefundMethodLabel(value, options = {}) {
  const normalized = normalizeRefundMethod(value, options);

  switch (normalized) {
    case 'card':
      return 'Card';
    case 'mobile_pay':
      return 'Mobile Pay';
    case 'bank_transfer':
      return 'Bank Transfer';
    case 'store_credit':
      return 'Store Credit';
    default:
      return 'Cash';
  }
}

module.exports = {
  REFUND_METHODS,
  normalizeRefundMethod,
  formatRefundMethodLabel
};
