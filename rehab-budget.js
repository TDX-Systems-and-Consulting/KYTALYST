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
  function item(raw) {
    const description = String(raw.description || '').trim();
    if (!description) throw new Error('Enter a description for every rehab item.');
    return {
      description,
      trade: String(raw.trade || 'General').trim(),
      unit: String(raw.unit || 'each').trim(),
      qty: number(raw.qty, 'Quantity', true),
      material: number(raw.material, 'Material cost'),
      labor: number(raw.labor, 'Labor cost'),
      other: number(raw.other, 'Other / bundled cost'),
      source: raw.source === 'JOBSpan' ? 'JOBSpan' : 'Manual',
    };
  }
  function calculate(items, contingencyPercent) {
    const percent = number(contingencyPercent, 'Contingency');
    if (percent > 100) throw new Error('Contingency must be between 0 and 100%.');
    const lines = items.map(raw => {
      const it = item(raw);
      const total = round(it.qty * (it.material + it.labor + it.other));
      if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER / 100) {
        throw new Error('Rehab item total is too large.');
      }
      return { ...it, total };
    });
    const subtotal = round(lines.reduce((sum, it) => sum + it.total, 0));
    const contingency = round(subtotal * percent / 100);
    const total = round(subtotal + contingency);
    if (!Number.isSafeInteger(Math.round(total * 100))) throw new Error('Budget total is too large.');
    return { lines, subtotal, contingency, total, contingencyPercent: percent };
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
    return 'kytalyst-rehab-v1:' + String(address).trim().toLowerCase().replace(/\s+/g, ' ');
  }
  function restore(raw) {
    if (!raw || raw.version !== 1 || !Array.isArray(raw.items)) throw new Error('Invalid saved budget.');
    const budget = calculate(raw.items, raw.contingencyPercent);
    return { items: budget.lines.map(({ total, ...it }) => it),
      contingencyPercent: budget.contingencyPercent, applied: raw.applied === true && raw.items.length > 0 };
  }
  return { item, calculate, evaluate, key, restore };
});
