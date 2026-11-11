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
  function evaluate({ listPrice, arv, rehabTotal, wantedProfit = 20000 }) {
    const price = number(listPrice, 'Purchase price', true);
    const value = number(arv, 'ARV', true);
    const rehab = number(rehabTotal, 'Rehab total');
    const target = number(wantedProfit, 'Target profit');
    const closingRate = 0.035;
    const sellingCosts = value * (0.0125 + 0.03 + 0.06);
    const allInCost = price + rehab + price * closingRate;
    const projectedProfit = value - sellingCosts - allInCost;
    // Acquisition closing costs scale with the offered price, not the asking price.
    const mao = (value - sellingCosts - rehab - target) / (1 + closingRate);
    return { projectedProfit: round(projectedProfit), isDeal: projectedProfit >= target,
      mao: round(mao), allInCost: round(allInCost) };
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
