(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RehabBudget = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  function number(value, label, positive = false) {
    if (value === '' || value === null || value === undefined || typeof value === 'boolean') {
      throw new Error(`${label} is required.`);
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || (positive && n === 0)) {
      throw new Error(`${label} must be ${positive ? 'greater than zero' : 'zero or greater'}.`);
    }
    return n;
  }
  function hipshot(value) {
    const amount = round(number(value, 'Rehab budget'));
    if (!Number.isSafeInteger(Math.round(amount * 110))) throw new Error('Rehab budget is too large.');
    return { amount, low: round(amount * 0.9), high: round(amount * 1.1) };
  }
  // All deal math lives in deal-model.js; this keeps the original call shape working.
  const Model = (typeof module === 'object' && module.exports) ? require('./deal-model.js')
    : (typeof globalThis !== 'undefined' ? globalThis.DealModel : undefined);
  function evaluate({ listPrice, arv, rehabTotal, wantedProfit, assumptions }) {
    if (!Model) throw new Error('The deal calculator could not load.');
    const a = Object.assign({}, assumptions || {});
    if (wantedProfit !== undefined) a.targetProfit = wantedProfit;
    const d = Model.evaluate({ purchasePrice: listPrice, arv, rehab: rehabTotal, assumptions: a });
    d.allInCost = d.totalCost;
    return d;
  }
  function key(address) {
    return 'kytalyst-hipshot-v2:' + String(address).trim().toLowerCase().replace(/\s+/g, ' ');
  }
  function restore(raw) {
    if (!raw || raw.version !== 2) throw new Error('Invalid saved Hipshot.');
    if (raw.amount === '') return { amount: '' };
    return { amount: hipshot(raw.amount).amount };
  }
  return { hipshot, evaluate, key, restore };
});
