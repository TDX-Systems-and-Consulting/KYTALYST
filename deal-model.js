/*
 * KYTALYST deal model — the ONE place the flip math lives.
 * Used by the deal page, the daily feed script and the Cloud Function.
 *
 * Projected profit =
 *     ARV × (1 − selling %)                      net sale proceeds
 *   − purchase × (1 + buy closing %)             purchase + acquisition closing
 *   − rehab
 *   − loan × (points % + rate × months ÷ 12)     financing (interest-only, full balance, conservative)
 *   − monthly holding × months                   taxes, insurance, utilities while you own it
 * where loan = purchase × loan-to-purchase % + rehab × rehab-financed %.
 *
 * Every term is linear in purchase price, so the maximum offer is solved exactly.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DealModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const defaults = Object.freeze({
    targetProfit: 30000,
    buyClosingPct: 3.5,        // acquisition closing costs, % of purchase
    commissionPct: 6,          // listing + buyer agent commissions, % of ARV
    concessionsPct: 3,         // buyer concessions / seller-paid closing help, % of ARV
    sellerClosingPct: 1.25,    // seller title, transfer and misc. closing, % of ARV
    financing: 'hardMoney',    // 'hardMoney' | 'cash'
    loanToPurchasePct: 90,     // lender covers this % of the purchase
    rehabFinancedPct: 100,     // lender covers this % of the rehab
    interestRatePct: 12,       // annual, interest-only
    pointsPct: 2,              // origination points on the loan
    holdMonths: 6,             // purchase to resale close
    monthlyHolding: 500        // taxes + insurance + utilities per month
  });

  const fields = {
    targetProfit:      { label: 'Target profit', min: 0, max: 10000000 },
    buyClosingPct:     { label: 'Buy closing costs %', min: 0, max: 25 },
    commissionPct:     { label: 'Agent commissions %', min: 0, max: 25 },
    concessionsPct:    { label: 'Buyer concessions %', min: 0, max: 25 },
    sellerClosingPct:  { label: 'Seller title & closing %', min: 0, max: 25 },
    loanToPurchasePct: { label: 'Loan % of purchase', min: 0, max: 100 },
    rehabFinancedPct:  { label: 'Loan % of rehab', min: 0, max: 100 },
    interestRatePct:   { label: 'Interest rate %', min: 0, max: 50 },
    pointsPct:         { label: 'Points %', min: 0, max: 20 },
    holdMonths:        { label: 'Months held', min: 0, max: 60 },
    monthlyHolding:    { label: 'Monthly holding cost', min: 0, max: 100000 }
  };

  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;

  function num(value, label, positive) {
    if (value === '' || value === null || value === undefined || typeof value === 'boolean') {
      throw new Error(label + ' is required.');
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || (positive && n === 0)) {
      throw new Error(label + ' must be ' + (positive ? 'greater than zero' : 'zero or greater') + '.');
    }
    return n;
  }

  /** Fill gaps with defaults and validate every assumption. */
  function normalize(input) {
    const src = Object.assign({}, defaults, input || {});
    const out = { financing: src.financing === 'cash' ? 'cash' : 'hardMoney' };
    Object.keys(fields).forEach(k => {
      const f = fields[k];
      const n = num(src[k], f.label);
      if (n < f.min || n > f.max) throw new Error(f.label + ' must be between ' + f.min + ' and ' + f.max + '.');
      out[k] = n;
    });
    return out;
  }

  function rates(a) {
    const sellPct = (a.commissionPct + a.concessionsPct + a.sellerClosingPct) / 100;
    const close = a.buyClosingPct / 100;
    const hm = a.financing === 'hardMoney';
    const lp = hm ? a.loanToPurchasePct / 100 : 0;
    const lr = hm ? a.rehabFinancedPct / 100 : 0;
    const f = hm ? a.pointsPct / 100 + (a.interestRatePct / 100) * a.holdMonths / 12 : 0;
    const hold = a.monthlyHolding * a.holdMonths;
    return { sellPct, close, lp, lr, f, hold };
  }

  /** Full breakdown for one deal. */
  function evaluate({ purchasePrice, arv, rehab, assumptions }) {
    const a = normalize(assumptions);
    const price = num(purchasePrice, 'Purchase price', true);
    const value = num(arv, 'ARV', true);
    const r = num(rehab, 'Rehab budget');
    const k = rates(a);

    const commissions = value * a.commissionPct / 100;
    const concessions = value * a.concessionsPct / 100;
    const sellerClosing = value * a.sellerClosingPct / 100;
    const sellingCosts = commissions + concessions + sellerClosing;
    const buyClosing = price * k.close;
    const loanAmount = price * k.lp + r * k.lr;
    const points = a.financing === 'hardMoney' ? loanAmount * a.pointsPct / 100 : 0;
    const interest = a.financing === 'hardMoney' ? loanAmount * (a.interestRatePct / 100) * a.holdMonths / 12 : 0;
    const financingCost = points + interest;
    const holdingCost = k.hold;
    const totalCost = price + buyClosing + r + financingCost + holdingCost + sellingCosts;
    const projectedProfit = value - totalCost;
    const cashNeeded = price + buyClosing + r + points + holdingCost + interest - loanAmount;

    const mao = (value * (1 - k.sellPct) - r * (1 + k.lr * k.f) - k.hold - a.targetProfit) / (1 + k.close + k.lp * k.f);

    return {
      assumptions: a,
      purchasePrice: round(price), arv: round(value), rehab: round(r),
      buyClosing: round(buyClosing),
      commissions: round(commissions), concessions: round(concessions), sellerClosing: round(sellerClosing),
      sellingCosts: round(sellingCosts),
      loanAmount: round(loanAmount), points: round(points), interest: round(interest),
      financingCost: round(financingCost), holdingCost: round(holdingCost),
      totalCost: round(totalCost),
      projectedProfit: round(projectedProfit),
      cashNeeded: round(Math.max(0, cashNeeded)),
      returnOnCash: cashNeeded > 0 ? round(projectedProfit / cashNeeded * 100) : null,
      mao: round(mao),
      isDeal: projectedProfit >= a.targetProfit
    };
  }

  /** Largest rehab that still hits the target profit at this price (daily feed headroom). */
  function maxRehab({ purchasePrice, arv, assumptions }) {
    const a = normalize(assumptions);
    const k = rates(a);
    return Math.floor((arv * (1 - k.sellPct) - purchasePrice * (1 + k.close + k.lp * k.f) - k.hold - a.targetProfit) / (1 + k.lr * k.f) + 1e-6);
  }

  return { defaults, fields, normalize, evaluate, maxRehab };
});
